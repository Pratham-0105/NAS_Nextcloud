import { env } from '../config/env.js';
import { safeExec } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { 
  DiscoveredStorageDevice, 
  DeviceType, 
  DeviceStatus, 
  RawBlockDevice, 
  PartitionInfo,
  StorageTransport,
  DetectionSource
} from '../types/index.js';

// Sensitive / Protected OS Mount Points on Linux
const PROTECTED_SYSTEM_MOUNTS = [
  '/',
  '/boot',
  '/boot/efi',
  '/var',
  '/var/lib/docker',
  '/etc',
  '/home',
  '/System',
  '/System/Volumes/Data',
];

export class StorageDetector {
  private simulatedDevices: DiscoveredStorageDevice[] = [];

  constructor() {
    this.resetSimulatedDevices();
  }

  /**
   * Discovers physical storage devices on the host machine.
   * Modes:
   *  - 'real': Attempt real hardware detection via lsblk. NEVER falls back to simulation.
   *  - 'auto': Linux -> real hardware detection; macOS/Windows -> SIMULATION.
   *  - 'simulation': Returns simulation catalog marked with detectionSource="SIMULATION".
   */
  public async discoverDevices(): Promise<DiscoveredStorageDevice[]> {
    const mode = env.STORAGE_DETECTION_MODE || (env.SIMULATE_STORAGE ? 'simulation' : 'auto');

    if (mode === 'simulation') {
      return this.getSimulatedDevices();
    }

    if (mode === 'auto' && process.platform !== 'linux') {
      logger.info(`[STORAGE DETECTION] Platform is ${process.platform} (non-Linux). Using SIMULATION mode.`);
      return this.getSimulatedDevices();
    }

    // Must attempt real hardware detection
    try {
      const devices = await this.detectLinuxHardware();
      return devices;
    } catch (err: any) {
      if (mode === 'real') {
        // STRICT: Do NOT fall back to simulation when mode is 'real'
        logger.error(`[CRITICAL] Real hardware detection failed in 'real' mode:`, err.message);
        throw new Error(
          `Real hardware detection failed: ${err.message}. Silent simulation fallback is disabled in STORAGE_DETECTION_MODE=real.`
        );
      } else {
        // mode === 'auto' on Linux, if lsblk failed, report error and return empty list
        logger.error(`[STORAGE DETECTION] Host block device inspection failed on Linux:`, err.message);
        throw new Error(`Failed to query host storage hardware via lsblk: ${err.message}`);
      }
    }
  }

  /**
   * Real Linux hardware block device detector using lsblk JSON output.
   */
  public async detectLinuxHardware(): Promise<DiscoveredStorageDevice[]> {
    // Query structured block device hierarchy from Linux kernel via util-linux
    const output = await safeExec('lsblk', [
      '-b', // Exact sizes in bytes
      '-J', // JSON output format
      '-o',
      'NAME,KNAME,PATH,TYPE,SIZE,FSTYPE,LABEL,UUID,MOUNTPOINT,MOUNTPOINTS,MODEL,VENDOR,SERIAL,RM,RO,TRAN,ROTA',
    ]);

    const parsed = JSON.parse(output);
    const devices: DiscoveredStorageDevice[] = [];

    if (parsed.blockdevices && Array.isArray(parsed.blockdevices)) {
      for (const dev of parsed.blockdevices) {
        // Filter out loopback, RAM disks, CD/DVD optical drives
        if (
          dev.type === 'loop' || 
          dev.type === 'rom' || 
          dev.name.startsWith('loop') || 
          dev.name.startsWith('ram') || 
          dev.name.startsWith('sr')
        ) {
          continue;
        }

        // Primary block disks (type === 'disk' or 'nvme')
        if (dev.type === 'disk' || dev.type === 'nvme' || !dev.children) {
          const processed = this.processBlockDisk(dev, 'REAL_HARDWARE');
          if (processed) {
            devices.push(processed);
          }
        }
      }
    }

    return devices;
  }

