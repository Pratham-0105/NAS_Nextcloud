import { validateUuid } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { 
  DiscoveredStorageDevice, 
  StoragePoolSummary, 
  DeviceStatus, 
  PartitionInfo 
} from '../types/index.js';
import { StorageDetector } from './StorageDetector.js';
import { prisma } from '../db/prisma.js';

export interface StorageEventPayload {
  eventType: string;
  deviceId?: string;
  deviceName?: string;
  message: string;
  data?: any;
  timestamp: string;
}

export class StoragePoolService {
  private detector: StorageDetector;
  // Dynamic set of registered UUIDs backed by database (starts empty, no hardcoded devices)
  private registeredDeviceIds: Set<string> = new Set();

  private eventListeners: ((event: StorageEventPayload) => void)[] = [];
  private knownDevices: Map<string, DiscoveredStorageDevice> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(detector: StorageDetector) {
    this.detector = detector;
    this.initDatabaseState();
    this.startHardwarePolling();
  }

  private async initDatabaseState(): Promise<void> {
    try {
      const dbDevices = await prisma.storageDevice.findMany({
        where: { isCloudStorage: true },
        select: { uuid: true },
      });
      for (const d of dbDevices) {
        this.registeredDeviceIds.add(d.uuid);
      }
      logger.info(`[STORAGE POOL] Loaded ${this.registeredDeviceIds.size} registered cloud devices from database.`);
    } catch {
      // In-memory fallback if DB is booting
    }
  }

  public onEvent(callback: (event: StorageEventPayload) => void): void {
    this.eventListeners.push(callback);
  }

