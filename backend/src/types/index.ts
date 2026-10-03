export type DeviceType = 
  | 'INTERNAL_SSD'
  | 'INTERNAL_HDD'
  | 'USB_SSD'
  | 'USB_HDD'
  | 'USB_FLASH'
  | 'NVME'
  | 'UNKNOWN';

export type DeviceStatus = 
  | 'DETECTED'
  | 'INSPECTED'
  | 'AVAILABLE'
  | 'SELECTED'
  | 'REGISTERED'
  | 'MOUNTED'
  | 'ACTIVE'
  | 'UNAVAILABLE'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'ERROR';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface PartitionInfo {
  name: string;
  path: string;
  size: number;
  filesystem: string | null;
  uuid: string | null;
  label: string | null;
  mountPoint: string | null;
  usedBytes?: number;
  freeBytes?: number;
  isSystemPartition: boolean;
  hasExistingData: boolean;
}

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
  vendor?: string | null;
  serial?: string | null;
  hotplug: boolean;
  ro: boolean;
  rm: boolean;
  rota?: boolean;
  children?: RawBlockDevice[];
}

export interface DiscoveredStorageDevice {
  id?: string;
  deviceName: string;
  devicePath: string;
  deviceModel: string;
  vendor?: string | null;
  model?: string | null;
  serial?: string | null;
  deviceType: DeviceType;
  filesystem: string | null;
  uuid: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountPoint: string | null;
  isRemovable: boolean;
  isRotational: boolean;
  isReadOnly: boolean;
  isSystemDisk: boolean; // Protected OS / application disk
  hasExistingData: boolean;
  isCloudStorage: boolean;
  isSimulated?: boolean;
  status: DeviceStatus;
  partitions: PartitionInfo[];
  lastSeenAt: string;
}

export interface StoragePoolSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  activeDeviceCount: number;
  registeredDeviceCount: number;
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
