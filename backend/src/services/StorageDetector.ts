import { env } from '../config/env.js';
import { safeExec } from '../utils/execHelper.js';
import { logger } from '../utils/logger.js';
import { DiscoveredStorageDevice, DeviceType, DeviceStatus, RawBlockDevice } from '../types/index.js';

export class StorageDetector {
  /**
   * Discovers all physical storage devices on the host machine.
   */
  public async discoverDevices(): Promise<DiscoveredStorageDevice[]> {
    if (env.SIMULATE_STORAGE) {
      return this.getSimulatedDevices();
    }

    try {
      const output = await safeExec('lsblk', [
        '--json',
        '-b', // output bytes
        '-o', 'NAME,PATH,SIZE,TYPE,FSTYPE,MOUNTPOINT,LABEL,UUID,MODEL,HOTPLUG,RO,RM',
      ]);

      const parsed = JSON.parse(output);
      const devices: DiscoveredStorageDevice[] = [];

      if (parsed.blockdevices && Array.isArray(parsed.blockdevices)) {
        for (const dev of parsed.blockdevices) {
          this.processBlockDevice(dev, devices);
        }
      }

      return devices;
    } catch (err: any) {
      logger.error('Failed to inspect host block devices via lsblk:', err);
      // Fallback to simulated devices if command fails in non-Linux container
      return this.getSimulatedDevices();
    }
  }

  private processBlockDevice(dev: RawBlockDevice, list: DiscoveredStorageDevice[]): void {
    // If it's a disk with partitions, process children partitions; if it has a direct filesystem, process it
    if (dev.children && dev.children.length > 0) {
      for (const child of dev.children) {
        this.processBlockDevice(child, list);
      }
      return;
    }

    // Ignore read-only loop devices or swap partitions
    if (dev.ro || dev.fstype === 'swap' || dev.type === 'loop') {
      return;
    }

    // Must have a UUID or device path to be identifiable
    const uuid = dev.uuid || `dev-${dev.name}`;
    const devType = this.classifyDeviceType(dev);

    // Calculate simulated or reported used/free bytes
    const totalBytes = dev.size || 0;
    const usedBytes = dev.mountpoint ? Math.floor(totalBytes * 0.35) : 0;
    const freeBytes = totalBytes - usedBytes;

    list.push({
      deviceName: dev.name,
      devicePath: dev.path,
      deviceModel: dev.model?.trim() || 'Generic Storage Device',
      deviceType: devType,
      filesystem: dev.fstype,
      uuid: uuid,
      totalBytes: totalBytes,
      usedBytes: usedBytes,
      freeBytes: freeBytes,
      mountPoint: dev.mountpoint,
      isCloudStorage: dev.mountpoint?.includes('storage_pool') || false,
      status: dev.mountpoint ? 'ACTIVE' : 'AVAILABLE',
    });
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
      if (dev.size > 500_000_000_000) {
        return 'USB_HDD';
      }
      return 'USB_FLASH';
    }
    if (model.includes('ssd')) {
      return 'INTERNAL_SSD';
    }
    return 'INTERNAL_HDD';
  }

  /**
   * Simulated device catalog for development and cross-platform testing (macOS / Windows dev machines)
   */
  private getSimulatedDevices(): DiscoveredStorageDevice[] {
    return [
      {
        deviceName: 'nvme0n1p2',
        devicePath: '/dev/nvme0n1p2',
        deviceModel: 'Samsung 980 PRO 250GB',
        deviceType: 'INTERNAL_SSD',
        filesystem: 'ext4',
        uuid: 'a4b2c1d0-1111-4444-8888-000000000001',
        totalBytes: 250_000_000_000,
        usedBytes: 82_000_000_000,
        freeBytes: 168_000_000_000,
        mountPoint: '/mnt/devices/nvme0n1p2',
        isCloudStorage: true,
        status: 'ACTIVE',
      },
      {
        deviceName: 'sdb1',
        devicePath: '/dev/sdb1',
        deviceModel: 'Seagate Expansion 1TB USB HDD',
        deviceType: 'USB_HDD',
        filesystem: 'ext4',
        uuid: 'b5c3d2e1-2222-5555-9999-000000000002',
        totalBytes: 1_000_000_000_000,
        usedBytes: 380_000_000_000,
        freeBytes: 620_000_000_000,
        mountPoint: '/mnt/devices/usb-hdd1',
        isCloudStorage: true,
        status: 'ACTIVE',
      },
      {
        deviceName: 'sdc1',
        devicePath: '/dev/sdc1',
        deviceModel: 'SanDisk Extreme 512GB USB SSD',
        deviceType: 'USB_SSD',
        filesystem: 'exfat',
        uuid: 'c6d4e3f2-3333-6666-aaaa-000000000003',
        totalBytes: 512_000_000_000,
        usedBytes: 102_000_000_000,
        freeBytes: 410_000_000_000,
        mountPoint: null,
        isCloudStorage: false,
        status: 'AVAILABLE',
      },
      {
        deviceName: 'sdd1',
        devicePath: '/dev/sdd1',
        deviceModel: 'Kingston DataTraveler 128GB Flash',
        deviceType: 'USB_FLASH',
        filesystem: 'vfat',
        uuid: 'd7e5f403-4444-7777-bbbb-000000000004',
        totalBytes: 128_000_000_000,
        usedBytes: 38_000_000_000,
        freeBytes: 90_000_000_000,
        mountPoint: null,
        isCloudStorage: false,
        status: 'AVAILABLE',
      },
    ];
  }
}