  public emitEvent(eventType: string, message: string, device?: DiscoveredStorageDevice, data?: any): void {
    const payload: StorageEventPayload = {
      eventType,
      deviceId: device?.uuid,
      deviceName: device?.deviceName,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    logger.info(`[STORAGE EVENT] ${eventType}: ${message}`);
    for (const listener of this.eventListeners) {
      try {
        listener(payload);
      } catch (err) {
        // ignore callback error
      }
    }
  }

  /**
   * Periodic polling for hardware changes (Hot-plug and disconnect detection)
   */
  private startHardwarePolling(): void {
    // Initial discovery load
    this.pollDevices().catch(() => {});

    // Periodic detection every 4 seconds
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollDevices();
      } catch (err) {
        // ignore poll errors
      }
    }, 4000);
  }

  public stopHardwarePolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Detects new or removed hardware devices and updates database/events
   */
  public async pollDevices(): Promise<DiscoveredStorageDevice[]> {
    let currentList: DiscoveredStorageDevice[] = [];
    try {
      currentList = await this.detector.discoverDevices();
    } catch (err: any) {
      logger.error(`[STORAGE DETECTOR] Hardware discovery error: ${err.message}`);
      return [];
    }

    const currentMap = new Map<string, DiscoveredStorageDevice>();

    for (const dev of currentList) {
      currentMap.set(dev.uuid, dev);

      // Check if newly connected (HOT-PLUG)
      if (this.knownDevices.size > 0 && !this.knownDevices.has(dev.uuid)) {
        this.emitEvent(
          'storage.device.detected',
          `New storage device detected: ${dev.deviceModel || dev.deviceName} (${dev.deviceName}) [${dev.filesystem || 'raw'}]`,
          dev
        );
      }
    }

    // Check for disconnected devices
    for (const [uuid, prevDev] of this.knownDevices.entries()) {
      if (!currentMap.has(uuid)) {
        const isReg = this.registeredDeviceIds.has(uuid);
        if (isReg) {
          this.emitEvent(
            'storage.device.unavailable',
            `CRITICAL: Registered storage device ${prevDev.deviceModel || prevDev.deviceName} (${prevDev.deviceName}) disconnected or unavailable. Check physical connection.`,
            prevDev
          );
        } else {
          this.emitEvent(
            'storage.device.removed',
            `Storage device disconnected: ${prevDev.deviceModel || prevDev.deviceName} (${prevDev.deviceName})`,
            prevDev
          );
        }

        // Update DB status if disconnected
        try {
          await prisma.storageDevice.updateMany({
            where: { uuid },
            data: { status: isReg ? 'UNAVAILABLE' : 'DISCONNECTED', lastSeenAt: new Date() },
          });
        } catch {
          // ignore DB error
        }
      }
    }

    this.knownDevices = currentMap;

    try {
      const dbDevices = await prisma.storageDevice.findMany({
        where: { isCloudStorage: true },
        select: { uuid: true },
      });
      this.registeredDeviceIds = new Set(dbDevices.map((d) => d.uuid));
    } catch {
      // ignore
    }

    // Persist discovered devices into PostgreSQL database
    for (const dev of currentList) {
      try {
        const isRegistered = this.registeredDeviceIds.has(dev.uuid);
        const status = dev.isSystemDisk 
          ? 'INSPECTED' 
          : isRegistered 
            ? 'REGISTERED' 
            : 'AVAILABLE';

        await prisma.storageDevice.upsert({
          where: { uuid: dev.uuid },
          update: {
            deviceName: dev.deviceName,
            devicePath: dev.devicePath,
            deviceModel: dev.deviceModel,
            vendor: dev.vendor,
            model: dev.model,
            serial: dev.serial,
            deviceType: dev.deviceType as any,
            transport: dev.transport,
            detectionSource: dev.detectionSource,
            filesystem: dev.filesystem,
            totalBytes: BigInt(dev.totalBytes),
            usedBytes: BigInt(dev.usedBytes),
            freeBytes: BigInt(dev.freeBytes),
            mountPoint: dev.mountPoint,
            isRemovable: dev.isRemovable,
            isRotational: dev.isRotational,
            isReadOnly: dev.isReadOnly,
            isSystemDisk: dev.isSystemDisk,
            hasExistingData: dev.hasExistingData,
            partitions: dev.partitions as any,
            isCloudStorage: isRegistered,
            status: status as any,
            lastSeenAt: new Date(),
          },
          create: {
            deviceName: dev.deviceName,
            devicePath: dev.devicePath,
            deviceModel: dev.deviceModel,
            vendor: dev.vendor,
            model: dev.model,
            serial: dev.serial,
            deviceType: dev.deviceType as any,
            transport: dev.transport,
            detectionSource: dev.detectionSource,
            filesystem: dev.filesystem,
            uuid: dev.uuid,
            totalBytes: BigInt(dev.totalBytes),
            usedBytes: BigInt(dev.usedBytes),
            freeBytes: BigInt(dev.freeBytes),
            mountPoint: dev.mountPoint,
            isRemovable: dev.isRemovable,
            isRotational: dev.isRotational,
            isReadOnly: dev.isReadOnly,
            isSystemDisk: dev.isSystemDisk,
            hasExistingData: dev.hasExistingData,
            partitions: dev.partitions as any,
            isCloudStorage: isRegistered,
            status: status as any,
          },
        });
      } catch (err) {
        // Fallback to in-memory if DB is temporarily starting
      }
    }

    return currentList;
  }

  /**
   * Returns all discovered devices merged with registration states
   */
  public async getDevices(): Promise<DiscoveredStorageDevice[]> {
    try {
      const dbDevices = await prisma.storageDevice.findMany({
        where: { isCloudStorage: true },
        select: { uuid: true },
      });
      this.registeredDeviceIds = new Set(dbDevices.map((d) => d.uuid));
    } catch {
      // fallback to in-memory set
    }

    const rawDevices = await this.detector.discoverDevices();

    return rawDevices.map((dev) => {
      const isRegistered = this.registeredDeviceIds.has(dev.uuid) && !dev.isSystemDisk;
      let status: DeviceStatus = dev.status;

      if (dev.isSystemDisk) {
        status = 'INSPECTED';
      } else if (isRegistered) {
        status = 'REGISTERED';
      } else {
        status = 'AVAILABLE';
      }

      return {
        ...dev,
        isCloudStorage: isRegistered,
        status: status,
      };
    });
  }

  /**
   * Returns a specific device by UUID or name
   */
  public async getDeviceById(idOrUuid: string): Promise<DiscoveredStorageDevice | null> {
    const devices = await this.getDevices();
    return devices.find((d) => d.uuid === idOrUuid || d.deviceName === idOrUuid) || null;
  }

  /**
   * Returns partition hierarchy of a specific device
   */
  public async getDevicePartitions(idOrUuid: string): Promise<PartitionInfo[]> {
    const device = await this.getDeviceById(idOrUuid);
    if (!device) {
      throw new Error(`Device "${idOrUuid}" not found.`);
    }
    return device.partitions || [];
  }

  /**
   * Returns devices eligible for registration (Excludes protected system disks and already registered disks)
   */
  public async getEligibleDevices(): Promise<DiscoveredStorageDevice[]> {
    const devices = await this.getDevices();
    return devices.filter((d) => !d.isSystemDisk && !d.isCloudStorage && !d.isReadOnly);
  }

  /**
   * Returns pool candidate devices (Alias for mergerfs service layer)
   */
  public async getPoolCandidates(): Promise<DiscoveredStorageDevice[]> {
    return this.getEligibleDevices();
  }

  /**
   * Returns currently registered devices
   */
  public async getRegisteredDevices(): Promise<DiscoveredStorageDevice[]> {
    const devices = await this.getDevices();
    return devices.filter((d) => d.isCloudStorage);
  }

  /**
   * Returns pool total capacity across all registered devices
   */
  public async getPoolCapacity(): Promise<{ totalBytes: number; usedBytes: number; freeBytes: number }> {
    const registered = await this.getRegisteredDevices();
    const totalBytes = registered.reduce((sum, d) => sum + d.totalBytes, 0);
    const usedBytes = registered.reduce((sum, d) => sum + d.usedBytes, 0);
    return {
      totalBytes,
      usedBytes,
      freeBytes: Math.max(0, totalBytes - usedBytes),
    };
  }

  /**
   * Registers a physical storage device for cloud storage.
   * CRITICAL SAFETY RULE:
   * 1. REJECTS operating system disks with an exception.
   * 2. Does NOT format, wipe, or modify partitions.
   * 3. Changes only the registration state in the database catalog.
   */
  public async registerDevice(uuid: string, options: { confirmExistingData?: boolean } = {}): Promise<DiscoveredStorageDevice> {
    if (!validateUuid(uuid)) {
      throw new Error('Invalid device UUID identifier format.');
    }

    const device = await this.getDeviceById(uuid);
    if (!device) {
      throw new Error(`Device with UUID ${uuid} not found.`);
    }

    // ⚠️ CRITICAL OS PROTECTION CHECK
    if (device.isSystemDisk) {
      throw new Error(
        'PROTECTED DISK: Operating system and application disks cannot be registered for cloud storage.'
      );
    }

    if (this.registeredDeviceIds.has(uuid)) {
      throw new Error(`Device ${device.deviceName} is already registered as cloud storage.`);
    }

    // Existing Data Safety Guard
    if (device.hasExistingData && !options.confirmExistingData) {
      logger.info(`[INFO] Device ${device.deviceName} contains existing data. Preserving all files without formatting.`);
    }

    // Update state to REGISTERED
    this.registeredDeviceIds.add(uuid);

    const updated: DiscoveredStorageDevice = {
      ...device,
      isCloudStorage: true,
      status: 'REGISTERED',
    };

    // Update PostgreSQL database
    try {
      await prisma.storageDevice.update({
        where: { uuid },
        data: {
          isCloudStorage: true,
          status: 'REGISTERED',
          updatedAt: new Date(),
        },
      });
    } catch {
      // ignore if DB is offline
    }

    this.emitEvent(
      'storage.device.registered',
      `Device ${device.deviceModel || device.deviceName} (${device.deviceName}) registered for cloud storage.`,
      updated
    );

    return updated;
  }

  /**
   * Unregisters a storage device from cloud storage.
   * SAFETY: Preserves all files and partitions intact.
   */
  public async unregisterDevice(uuid: string): Promise<DiscoveredStorageDevice> {
    if (!validateUuid(uuid)) {
      throw new Error('Invalid device UUID identifier format.');
    }

    const device = await this.getDeviceById(uuid);
    if (!device) {
      throw new Error(`Device with UUID ${uuid} not found.`);
    }

    if (!this.registeredDeviceIds.has(uuid)) {
      throw new Error(`Device ${device.deviceName} is not currently registered.`);
    }

    this.registeredDeviceIds.delete(uuid);

    const updated: DiscoveredStorageDevice = {
      ...device,
      isCloudStorage: false,
      status: 'AVAILABLE',
    };

    // Update PostgreSQL database
    try {
      await prisma.storageDevice.update({
        where: { uuid },
        data: {
          isCloudStorage: false,
          status: 'AVAILABLE',
          updatedAt: new Date(),
        },
      });
    } catch {
      // ignore
    }

    this.emitEvent(
      'storage.device.removed',
      `Device ${device.deviceModel || device.deviceName} (${device.deviceName}) unregistered from cloud storage.`,
      updated
    );

    return updated;
  }

  /**
   * Calculates real storage pool capacity based on registered devices.
   */
  public async getPoolSummary(): Promise<StoragePoolSummary> {
    const devices = await this.getDevices();
    const registered = devices.filter((d) => d.isCloudStorage);

    const totalBytes = registered.reduce((acc, d) => acc + d.totalBytes, 0);
    const usedBytes = registered.reduce((acc, d) => acc + d.usedBytes, 0);
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
      activeDeviceCount: registered.length,
      registeredDeviceCount: registered.length,
      status,
    };
  }

  /**
   * Unregisters all non-system devices from cloud storage
   */
  public async unregisterAllDevices(): Promise<void> {
    try {
      await prisma.storageDevice.updateMany({
        where: { isSystemDisk: false },
        data: { isCloudStorage: false, status: 'AVAILABLE', updatedAt: new Date() },
      });
    } catch {
      // ignore DB offline
    }
    this.registeredDeviceIds.clear();
    await this.pollDevices();
  }

  public clearRegisteredDevices(): void {
    this.registeredDeviceIds.clear();
  }

  /**
   * Helper for simulating hot-plugging a new USB/SSD device
   */
  public async simulateHotPlug(device: DiscoveredStorageDevice): Promise<DiscoveredStorageDevice> {
    this.detector.addSimulatedDevice(device);
    await this.pollDevices();
    return device;
  }

  /**
   * Helper for simulating unplugging/removing a storage device
   */
  public async simulateDisconnect(uuidOrName: string): Promise<DiscoveredStorageDevice | null> {
    const removed = this.detector.removeSimulatedDevice(uuidOrName);
    await this.pollDevices();
    return removed;
  }
}