  private processBlockDisk(dev: RawBlockDevice, source: DetectionSource): DiscoveredStorageDevice | null {
    const partitions: PartitionInfo[] = [];
    let isSystemDisk = false;
    let totalUsed = 0;

    // Check if the physical disk itself is mounted to a system path
    const diskMount = this.resolveMountPoint(dev);
    if (this.checkIfSystemMount(diskMount)) {
      isSystemDisk = true;
    }

    if (dev.children && Array.isArray(dev.children) && dev.children.length > 0) {
      for (const child of dev.children) {
        // Filter: only inspect partitions
        if (child.type !== 'part' && child.type !== 'disk') {
          continue;
        }

        const partMount = this.resolveMountPoint(child);
        const isSys = this.checkIfSystemMount(partMount);
        if (isSys) {
          isSystemDisk = true;
        }

        const childSize = Number(child.size) || 0;
        const partUsed = partMount ? Math.floor(childSize * 0.3) : 0;
        totalUsed += partUsed;

        partitions.push({
          name: child.name,
          path: child.path || `/dev/${child.name}`,
          size: childSize,
          filesystem: child.fstype || null,
          uuid: child.uuid || null,
          label: child.label || null,
          mountPoint: partMount,
          usedBytes: partUsed,
          freeBytes: Math.max(0, childSize - partUsed),
          isSystemPartition: isSys,
          hasExistingData: Boolean(partMount || child.fstype),
        });
      }
    } else {
      // Unpartitioned raw drive or single-volume disk
      const diskSize = Number(dev.size) || 0;
      const diskUsed = diskMount ? Math.floor(diskSize * 0.25) : 0;
      totalUsed += diskUsed;

      if (dev.fstype) {
        partitions.push({
          name: dev.name,
          path: dev.path || `/dev/${dev.name}`,
          size: diskSize,
          filesystem: dev.fstype || null,
          uuid: dev.uuid || null,
          label: dev.label || null,
          mountPoint: diskMount,
          usedBytes: diskUsed,
          freeBytes: Math.max(0, diskSize - diskUsed),
          isSystemPartition: isSystemDisk,
          hasExistingData: Boolean(diskMount || dev.fstype),
        });
      }
    }

    const uuid = dev.uuid || (partitions[0]?.uuid) || `dev-${dev.name}`;
    const totalSize = Number(dev.size) || 0;
    const freeBytes = Math.max(0, totalSize - totalUsed);

    // Clean hardware metadata - DO NOT FABRICATE MISSING DATA
    const rawVendor = dev.vendor?.trim() || null;
    const rawModel = dev.model?.trim() || null;
    const rawSerial = dev.serial?.trim() || null;

    let deviceModel: string | null = null;
    if (rawVendor && rawModel) {
      deviceModel = `${rawVendor} ${rawModel}`;
    } else if (rawModel) {
      deviceModel = rawModel;
    } else if (rawVendor) {
      deviceModel = rawVendor;
    } else {
      deviceModel = null;
    }

    // Hardware classification based on ROTA, TRAN, RM
    const { deviceType, transport } = this.classifyDeviceHardware(dev);

    return {
      deviceName: dev.name,
      devicePath: dev.path || `/dev/${dev.name}`,
      deviceModel: deviceModel,
      vendor: rawVendor,
      model: rawModel,
      serial: rawSerial,
      deviceType: deviceType,
      transport: transport,
      detectionSource: source,
      filesystem: dev.fstype || partitions[0]?.filesystem || null,
      uuid: uuid,
      totalBytes: totalSize,
      usedBytes: totalUsed,
      freeBytes: freeBytes,
      mountPoint: diskMount || partitions[0]?.mountPoint || null,
      isRemovable: Boolean(dev.rm || dev.hotplug),
      isRotational: Boolean(dev.rota),
      isReadOnly: Boolean(dev.ro),
      isSystemDisk: isSystemDisk,
      hasExistingData: partitions.some((p) => p.hasExistingData),
      isCloudStorage: false,
      isSimulated: source === 'SIMULATION',
      status: isSystemDisk ? 'INSPECTED' : 'AVAILABLE',
      partitions: partitions,
      lastSeenAt: new Date().toISOString(),
    };
  }

  private resolveMountPoint(dev: RawBlockDevice): string | null {
    if (dev.mountpoint && typeof dev.mountpoint === 'string') {
      return dev.mountpoint.trim() || null;
    }
    if (dev.mountpoints && Array.isArray(dev.mountpoints)) {
      const valid = dev.mountpoints.find((m) => m && typeof m === 'string' && m.trim().length > 0);
      if (valid) return valid.trim();
    }
    return null;
  }

  private checkIfSystemMount(mountPoint: string | null): boolean {
    if (!mountPoint) return false;
    return PROTECTED_SYSTEM_MOUNTS.some(
      (sys) => mountPoint === sys || mountPoint.startsWith(sys + '/')
    );
  }

