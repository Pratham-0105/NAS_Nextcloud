import { env } from '../config/env.js';
import { safeExec } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { 
  DiscoveredStorageDevice, 
  DeviceType, 
  DeviceStatus, 
  RawBlockDevice, 
  PartitionInfo 
} from '../types/index.js';

// Sensitive / Protected OS Mount Points
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
  /**
   * Discovers all physical storage devices on the host machine.
   */
  public async discoverDevices(): Promise<DiscoveredStorageDevice[]> {
    if (env.SIMULATE_STORAGE) {
      return this.getSimulatedDevices();
    }

    try {
      // Query structured block device hierarchy from Linux host
      const output = await safeExec('lsblk', [
        '--json',
        '-b', // Exact bytes
        '-o', 'NAME,PATH,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,UUID,MODEL,VENDOR,SERIAL,HOTPLUG,RO,RM,ROTA',
      ]);

      const parsed = JSON.parse(output);
      const devices: DiscoveredStorageDevice[] = [];

      if (parsed.blockdevices && Array.isArray(parsed.blockdevices)) {
        for (const dev of parsed.blockdevices) {
          // Only inspect primary disks (type === 'disk' or 'nvme')
          if (dev.type === 'disk' || dev.type === 'nvme' || !dev.children) {
            const processed = this.processBlockDisk(dev);
            if (processed) {
              devices.push(processed);
            }
          }
        }
      }

      return devices;
    } catch (err: any) {
      logger.error('[ERROR] Failed to inspect host block devices via lsblk:', err);
      // Fallback to simulated devices if command fails in non-Linux container
      return this.getSimulatedDevices();
    }
  }

  private processBlockDisk(dev: RawBlockDevice): DiscoveredStorageDevice | null {
    // Ignore loop, ram, and optical drives
    if (dev.type === 'loop' || dev.type === 'rom' || dev.name.startsWith('loop')) {
      return null;
    }

    const partitions: PartitionInfo[] = [];
    let isSystemDisk = false;
    let totalUsed = 0;

    if (dev.children && dev.children.length > 0) {
      for (const child of dev.children) {
        const isSys = this.checkIfSystemMount(child.mountpoint);
        if (isSys) isSystemDisk = true;

        const partUsed = child.mountpoint ? Math.floor(child.size * 0.3) : 0;
        totalUsed += partUsed;

        partitions.push({
          name: child.name,
          path: child.path,
          size: child.size,
          filesystem: child.fstype,
          uuid: child.uuid,
          label: child.label,
          mountPoint: child.mountpoint,
          usedBytes: partUsed,
          freeBytes: child.size - partUsed,
          isSystemPartition: isSys,
          hasExistingData: Boolean(child.mountpoint || child.fstype),
        });
      }
    } else {
      // Unpartitioned raw drive or single-volume disk
      const isSys = this.checkIfSystemMount(dev.mountpoint);
      if (isSys) isSystemDisk = true;

      const diskUsed = dev.mountpoint ? Math.floor(dev.size * 0.25) : 0;
      totalUsed += diskUsed;

      if (dev.fstype) {
        partitions.push({
          name: dev.name,
          path: dev.path,
          size: dev.size,
          filesystem: dev.fstype,
          uuid: dev.uuid,
          label: dev.label,
          mountPoint: dev.mountpoint,
          usedBytes: diskUsed,
          freeBytes: dev.size - diskUsed,
          isSystemPartition: isSys,
          hasExistingData: Boolean(dev.mountpoint || dev.fstype),
        });
      }
    }

    const uuid = dev.uuid || (partitions[0]?.uuid) || `dev-${dev.name}`;
    const devType = this.classifyDeviceType(dev);
    const freeBytes = Math.max(0, dev.size - totalUsed);

    return {
      deviceName: dev.name,
      devicePath: dev.path,
      deviceModel: dev.model?.trim() || `${dev.vendor || 'Generic'} Storage Device`,
      vendor: dev.vendor?.trim() || null,
      model: dev.model?.trim() || null,
      serial: dev.serial?.trim() || null,
      deviceType: devType,
      filesystem: dev.fstype || partitions[0]?.filesystem || null,
      uuid: uuid,
      totalBytes: dev.size,
      usedBytes: totalUsed,
      freeBytes: freeBytes,
      mountPoint: dev.mountpoint || partitions[0]?.mountPoint || null,
      isRemovable: Boolean(dev.rm || dev.hotplug),
      isRotational: Boolean(dev.rota),
      isReadOnly: Boolean(dev.ro),
      isSystemDisk: isSystemDisk,
      hasExistingData: partitions.some((p) => p.hasExistingData),
      isCloudStorage: false,
      status: isSystemDisk ? 'INSPECTED' : 'AVAILABLE',
      partitions: partitions,
      lastSeenAt: new Date().toISOString(),
    };
  }

  private checkIfSystemMount(mountPoint: string | null): boolean {
    if (!mountPoint) return false;
    return PROTECTED_SYSTEM_MOUNTS.some(
      (sys) => mountPoint === sys || mountPoint.startsWith(sys + '/')
    );
  }

  private classifyDeviceType(dev: RawBlockDevice): DeviceType {
    const name = dev.name.toLowerCase();
    const model = (dev.model || '').toLowerCase();

    if (name.startsWith('nvme')) {
      return 'NVME';
    }
    if (dev.hotplug || dev.rm || model.includes('usb') || model.includes('flash') || model.includes('portable')) {
      if (model.includes('ssd') || dev.size > 250_000_000_000) {
        return 'USB_SSD';
      }
      if (dev.size > 500_000_000_000 || dev.rota) {
        return 'USB_HDD';
      }
      return 'USB_FLASH';
    }
    if (model.includes('ssd') || dev.rota === false) {
      return 'INTERNAL_SSD';
    }
    return 'INTERNAL_HDD';
  }

  private simulatedDevices: DiscoveredStorageDevice[] = [];

  constructor() {
    this.resetSimulatedDevices();
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
   * Simulated device catalog for macOS/Windows development mode
   * Clearly labeled with [SIMULATED DEVICE] and rich partition trees.
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
        hasExistingData: true, // Existing user media detected
        isCloudStorage: true,
        isSimulated: true,
        status: 'ACTIVE',
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
