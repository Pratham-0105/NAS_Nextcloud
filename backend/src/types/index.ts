export type DeviceType = 
  | 'INTERNAL_SSD'
  | 'INTERNAL_HDD'
  | 'USB_SSD'
  | 'USB_HDD'
  | 'USB_FLASH'
  | 'NVME'
  | 'UNKNOWN';

export type DeviceStatus = 
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'ERROR';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface RawBlockDevice {
  name: string;
  path: string;
  size: number;
  type: string;
  fstype: string | null;
  mountpoint: string | null;
  label: string | null;
  uuid: string | null;
  model: string | null;
  hotplug: boolean;
  ro: boolean;
  rm: boolean;
  children?: RawBlockDevice[];
}

export interface DiscoveredStorageDevice {
  deviceName: string;
  devicePath: string;
  deviceModel: string;
  deviceType: DeviceType;
  filesystem: string | null;
  uuid: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountPoint: string | null;
  isCloudStorage: boolean;
  status: DeviceStatus;
}

export interface StoragePoolSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  activeDeviceCount: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

export interface SystemTelemetryData {
  cpuUsage: number;
  cpuTemp?: number;
  ramTotal: number;
  ramUsed: number;
  ramFree: number;
  ramPercent: number;
  uptimeSeconds: number;
  pool: StoragePoolSummary;
  dockerStatus: {
    nextcloud: boolean;
    postgres: boolean;
    redis: boolean;
  };
  timestamp: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  nextcloudUser: string;
}