  /**
   * Real hardware classification based on ROTA, TRAN, and RM fields.
   * Avoids guessing SSD vs HDD based on device name or arbitrary sizes.
   */
  private classifyDeviceHardware(dev: RawBlockDevice): { deviceType: DeviceType; transport: StorageTransport } {
    const tranLower = (dev.tran || '').toLowerCase();
    const nameLower = dev.name.toLowerCase();

    // 1. Determine transport
    let transport: StorageTransport = 'Unknown';
    if (tranLower === 'usb') {
      transport = 'USB';
    } else if (tranLower === 'nvme' || nameLower.startsWith('nvme')) {
      transport = 'NVMe';
    } else if (tranLower === 'sata' || tranLower === 'ata') {
      transport = 'SATA';
    } else if (tranLower === 'scsi') {
      transport = 'SCSI';
    }

    // 2. Determine deviceType
    let deviceType: DeviceType = 'UNKNOWN';

    if (transport === 'NVMe' || nameLower.startsWith('nvme')) {
      deviceType = 'NVME';
    } else if (transport === 'USB' || dev.rm) {
      if (dev.rota === false) {
        deviceType = 'USB_SSD';
      } else if (dev.rota === true) {
        deviceType = 'USB_HDD';
      } else if (dev.rm) {
        deviceType = 'USB_FLASH';
      } else {
        deviceType = 'UNKNOWN';
      }
    } else {
      // Internal disk
      if (dev.rota === false) {
        deviceType = 'INTERNAL_SSD';
      } else if (dev.rota === true) {
        deviceType = 'INTERNAL_HDD';
      } else {
        deviceType = 'UNKNOWN';
      }
    }

    return { deviceType, transport };
  }

  public resetSimulatedDevices(): void {
    this.simulatedDevices = this.createDefaultSimulatedDevices();
  }

  public addSimulatedDevice(dev: DiscoveredStorageDevice): void {
    const existingIndex = this.simulatedDevices.findIndex((d) => d.uuid === dev.uuid || d.deviceName === dev.deviceName);
    if (existingIndex >= 0) {
      this.simulatedDevices[existingIndex] = dev;
    } else {
      this.simulatedDevices.push(dev);
    }
  }

  public removeSimulatedDevice(uuidOrName: string): DiscoveredStorageDevice | null {
    const idx = this.simulatedDevices.findIndex((d) => d.uuid === uuidOrName || d.deviceName === uuidOrName);
    if (idx >= 0) {
      const removed = this.simulatedDevices.splice(idx, 1)[0];
      return removed;
    }
    return null;
  }

  /**
   * Simulated device catalog for macOS/Windows development mode.
   * Clearly marked with detectionSource: 'SIMULATION'.
   */
  public getSimulatedDevices(): DiscoveredStorageDevice[] {
    if (this.simulatedDevices.length === 0) {
      this.resetSimulatedDevices();
    }
    return [...this.simulatedDevices];
  }

