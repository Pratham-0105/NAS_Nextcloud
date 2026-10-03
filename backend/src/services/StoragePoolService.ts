import { validateUuid } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { 
  DiscoveredStorageDevice, 
  StoragePoolSummary, 
  DeviceStatus, 
  PartitionInfo,
  StoragePoolDTO,
  StoragePoolMemberDTO,
  StoragePoolStatusType
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
  public async getDevices(forceRefresh = false): Promise<DiscoveredStorageDevice[]> {
    try {
      const dbDevices = await prisma.storageDevice.findMany({
        where: { isCloudStorage: true },
        select: { uuid: true },
      });
      this.registeredDeviceIds = new Set(dbDevices.map((d) => d.uuid));
    } catch {
      // fallback to in-memory set
    }

    let rawDevices: DiscoveredStorageDevice[] = [];
    if (!forceRefresh && this.knownDevices.size > 0) {
      rawDevices = Array.from(this.knownDevices.values());
    } else {
      rawDevices = await this.detector.discoverDevices();
    }

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
   * Unregisters all non-system devices from cloud storage and resets all pools
   */
  public async unregisterAllDevices(): Promise<void> {
    try {
      await prisma.storageDevice.updateMany({
        where: { isSystemDisk: false },
        data: { isCloudStorage: false, status: 'AVAILABLE', updatedAt: new Date() },
      });
      await prisma.storagePoolMember.deleteMany({});
      await prisma.storagePool.updateMany({
        data: {
          totalBytes: BigInt(0),
          usedBytes: BigInt(0),
          freeBytes: BigInt(0),
          status: 'ACTIVE',
        },
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
   * Ensures default StoragePool exists in database
   */
  public async ensureDefaultPool(): Promise<any> {
    try {
      let pool = await prisma.storagePool.findFirst({
        where: { name: 'Primary Cloud Pool' },
      });
      if (!pool) {
        pool = await prisma.storagePool.create({
          data: {
            name: 'Primary Cloud Pool',
            status: 'ACTIVE',
            mountPoint: process.platform === 'linux' ? '/mnt/storage_pool' : '/Volumes/CloudPool',
            totalBytes: BigInt(0),
            usedBytes: BigInt(0),
            freeBytes: BigInt(0),
            filesystem: process.platform === 'linux' ? 'mergerfs' : 'virtual_pool',
            poolingMethod: process.platform === 'linux' ? 'MERGERFS' : 'VIRTUAL_POOL',
          },
        });
        logger.info(`[STORAGE POOL] Initialized default pool "${pool.name}" (${pool.id}).`);
      }
      return pool;
    } catch (err: any) {
      logger.error(`[STORAGE POOL] Error ensuring default pool: ${err.message}`);
      return null;
    }
  }

  /**
   * Returns all storage pools with their members and calculated capacities
   */
  public async getPools(): Promise<StoragePoolDTO[]> {
    await this.ensureDefaultPool();
    try {
      const pools = await prisma.storagePool.findMany({
        include: {
          members: {
            include: {
              device: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      return pools.map((p) => {
        const members: StoragePoolMemberDTO[] = p.members.map((m) => ({
          id: m.id,
          poolId: m.poolId,
          deviceId: m.device.uuid,
          deviceName: m.device.deviceName,
          deviceModel: m.device.deviceModel,
          deviceType: m.device.deviceType as any,
          transport: (m.device.transport as any) || 'Unknown',
          filesystem: m.device.filesystem,
          mountPoint: m.mountPoint || m.device.mountPoint,
          totalBytes: Number(m.device.totalBytes),
          usedBytes: Number(m.device.usedBytes),
          freeBytes: Number(m.device.freeBytes),
          status: m.status,
          hasExistingData: m.device.hasExistingData,
          addedAt: m.addedAt.toISOString(),
        }));

        const totalBytes = members.reduce((sum, m) => sum + m.totalBytes, 0);
        const usedBytes = members.reduce((sum, m) => sum + m.usedBytes, 0);
        const freeBytes = Math.max(0, totalBytes - usedBytes);

        return {
          id: p.id,
          name: p.name,
          status: p.status as StoragePoolStatusType,
          mountPoint: p.mountPoint,
          totalBytes,
          usedBytes,
          freeBytes,
          filesystem: p.filesystem,
          poolingMethod: p.poolingMethod,
          memberCount: members.length,
          members,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });
    } catch (err: any) {
      logger.error(`[STORAGE POOL] getPools error: ${err.message}`);
      return [];
    }
  }

  /**
   * Returns a specific storage pool by ID or Name
   */
  public async getPoolById(idOrName: string): Promise<StoragePoolDTO | null> {
    const pools = await this.getPools();
    return pools.find((p) => p.id === idOrName || p.name === idOrName) || null;
  }

  /**
   * Creates a new storage pool
   */
  public async createPool(data: { name: string; mountPoint?: string; poolingMethod?: string }): Promise<StoragePoolDTO> {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Storage pool name is required.');
    }

    const existing = await prisma.storagePool.findUnique({
      where: { name: data.name.trim() },
    });
    if (existing) {
      throw new Error(`A storage pool named "${data.name}" already exists.`);
    }

    const pool = await prisma.storagePool.create({
      data: {
        name: data.name.trim(),
        status: 'ACTIVE',
        mountPoint: data.mountPoint || (process.platform === 'linux' ? '/mnt/storage_pool' : '/Volumes/CloudPool'),
        poolingMethod: data.poolingMethod || (process.platform === 'linux' ? 'MERGERFS' : 'VIRTUAL_POOL'),
        filesystem: process.platform === 'linux' ? 'mergerfs' : 'virtual_pool',
      },
    });

    await prisma.storagePoolEvent.create({
      data: {
        poolId: pool.id,
        severity: 'INFO',
        eventType: 'storage.pool.created',
        message: `Storage pool "${pool.name}" created successfully.`,
      },
    });

    this.emitEvent('storage.pool.created', `Storage pool "${pool.name}" created`, undefined, { poolId: pool.id });

    return (await this.getPoolById(pool.id))!;
  }

  /**
   * Validates if a device is eligible to be added to a storage pool
   */
  public async validatePoolMember(
    poolId: string,
    deviceIdOrUuid: string
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    requiresConfirmation: boolean;
    device: DiscoveredStorageDevice | null;
  }> {
    const pool = await this.getPoolById(poolId);
    if (!pool) {
      return {
        valid: false,
        errors: [`Storage pool "${poolId}" does not exist.`],
        warnings: [],
        requiresConfirmation: false,
        device: null,
      };
    }

    const device = await this.getDeviceById(deviceIdOrUuid);
    if (!device) {
      return {
        valid: false,
        errors: [`Storage device "${deviceIdOrUuid}" not found.`],
        warnings: [],
        requiresConfirmation: false,
        device: null,
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    let requiresConfirmation = false;

    // ⚠️ Strict System Disk Rejection Guard
    if (device.isSystemDisk) {
      errors.push('CRITICAL: Operating system / boot disk cannot be added to a cloud storage pool.');
    }

    // Check if already in this pool
    const alreadyMember = pool.members.some((m) => m.deviceId === device.uuid || m.deviceName === device.deviceName);
    if (alreadyMember) {
      errors.push(`Device ${device.deviceName} is already a member of pool "${pool.name}".`);
    }

    // Read-only filesystem warning
    if (device.isReadOnly) {
      warnings.push(`Device ${device.deviceName} is currently mounted read-only.`);
    }

    // Existing data inspection
    if (device.hasExistingData) {
      warnings.push(
        `Device ${device.deviceName} contains existing files (~${(device.usedBytes / 1e9).toFixed(1)} GB). Explicit administrator confirmation required.`
      );
      requiresConfirmation = true;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      requiresConfirmation,
      device,
    };
  }

  /**
   * Adds an eligible physical or simulated storage device to a storage pool
   */
  public async addDeviceToPool(
    poolId: string,
    deviceIdOrUuid: string,
    options: { confirm?: boolean; confirmExistingData?: boolean } = {}
  ): Promise<StoragePoolDTO> {
    const validation = await this.validatePoolMember(poolId, deviceIdOrUuid);

    if (!validation.valid) {
      throw new Error(`Device validation failed: ${validation.errors.join('; ')}`);
    }

    if (validation.requiresConfirmation && !options.confirm && !options.confirmExistingData) {
      throw new Error(
        `Confirmation required: Device ${validation.device?.deviceName} contains existing data. Pass confirmExistingData=true to proceed non-destructively.`
      );
    }

    const device = validation.device!;

    // Ensure device is registered in cloud catalog
    if (!device.isCloudStorage) {
      await this.registerDevice(device.uuid, { confirmExistingData: true });
    }

    // Find DB record id for StorageDevice
    const dbDevice = await prisma.storageDevice.findUnique({
      where: { uuid: device.uuid },
    });
    if (!dbDevice) {
      throw new Error(`Database record for device ${device.uuid} not found.`);
    }

    // Add or update pool member
    await prisma.storagePoolMember.upsert({
      where: {
        poolId_deviceId: {
          poolId,
          deviceId: dbDevice.id,
        },
      },
      update: {
        status: 'ACTIVE',
        mountPoint: device.mountPoint || `/mnt/devices/${device.deviceName}`,
        lastSeenAt: new Date(),
      },
      create: {
        poolId,
        deviceId: dbDevice.id,
        status: 'ACTIVE',
        mountPoint: device.mountPoint || `/mnt/devices/${device.deviceName}`,
      },
    });

    // Update pool total bytes
    const updatedPool = await this.getPoolById(poolId);
    if (updatedPool) {
      await prisma.storagePool.update({
        where: { id: poolId },
        data: {
          totalBytes: BigInt(updatedPool.totalBytes),
          usedBytes: BigInt(updatedPool.usedBytes),
          freeBytes: BigInt(updatedPool.freeBytes),
          status: 'ACTIVE',
        },
      });

      await prisma.storagePoolEvent.create({
        data: {
          poolId,
          severity: 'INFO',
          eventType: 'storage.pool.member_added',
          message: `Device ${device.deviceModel || device.deviceName} (${device.deviceName}) added to pool "${updatedPool.name}".`,
          metadata: { deviceName: device.deviceName, totalBytes: device.totalBytes },
        },
      });

      this.emitEvent(
        'storage.pool.member_added',
        `Device ${device.deviceModel || device.deviceName} added to pool "${updatedPool.name}"`,
        device,
        { poolId, memberCount: updatedPool.memberCount }
      );
      this.emitEvent('storage.pool.updated', `Storage pool "${updatedPool.name}" updated`, undefined, { pool: updatedPool });
    }

    return (await this.getPoolById(poolId))!;
  }

  /**
   * Removes a member device from a storage pool
   */
  public async removeDeviceFromPool(poolId: string, deviceIdOrUuid: string): Promise<StoragePoolDTO> {
    const pool = await this.getPoolById(poolId);
    if (!pool) {
      throw new Error(`Storage pool "${poolId}" not found.`);
    }

    const member = pool.members.find(
      (m) => m.deviceId === deviceIdOrUuid || m.deviceName === deviceIdOrUuid || m.id === deviceIdOrUuid
    );
    if (!member) {
      throw new Error(`Device "${deviceIdOrUuid}" is not a member of pool "${pool.name}".`);
    }

    await prisma.storagePoolMember.delete({
      where: { id: member.id },
    });

    // Safely unregister device back to available
    try {
      await this.unregisterDevice(member.deviceId);
    } catch {
      // ignore if unregister already handled
    }

    const updatedPool = await this.getPoolById(poolId);
    if (updatedPool) {
      await prisma.storagePool.update({
        where: { id: poolId },
        data: {
          totalBytes: BigInt(updatedPool.totalBytes),
          usedBytes: BigInt(updatedPool.usedBytes),
          freeBytes: BigInt(updatedPool.freeBytes),
        },
      });

      await prisma.storagePoolEvent.create({
        data: {
          poolId,
          severity: 'WARNING',
          eventType: 'storage.pool.member_removed',
          message: `Device ${member.deviceName} removed from pool "${pool.name}".`,
        },
      });

      this.emitEvent('storage.pool.member_removed', `Device ${member.deviceName} removed from pool "${pool.name}"`, undefined, {
        poolId,
        deviceName: member.deviceName,
      });
      this.emitEvent('storage.pool.updated', `Storage pool "${pool.name}" updated`, undefined, { pool: updatedPool });
    }

    return (await this.getPoolById(poolId))!;
  }

  /**
   * Checks health of all members of a pool and updates status
   */
  public async checkPoolHealth(poolId: string): Promise<{
    status: StoragePoolStatusType;
    healthyMembers: number;
    degradedMembers: number;
    details: string;
  }> {
    const pool = await this.getPoolById(poolId);
    if (!pool) {
      throw new Error(`Storage pool "${poolId}" not found.`);
    }

    let healthyMembers = 0;
    let degradedMembers = 0;

    for (const member of pool.members) {
      const liveDevice = this.knownDevices.get(member.deviceId) || Array.from(this.knownDevices.values()).find(d => d.deviceName === member.deviceName);
      const isOnline = liveDevice && liveDevice.status !== 'UNAVAILABLE' && liveDevice.status !== 'DISCONNECTED';

      if (isOnline) {
        healthyMembers++;
      } else {
        degradedMembers++;
      }
    }

    let status: StoragePoolStatusType = 'ACTIVE';
    let details = 'All member drives are online and healthy.';

    if (pool.memberCount === 0) {
      status = 'ACTIVE';
      details = 'No member drives assigned yet. Pool ready for member addition.';
    } else if (degradedMembers > 0 && healthyMembers > 0) {
      status = 'DEGRADED';
      details = `WARNING: Storage pool is DEGRADED. ${degradedMembers} of ${pool.memberCount} member drive(s) are disconnected or unavailable!`;
      this.emitEvent('storage.pool.degraded', details, undefined, { poolId, degradedMembers, healthyMembers });
    } else if (degradedMembers > 0 && healthyMembers === 0) {
      status = 'UNAVAILABLE';
      details = 'CRITICAL: Storage pool is UNAVAILABLE. All member storage drives are offline!';
      this.emitEvent('storage.pool.unavailable', details, undefined, { poolId });
    }

    if (pool.status !== status) {
      await prisma.storagePool.update({
        where: { id: poolId },
        data: { status: status as any },
      });
      if (status === 'ACTIVE' && pool.status === 'DEGRADED') {
        this.emitEvent('storage.pool.recovered', `Storage pool "${pool.name}" recovered to normal operation.`, undefined, { poolId });
      }
    }

    return {
      status,
      healthyMembers,
      degradedMembers,
      details,
    };
  }

  /**
   * Starts a storage pool
   */
  public async startPool(poolId: string): Promise<StoragePoolDTO> {
    await prisma.storagePool.update({
      where: { id: poolId },
      data: { status: 'ACTIVE' },
    });
    this.emitEvent('storage.pool.started', `Storage pool started`, undefined, { poolId });
    return (await this.getPoolById(poolId))!;
  }

  /**
   * Stops a storage pool
   */
  public async stopPool(poolId: string): Promise<StoragePoolDTO> {
    await prisma.storagePool.update({
      where: { id: poolId },
      data: { status: 'STOPPED' },
    });
    this.emitEvent('storage.pool.stopped', `Storage pool stopped`, undefined, { poolId });
    return (await this.getPoolById(poolId))!;
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
    // Check all pools health
    const pools = await this.getPools();
    for (const p of pools) {
      await this.checkPoolHealth(p.id);
    }
    return removed;
  }
}

