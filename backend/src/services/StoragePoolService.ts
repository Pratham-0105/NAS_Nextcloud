import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { safeExec, validateDevicePath, validateUuid } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { DiscoveredStorageDevice, StoragePoolSummary, DeviceStatus } from '../types/index.js';
import { StorageDetector } from './StorageDetector.js';

export class StoragePoolService {
  private detector: StorageDetector;
  private activeDeviceIds: Set<string> = new Set([
    'a4b2c1d0-1111-4444-8888-000000000001',
    'b5c3d2e1-2222-5555-9999-000000000002',
  ]);

  constructor(detector: StorageDetector) {
    this.detector = detector;
  }

  /**
   * Returns complete inventory of devices, merged with pool membership state.
   */
  public async getDevices(): Promise<DiscoveredStorageDevice[]> {
    const rawDevices = await this.detector.discoverDevices();

    return rawDevices.map((dev) => {
      const isCloudStorage = this.activeDeviceIds.has(dev.uuid);
      return {
        ...dev,
        isCloudStorage,
        status: isCloudStorage ? ('ACTIVE' as DeviceStatus) : ('AVAILABLE' as DeviceStatus),
        mountPoint: isCloudStorage ? (dev.mountPoint || `/mnt/devices/${dev.deviceName}`) : null,
      };
    });
  }

  /**
   * Adds a physical storage device to the cloud storage pool.
   */
  public async addDeviceToPool(uuid: string): Promise<DiscoveredStorageDevice> {
    if (!validateUuid(uuid)) {
      throw new Error('Invalid device UUID identifier');
    }

    const devices = await this.getDevices();
    const target = devices.find((d) => d.uuid === uuid);

    if (!target) {
      throw new Error(`Device with UUID ${uuid} not found`);
    }

    if (this.activeDeviceIds.has(uuid)) {
      throw new Error('Device is already active in the cloud storage pool');
    }

    const mountPoint = path.join(env.PHYSICAL_DEVICES_MOUNT_DIR, `dev-${target.deviceName}`);

    if (!env.SIMULATE_STORAGE) {
      if (!validateDevicePath(target.devicePath)) {
        throw new Error('Unsafe device path specified');
      }

      await fs.mkdir(mountPoint, { recursive: true });

      // Safely mount block device
      await safeExec('mount', [target.devicePath, mountPoint]);

      // Refresh mergerfs pool
      await this.refreshMergerfsPool();
    }

    this.activeDeviceIds.add(uuid);
    logger.info(`Successfully added storage device ${target.deviceName} (${uuid}) to pool`);

    return {
      ...target,
      mountPoint,
      isCloudStorage: true,
      status: 'ACTIVE',
    };
  }

  /**
   * Safely removes a storage device from the cloud storage pool.
   */
  public async removeDeviceFromPool(uuid: string): Promise<DiscoveredStorageDevice> {
    if (!validateUuid(uuid)) {
      throw new Error('Invalid device UUID identifier');
    }

    if (!this.activeDeviceIds.has(uuid)) {
      throw new Error('Device is not active in the storage pool');
    }

    const devices = await this.getDevices();
    const target = devices.find((d) => d.uuid === uuid);

    if (!target) {
      throw new Error(`Device with UUID ${uuid} not found`);
    }

    if (!env.SIMULATE_STORAGE && target.mountPoint) {
      // Unmount safely
      await safeExec('umount', [target.mountPoint]);
      await this.refreshMergerfsPool();
    }

    this.activeDeviceIds.delete(uuid);
    logger.info(`Successfully removed storage device ${target.deviceName} (${uuid}) from pool`);

    return {
      ...target,
      mountPoint: null,
      isCloudStorage: false,
      status: 'AVAILABLE',
    };
  }

  /**
   * Computes the aggregated storage pool metrics.
   */
  public async getPoolSummary(): Promise<StoragePoolSummary> {
    const devices = await this.getDevices();
    const active = devices.filter((d) => d.isCloudStorage);

    const totalBytes = active.reduce((acc, d) => acc + d.totalBytes, 0);
    const usedBytes = active.reduce((acc, d) => acc + d.usedBytes, 0);
    const freeBytes = totalBytes - usedBytes;
    const percentUsed = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (percentUsed >= 95) {
      status = 'CRITICAL';
    } else if (percentUsed >= 85) {
      status = 'DEGRADED';
    }

    return {
      totalBytes,
      usedBytes,
      freeBytes,
      percentUsed,
      activeDeviceCount: active.length,
      status,
    };
  }

  /**
   * Reconfigures mergerfs union mount with currently active branches.
   */
  private async refreshMergerfsPool(): Promise<void> {
    const devices = await this.getDevices();
    const activeBranches = devices
      .filter((d) => d.isCloudStorage && d.mountPoint)
      .map((d) => `${d.mountPoint}=RW`);

    if (activeBranches.length === 0) {
      logger.warn('No active branches remain for mergerfs pool');
      return;
    }

    const branchesArg = activeBranches.join(':');
    logger.info(`Re-mounting mergerfs pool at ${env.STORAGE_POOL_PATH} with branches: ${branchesArg}`);

    // mergerfs options:
    // - category.create=mfs (most free space): write new files to drive with highest available free space
    // - cache.files=off (direct I/O so disk disconnect doesn't corrupt stale cache)
    // - allow_other (allows Docker container uid 33 Nextcloud to read/write)
    await safeExec('mergerfs', [
      '-o', 'category.create=mfs,cache.files=off,allow_other,fsname=cloud_storage_pool',
      branchesArg,
      env.STORAGE_POOL_PATH,
    ]);
  }
}
