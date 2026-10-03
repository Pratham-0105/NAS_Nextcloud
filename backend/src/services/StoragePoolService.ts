import { promises as fs } from 'node:fs';
import path from 'node:path';
import si from 'systeminformation';
import { env } from '../config/env.js';
import { validateUuid } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { DiscoveredStorageDevice, StoragePoolSummary, DeviceStatus } from '../types/index.js';
import { StorageDetector } from './StorageDetector.js';

export class StoragePoolService {
  private detector: StorageDetector;
  // Candidate devices selected by administrator for cloud usage
  private candidateDeviceIds: Set<string> = new Set([
    'a4b2c1d0-1111-4444-8888-000000000001',
    'b5c3d2e1-2222-5555-9999-000000000002',
  ]);

  constructor(detector: StorageDetector) {
    this.detector = detector;
  }

  /**
   * Returns complete inventory of devices, merged with candidate selection state.
   */
  public async getDevices(): Promise<DiscoveredStorageDevice[]> {
    const rawDevices = await this.detector.discoverDevices();

    return rawDevices.map((dev) => {
      const isCloudStorage = this.candidateDeviceIds.has(dev.uuid);
      return {
        ...dev,
        isCloudStorage,
        status: isCloudStorage ? ('ACTIVE' as DeviceStatus) : ('AVAILABLE' as DeviceStatus),
        mountPoint: isCloudStorage ? (dev.mountPoint || `/mnt/devices/${dev.deviceName}`) : null,
      };
    });
  }

  /**
   * Marks a physical device as candidate cloud storage.
   * SAFETY RULE: Does NOT format, wipe partitions, or execute unsafe mount commands.
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

    if (this.candidateDeviceIds.has(uuid)) {
      throw new Error('Device is already marked as cloud storage candidate');
    }

    this.candidateDeviceIds.add(uuid);
    logger.info(`[INFO] Administrator selected device ${target.deviceName} (${uuid}) as cloud candidate`);

    return {
      ...target,
      mountPoint: `/mnt/devices/${target.deviceName}`,
      isCloudStorage: true,
      status: 'ACTIVE',
    };
  }

  /**
   * Removes device from cloud candidate selection.
   */
  public async removeDeviceFromPool(uuid: string): Promise<DiscoveredStorageDevice> {
    if (!validateUuid(uuid)) {
      throw new Error('Invalid device UUID identifier');
    }

    if (!this.candidateDeviceIds.has(uuid)) {
      throw new Error('Device is not marked as cloud candidate');
    }

    const devices = await this.getDevices();
    const target = devices.find((d) => d.uuid === uuid);

    if (!target) {
      throw new Error(`Device with UUID ${uuid} not found`);
    }

    this.candidateDeviceIds.delete(uuid);
    logger.info(`[INFO] Device ${target.deviceName} (${uuid}) removed from cloud candidate pool`);

    return {
      ...target,
      mountPoint: null,
      isCloudStorage: false,
      status: 'AVAILABLE',
    };
  }

  /**
   * Computes the aggregated storage metrics, combining host filesystem data.
   */
  public async getPoolSummary(): Promise<StoragePoolSummary> {
    const devices = await this.getDevices();
    const active = devices.filter((d) => d.isCloudStorage);

    let totalBytes = active.reduce((acc, d) => acc + d.totalBytes, 0);
    let usedBytes = active.reduce((acc, d) => acc + d.usedBytes, 0);

    // Read real root filesystem if available
    try {
      const fsList = await si.fsSize();
      const rootFs = fsList.find((f) => f.mount === '/' || f.mount === '/System/Volumes/Data');
      if (rootFs && totalBytes === 0) {
        totalBytes = rootFs.size;
        usedBytes = rootFs.used;
      }
    } catch {
      // Fallback to active device summation
    }

    const freeBytes = Math.max(0, totalBytes - usedBytes);
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
}