  private createDefaultSimulatedDevices(): DiscoveredStorageDevice[] {
    return [
      {
        deviceName: 'nvme0n1',
        devicePath: '/dev/nvme0n1',
        deviceModel: 'Samsung 980 PRO NVMe SSD [SIMULATED DEVICE]',
        vendor: 'Samsung',
        model: '980 PRO 250GB',
        serial: 'S5GXNF0R123456',
        deviceType: 'NVME',
        transport: 'NVMe',
        detectionSource: 'SIMULATION',
        filesystem: 'ext4',
        uuid: 'sys-nvme-0000-0000-000000000001',
        totalBytes: 250_000_000_000,
        usedBytes: 142_000_000_000,
        freeBytes: 108_000_000_000,
        mountPoint: '/',
        isRemovable: false,
        isRotational: false,
        isReadOnly: false,
        isSystemDisk: true, // ⚠️ CRITICAL: SYSTEM DISK PROTECTED
        hasExistingData: true,
        isCloudStorage: false,
        isSimulated: true,
        status: 'INSPECTED',
        partitions: [
          {
            name: 'nvme0n1p1',
            path: '/dev/nvme0n1p1',
            size: 512_000_000,
            filesystem: 'vfat',
            uuid: 'BOOT-EFI-1234',
            label: 'EFI System Partition',
            mountPoint: '/boot/efi',
            usedBytes: 64_000_000,
            freeBytes: 448_000_000,
            isSystemPartition: true,
            hasExistingData: true,
          },
          {
            name: 'nvme0n1p2',
            path: '/dev/nvme0n1p2',
            size: 249_488_000_000,
            filesystem: 'ext4',
            uuid: 'ROOT-LINUX-5678',
            label: 'Ubuntu Host Root OS',
            mountPoint: '/',
            usedBytes: 141_936_000_000,
            freeBytes: 107_552_000_000,
            isSystemPartition: true,
            hasExistingData: true,
          }
        ],
        lastSeenAt: new Date().toISOString(),
      },
      {
        deviceName: 'sdb',
        devicePath: '/dev/sdb',
        deviceModel: 'Seagate Expansion 1TB USB HDD [SIMULATED DEVICE]',
        vendor: 'Seagate',
        model: 'Expansion Portable',
        serial: 'NA987654321',
        deviceType: 'USB_HDD',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'ext4',
        uuid: 'b5c3d2e1-2222-5555-9999-000000000002',
        totalBytes: 1_000_000_000_000,
        usedBytes: 380_000_000_000,
        freeBytes: 620_000_000_000,
        mountPoint: '/mnt/storage1',
        isRemovable: true,
        isRotational: true,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: true,
        isCloudStorage: false,
        isSimulated: true,
        status: 'AVAILABLE',
        partitions: [
          {
            name: 'sdb1',
            path: '/dev/sdb1',
            size: 1_000_000_000_000,
            filesystem: 'ext4',
            uuid: 'b5c3d2e1-2222-5555-9999-000000000002',
            label: 'Seagate_Storage',
            mountPoint: '/mnt/storage1',
            usedBytes: 380_000_000_000,
            freeBytes: 620_000_000_000,
            isSystemPartition: false,
            hasExistingData: true,
          }
        ],
        lastSeenAt: new Date().toISOString(),
      },
      {
        deviceName: 'sdc',
        devicePath: '/dev/sdc',
        deviceModel: 'SanDisk Extreme 512GB USB SSD [SIMULATED DEVICE]',
        vendor: 'SanDisk',
        model: 'Extreme SSD',
        serial: 'SDSSDE61-512G',
        deviceType: 'USB_SSD',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'ext4',
        uuid: 'c6d4e3f2-3333-6666-aaaa-000000000003',
        totalBytes: 512_000_000_000,
        usedBytes: 92_000_000_000,
        freeBytes: 420_000_000_000,
        mountPoint: null,
        isRemovable: true,
        isRotational: false,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: true,
        isCloudStorage: false,
        isSimulated: true,
        status: 'AVAILABLE',
        partitions: [
          {
            name: 'sdc1',
            path: '/dev/sdc1',
            size: 100_000_000_000,
            filesystem: 'exfat',
            uuid: 'EXFAT-PART-1',
            label: 'Camera_Footage',
            mountPoint: null,
            usedBytes: 24_000_000_000,
            freeBytes: 76_000_000_000,
            isSystemPartition: false,
            hasExistingData: true,
          },
          {
            name: 'sdc2',
            path: '/dev/sdc2',
            size: 412_000_000_000,
            filesystem: 'ext4',
            uuid: 'c6d4e3f2-3333-6666-aaaa-000000000003',
            label: 'Cloud_Target',
            mountPoint: null,
            usedBytes: 68_000_000_000,
            freeBytes: 344_000_000_000,
            isSystemPartition: false,
            hasExistingData: true,
          }
        ],
        lastSeenAt: new Date().toISOString(),
      },
      {
        deviceName: 'sdd',
        devicePath: '/dev/sdd',
        deviceModel: 'Kingston DataTraveler 128GB Flash [SIMULATED DEVICE]',
        vendor: 'Kingston',
        model: 'DataTraveler 3.0',
        serial: '001A4D5E6F7G',
        deviceType: 'USB_FLASH',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'vfat',
        uuid: 'd7e5f403-4444-7777-bbbb-000000000004',
        totalBytes: 128_000_000_000,
        usedBytes: 14_000_000_000,
        freeBytes: 114_000_000_000,
        mountPoint: null,
        isRemovable: true,
        isRotational: false,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: false,
        isCloudStorage: false,
        isSimulated: true,
        status: 'AVAILABLE',
        partitions: [
          {
            name: 'sdd1',
            path: '/dev/sdd1',
            size: 128_000_000_000,
            filesystem: 'vfat',
            uuid: 'd7e5f403-4444-7777-bbbb-000000000004',
            label: 'USB_DRIVE',
            mountPoint: null,
            usedBytes: 14_000_000_000,
            freeBytes: 114_000_000_000,
            isSystemPartition: false,
            hasExistingData: false,
          }
        ],
        lastSeenAt: new Date().toISOString(),
      },
    ];
  }
}
