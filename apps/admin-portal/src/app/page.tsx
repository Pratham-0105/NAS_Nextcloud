'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  HardDrive, 
  Cpu, 
  Activity, 
  Server, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  RefreshCw, 
  ShieldCheck, 
  Layers, 
  ExternalLink,
  Bell,
  Lock,
  Eye,
  ChevronDown,
  ChevronRight,
  Info,
  X,
  FileCheck,
  Radio,
  Play,
  Square,
  AlertCircle
} from 'lucide-react';

interface PartitionInfo {
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

interface StorageDevice {
  deviceName: string;
  devicePath: string;
  deviceModel: string | null;
  vendor?: string | null;
  model?: string | null;
  serial?: string | null;
  deviceType: string;
  transport?: string | null;
  detectionSource: 'REAL_HARDWARE' | 'SIMULATION';
  filesystem: string | null;
  uuid: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountPoint: string | null;
  isRemovable: boolean;
  isRotational: boolean;
  isReadOnly: boolean;
  isSystemDisk: boolean;
  hasExistingData: boolean;
  isCloudStorage: boolean;
  isSimulated?: boolean;
  status: string;
  partitions: PartitionInfo[];
  lastSeenAt: string;
}

interface StoragePoolMember {
  id: string;
  poolId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string | null;
  deviceType: string;
  transport: string;
  filesystem: string | null;
  mountPoint: string | null;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  status: string;
  hasExistingData: boolean;
  addedAt: string;
}

interface StoragePool {
  id: string;
  name: string;
  status: 'CREATING' | 'ACTIVE' | 'DEGRADED' | 'UNAVAILABLE' | 'STOPPED' | 'ERROR';
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  filesystem: string;
  poolingMethod: string;
  memberCount: number;
  members: StoragePoolMember[];
  createdAt: string;
  updatedAt: string;
}

interface PoolSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  activeDeviceCount: number;
  registeredDeviceCount?: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 GB';
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function AdminDashboard() {
  const [devices, setDevices] = useState<StorageDevice[]>([]);
  const [pools, setPools] = useState<StoragePool[]>([]);
  const [pool, setPool] = useState<PoolSummary>({
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    percentUsed: 0,
    activeDeviceCount: 0,
    status: 'HEALTHY',
  });
  const [cpuUsage, setCpuUsage] = useState(18.2);
  const [ramPercent, setRamPercent] = useState(34);
  const [dockerStatus, setDockerStatus] = useState({ nextcloud: true, postgres: true, redis: true });
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Inspection Drawer & Registration Modals
  const [inspectModalDevice, setInspectModalDevice] = useState<StorageDevice | null>(null);
  const [registerConfirmDevice, setRegisterConfirmDevice] = useState<StorageDevice | null>(null);
  const [expandedPartitions, setExpandedPartitions] = useState<Record<string, boolean>>({});

  // Pool Validation & Member Addition Modal
  const [poolModal, setPoolModal] = useState<{
    isOpen: boolean;
    poolId: string;
    poolName: string;
    device: StorageDevice | null;
    validation: any | null;
    validating: boolean;
    confirmExistingData: boolean;
  }>({
    isOpen: false,
    poolId: '',
    poolName: '',
    device: null,
    validation: null,
    validating: false,
    confirmExistingData: false,
  });

  const getAdminHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('nas_admin_token') : null;
    return {
      'Content-Type': 'application/json',
      'x-admin-portal': 'true',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const headers = getAdminHeaders();
      const res = await fetch('http://localhost:4001/api/storage/devices', { headers });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
      const poolRes = await fetch('http://localhost:4001/api/storage/status', { headers });
      if (poolRes.ok) {
        const poolData = await poolRes.json();
        setPool(poolData.pool || pool);
      }
      const poolsRes = await fetch('http://localhost:4001/api/storage/pools', { headers });
      if (poolsRes.ok) {
        const poolsData = await poolsRes.json();
        setPools(poolsData.pools || []);
      }
      const healthRes = await fetch('http://localhost:4001/api/system/health', { headers });
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setCpuUsage(healthData.cpuUsage || 18.2);
        setRamPercent(healthData.ramPercent || 34);
        if (healthData.dockerStatus) {
          setDockerStatus(healthData.dockerStatus);
        }
      }
    } catch {
      // Fallback local mock state if backend is booting
    }
  }, [pool, getAdminHeaders]);

  useEffect(() => {
    // Acquire admin token
    fetch('http://localhost:4001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@cloud.local', password: 'admin123' })
    }).then(r => r.json()).then(d => {
      if (d.token && typeof window !== 'undefined') {
        localStorage.setItem('nas_admin_token', d.token);
      }
    }).catch(() => {});

    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Real-time WebSocket event connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket('ws://localhost:4001/ws/telemetry');
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'TELEMETRY_UPDATE') {
            setCpuUsage(payload.data?.cpuUsage || 18);
            setRamPercent(payload.data?.ramPercent || 34);
            if (payload.data?.pool) setPool(payload.data.pool);
            if (payload.data?.dockerStatus) setDockerStatus(payload.data.dockerStatus);
          } else if (payload.type?.startsWith('storage.device.') || payload.type?.startsWith('storage.pool.')) {
            setActionMessage(`Event: ${payload.data?.message || payload.type}`);
            fetchDevices();
          }
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      // ignore ws setup error
    }
    return () => {
      if (ws) ws.close();
    };
  }, [fetchDevices]);

  const togglePartitions = (deviceName: string) => {
    setExpandedPartitions((prev) => ({
      ...prev,
      [deviceName]: !prev[deviceName],
    }));
  };

  const handleRegisterDevice = async (uuid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4001/api/storage/devices/${uuid}/register`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ confirmExistingData: true }),
      });
      const data = await res.json();

      if (res.ok) {
        setActionMessage(data.message || 'Device registered successfully!');
        setRegisterConfirmDevice(null);
        fetchDevices();
      } else {
        alert(data.error || 'Failed to register device.');
      }
    } catch (err: any) {
      alert(`Registration error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleUnregisterDevice = async (uuid: string) => {
    if (!confirm('Unregister this device from cloud storage? (Existing files will remain safe and untouched)')) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4001/api/storage/devices/${uuid}/unregister`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setActionMessage(data.message || 'Device unregistered.');
        fetchDevices();
      } else {
        alert(data.error || 'Failed to unregister device.');
      }
    } catch (err: any) {
      alert(`Unregister error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleResetPool = async () => {
    if (!confirm('RESET POOL: Unregister all non-system storage devices back to available candidates? All physical files remain untouched.')) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4001/api/storage/devices/reset-all', {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || 'Storage pool successfully reset to 0 bytes.');
        fetchDevices();
      } else {
        alert(data.error || 'Failed to reset pool');
      }
    } catch (err: any) {
      alert(`Reset error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleSetMode = async (mode: 'auto' | 'real' | 'simulation') => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4001/api/storage/mode', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(`Detection mode switched to ${mode.toUpperCase()}`);
        fetchDevices();
      } else {
        alert(data.error || 'Failed to switch mode');
      }
    } catch (err: any) {
      alert(`Mode switch error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleOpenPoolValidate = async (targetPoolId: string, targetPoolName: string, device: StorageDevice) => {
    setPoolModal({
      isOpen: true,
      poolId: targetPoolId,
      poolName: targetPoolName,
      device,
      validation: null,
      validating: true,
      confirmExistingData: device.hasExistingData,
    });

    try {
      const res = await fetch(`http://localhost:4001/api/storage/pools/${targetPoolId}/members/${device.uuid}/validate`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      setPoolModal((prev) => ({
        ...prev,
        validation: data.validation,
        validating: false,
      }));
    } catch (err: any) {
      setPoolModal((prev) => ({ ...prev, validating: false }));
      alert(`Validation request failed: ${err.message}`);
    }
  };

  const handleConfirmAddToPool = async () => {
    if (!poolModal.device || !poolModal.poolId) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4001/api/storage/pools/${poolModal.poolId}/members/${poolModal.device.uuid}/add`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          confirm: true,
          confirmExistingData: poolModal.confirmExistingData,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || 'Device added to storage pool successfully!');
        setPoolModal((prev) => ({ ...prev, isOpen: false }));
        fetchDevices();
      } else {
        alert(data.error || 'Failed to add device to pool');
      }
    } catch (err: any) {
      alert(`Error adding device to pool: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleRemoveFromPool = async (poolId: string, deviceId: string, deviceName: string) => {
    if (!confirm(`Remove "${deviceName}" from storage pool? All stored files on this device will remain completely intact.`)) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4001/api/storage/pools/${poolId}/members/${deviceId}/remove`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || 'Device removed from pool.');
        fetchDevices();
      } else {
        alert(data.error || 'Failed to remove member from pool');
      }
    } catch (err: any) {
      alert(`Removal error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  const handleAttachTestDevice = async (type: 'SSD' | 'HDD' | 'FLASH') => {
    setLoading(true);
    try {
      const dev = type === 'SSD' ? {
        deviceName: 'sde',
        deviceModel: 'Crucial X8 1TB Portable USB SSD [CANDIDATE]',
        vendor: 'Crucial',
        model: 'X8 Portable SSD',
        serial: 'CT1000X8SSD9',
        deviceType: 'USB_SSD',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'ext4',
        uuid: 'e8f7a6b5-5555-8888-cccc-000000000005',
        totalBytes: 1_000_000_000_000,
        availableBytes: 880_000_000_000,
        isRemovable: true,
        isRotational: false,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: true,
        isCloudStorage: false,
        status: 'AVAILABLE',
      } : type === 'HDD' ? {
        deviceName: 'sdf',
        deviceModel: 'Western Digital My Passport 2TB USB HDD [CANDIDATE]',
        vendor: 'Western Digital',
        model: 'My Passport',
        serial: 'WDBPKJ0020BBL',
        deviceType: 'USB_HDD',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'exfat',
        uuid: 'f9a8b7c6-6666-9999-dddd-000000000006',
        totalBytes: 2_000_000_000_000,
        availableBytes: 1_700_000_000_000,
        isRemovable: true,
        isRotational: true,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: true,
        isCloudStorage: false,
        status: 'AVAILABLE',
      } : {
        deviceName: 'sdg',
        deviceModel: 'SanDisk Ultra Flair 128GB Flash [CANDIDATE]',
        vendor: 'SanDisk',
        model: 'Ultra Flair 3.0',
        serial: 'SDCZ73-128G',
        deviceType: 'USB_FLASH',
        transport: 'USB',
        detectionSource: 'SIMULATION',
        filesystem: 'vfat',
        uuid: 'a1b2c3d4-7777-aaaa-eeee-000000000007',
        totalBytes: 128_000_000_000,
        availableBytes: 110_000_000_000,
        isRemovable: true,
        isRotational: false,
        isReadOnly: false,
        isSystemDisk: false,
        hasExistingData: false,
        isCloudStorage: false,
        status: 'AVAILABLE',
      };

      const res = await fetch('http://localhost:4001/api/storage/devices/simulate-hotplug', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(dev),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage(data.message || `Candidate storage attached: ${dev.deviceModel}`);
        fetchDevices();
      } else {
        alert(data.error || 'Failed to attach candidate device.');
      }
    } catch (err: any) {
      alert(`Error attaching device: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 5000);
    }
  };

  // Group devices into 3 distinct sections
  const activeStorage = devices.filter((d) => d.isCloudStorage && !d.isSystemDisk);
  const availableDevices = devices.filter((d) => !d.isCloudStorage && !d.isSystemDisk);
  const systemDevices = devices.filter((d) => d.isSystemDisk);

  const hotPlugCandidate = availableDevices[0];
  const primaryPool = pools[0] || null;
  const isAnyPoolDegraded = pools.some((p) => p.status === 'DEGRADED');

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                Cloud Server & Storage Manager
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  PHASE 4 ACTIVE
                </span>
              </h1>
              <p className="text-sm text-slate-400">Hardware Detection, Unified Storage Pooling & Real Nextcloud Integration</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-1 text-xs">
            <button
              onClick={() => handleSetMode('real')}
              disabled={loading}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                devices.length > 0 && devices.some(d => d.detectionSource === 'REAL_HARDWARE')
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ● Real Hardware
            </button>
            <button
              onClick={() => handleSetMode('simulation')}
              disabled={loading}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                devices.length > 0 && devices.every(d => d.detectionSource === 'SIMULATION')
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ◌ Simulation Sandbox
            </button>
          </div>

          <button 
            onClick={fetchDevices}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium border border-slate-700 transition text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Rescan Disks
          </button>
          <button 
            onClick={handleResetPool}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-xs font-medium border border-rose-800/40 text-rose-300 transition"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset Pool
          </button>
          <a
            href="http://localhost:3002"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm transition"
          >
            User Cloud Portal <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto mt-6 space-y-6">
        {/* Pool Degraded Alert Banner */}
        {isAnyPoolDegraded && (
          <div className="bg-rose-950/80 border-2 border-rose-500/80 rounded-2xl p-4 shadow-xl flex items-center gap-4 text-rose-200 animate-pulse">
            <div className="p-2.5 bg-rose-500/20 rounded-xl text-rose-400 shrink-0">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="space-y-0.5">
              <h3 className="font-bold text-base text-rose-100 uppercase tracking-wide">Warning: Storage Pool Degraded</h3>
              <p className="text-xs text-rose-300">
                One or more member storage drives are disconnected or unavailable! Reconnect the missing storage drive to restore full access.
              </p>
            </div>
          </div>
        )}

        {/* Action Status Notification Toast */}
        {actionMessage && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-200 shadow-md">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>{actionMessage}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-emerald-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Hot-Plug Notification Card */}
        {hotPlugCandidate && (
          <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900/60 border border-amber-500/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 border border-amber-500/30">
                  <Bell className="h-6 w-6 animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 uppercase tracking-wider">New Block Device Detected</span>
                    {hotPlugCandidate.isSimulated && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 uppercase tracking-wider">[SIMULATED DEVICE]</span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-white mt-1">
                    {hotPlugCandidate.deviceModel} ({hotPlugCandidate.deviceName})
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Capacity: <span className="text-white font-medium">{formatBytes(hotPlugCandidate.totalBytes)}</span> • 
                    Filesystem: <span className="text-amber-400 uppercase font-mono">{hotPlugCandidate.filesystem || 'raw / multi-partition'}</span> • 
                    Partitions: <span className="text-white font-medium">{hotPlugCandidate.partitions?.length || 1}</span> • 
                    Existing Data: <span className={hotPlugCandidate.hasExistingData ? 'text-amber-300 font-semibold' : 'text-slate-400'}>{hotPlugCandidate.hasExistingData ? 'PRESENT (Will Be Preserved)' : 'EMPTY'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setInspectModalDevice(hotPlugCandidate)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Eye className="h-3.5 w-3.5" /> Inspect Partitions
                </button>
                <button
                  onClick={() => primaryPool && handleOpenPoolValidate(primaryPool.id, primaryPool.name, hotPlugCandidate)}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Validate & Add to Pool
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Telemetry Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Unified Cloud Pool</span>
              <HardDrive className="h-5 w-5 text-blue-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">
                {formatBytes(primaryPool ? primaryPool.usedBytes : pool.usedBytes)} <span className="text-sm font-normal text-slate-400">/ {formatBytes(primaryPool ? primaryPool.totalBytes : pool.totalBytes)}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                  style={{ width: `${primaryPool && primaryPool.totalBytes > 0 ? Math.round((primaryPool.usedBytes / primaryPool.totalBytes) * 100) : pool.percentUsed}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Free: {formatBytes(primaryPool ? primaryPool.freeBytes : pool.freeBytes)}</span>
                <span className="text-blue-400 font-medium">{primaryPool ? primaryPool.memberCount : pool.activeDeviceCount} Member Drive(s)</span>
              </div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU Usage</span>
              <Cpu className="h-5 w-5 text-purple-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">{cpuUsage}%</div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-purple-500 h-2 rounded-full transition-all duration-500" style={{ width: `${cpuUsage}%` }}></div>
              </div>
              <div className="text-xs text-slate-400 mt-2">Host Quad-Core Normal</div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">RAM Allocation</span>
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">{ramPercent}%</div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${ramPercent}%` }}></div>
              </div>
              <div className="text-xs text-slate-400 mt-2">Host Physical Memory Normal</div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Docker Services</span>
              <Layers className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">Nextcloud Engine</span>
                <span className={`font-semibold ${dockerStatus.nextcloud ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {dockerStatus.nextcloud ? 'HEALTHY' : 'OFFLINE'}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">Database Engine</span>
                <span className={`font-semibold ${dockerStatus.postgres ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {dockerStatus.postgres ? 'HEALTHY' : 'IDLE'}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">Redis Cache</span>
                <span className={`font-semibold ${dockerStatus.redis ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {dockerStatus.redis ? 'ACTIVE' : 'STANDBY'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MANDATORY POOLING SAFETY NOTICE */}
        <div className="bg-blue-950/30 border border-blue-500/30 rounded-2xl p-4 flex items-center gap-3 text-xs text-blue-200">
          <Info className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <strong className="text-white">Storage Pooling Architecture Notice:</strong> Storage pooling combines capacity across storage devices without formatting. It does <strong>NOT</strong> provide data redundancy or backup.
          </div>
        </div>

        {/* ================================================================= */}
        {/* PHASE 4: UNIFIED STORAGE POOLS DASHBOARD */}
        {/* ================================================================= */}
        <div className="bg-[#111726] border border-blue-900/40 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-400" />
                Unified Storage Pools ({pools.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Logical storage pool mount points backed by physical block devices</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Pool Name</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5">Pooling Engine</th>
                  <th className="py-3 px-5">Member Drives</th>
                  <th className="py-3 px-5">Total Capacity</th>
                  <th className="py-3 px-5">Used</th>
                  <th className="py-3 px-5">Free</th>
                  <th className="py-3 px-5 text-right">Pool Mount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pools.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-xs text-slate-500">
                      No storage pools active. Initializing primary pool...
                    </td>
                  </tr>
                ) : (
                  pools.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr className="hover:bg-slate-800/20 transition">
                        <td className="py-3.5 px-5 font-semibold text-white flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-blue-400" />
                          <span>{p.name}</span>
                        </td>
                        <td className="py-3.5 px-5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            p.status === 'ACTIVE' 
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : p.status === 'DEGRADED'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 font-mono text-xs text-slate-300 uppercase">
                          {p.poolingMethod} ({p.filesystem})
                        </td>
                        <td className="py-3.5 px-5 font-medium text-white">{p.memberCount} Drive(s)</td>
                        <td className="py-3.5 px-5 font-bold text-white">{formatBytes(p.totalBytes)}</td>
                        <td className="py-3.5 px-5 text-slate-400">{formatBytes(p.usedBytes)}</td>
                        <td className="py-3.5 px-5 font-semibold text-emerald-400">{formatBytes(p.freeBytes)}</td>
                        <td className="py-3.5 px-5 text-right font-mono text-xs text-blue-400">{p.mountPoint}</td>
                      </tr>

                      {/* Pool Member Drives Sub-Table */}
                      <tr className="bg-slate-900/50">
                        <td colSpan={8} className="py-3 px-8">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                              <span>Assigned Pool Member Drives ({p.members.length}):</span>
                            </div>

                            {p.members.length === 0 ? (
                              <div className="text-xs text-slate-500 italic py-2">
                                No drives assigned to this pool yet. Select an available storage candidate below to assign it.
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {p.members.map((m) => (
                                  <div key={m.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
                                    <div className="flex items-center gap-2">
                                      <HardDrive className="h-4 w-4 text-blue-400 shrink-0" />
                                      <span className="font-semibold text-white">{m.deviceModel || m.deviceName}</span>
                                      <span className="font-mono text-slate-400">({m.deviceName})</span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/20">
                                        {m.transport}
                                      </span>
                                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-800 text-slate-300">
                                        {m.filesystem || 'raw'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-slate-300 font-mono text-[11px]">
                                      <span>Capacity: <strong className="text-white">{formatBytes(m.totalBytes)}</strong></span>
                                      <span>Mount: <span className="text-slate-400">{m.mountPoint || '—'}</span></span>
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        m.status === 'ACTIVE' 
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      }`}>
                                        {m.status}
                                      </span>
                                      <button
                                        onClick={() => handleRemoveFromPool(p.id, m.deviceId, m.deviceName)}
                                        className="px-2 py-1 text-xs bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded font-semibold transition"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 1: ACTIVE CLOUD STORAGE */}
        <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Active Registered Cloud Storage ({activeStorage.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Disks explicitly registered in the cloud catalog and available for pooling</p>
            </div>
            {activeStorage.length > 0 && (
              <button
                onClick={handleResetPool}
                className="px-3 py-1.5 text-xs bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded-lg font-medium transition flex items-center gap-1.5"
              >
                <Trash2 className="h-3 w-3" /> Unregister All
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-5">Device</th>
                  <th className="py-3 px-5">Type</th>
                  <th className="py-3 px-5">Capacity</th>
                  <th className="py-3 px-5">Used</th>
                  <th className="py-3 px-5">Free</th>
                  <th className="py-3 px-5">Mount Point</th>
                  <th className="py-3 px-5">Pool State</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {activeStorage.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                      No storage devices currently registered. Select an available storage candidate below to add it to your unified storage pool.
                    </td>
                  </tr>
                ) : (
                  activeStorage.map((dev) => {
                    const isMemberOfPool = primaryPool?.members.some(m => m.deviceId === dev.uuid || m.deviceName === dev.deviceName);

                    return (
                      <React.Fragment key={dev.uuid}>
                        <tr className="hover:bg-slate-800/30 transition">
                          <td className="py-3.5 px-5">
                            <div className="font-semibold text-white flex items-center gap-2">
                              <button onClick={() => togglePartitions(dev.deviceName)} className="text-slate-400 hover:text-white">
                                {expandedPartitions[dev.deviceName] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <span>{dev.deviceModel || dev.model || 'Storage Device'}</span>
                              {dev.detectionSource === 'REAL_HARDWARE' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  ● REAL HARDWARE
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  ● SIMULATION
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                {dev.transport || 'Unknown'}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-400 pl-6 flex items-center gap-2 mt-0.5">
                              <span>{dev.devicePath} ({dev.deviceName})</span>
                              <span>•</span>
                              <span>{dev.isRotational ? 'Rotational (HDD)' : 'Solid-State (SSD/Flash)'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                              {dev.deviceType}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 font-medium">{formatBytes(dev.totalBytes)}</td>
                          <td className="py-3.5 px-5 text-slate-400">{formatBytes(dev.usedBytes)}</td>
                          <td className="py-3.5 px-5 text-emerald-400 font-medium">{formatBytes(dev.freeBytes)}</td>
                          <td className="py-3.5 px-5 font-mono text-xs text-slate-400">{dev.mountPoint || '—'}</td>
                          <td className="py-3.5 px-5">
                            {isMemberOfPool ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                IN POOL
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                REGISTERED
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-right space-x-2">
                            {!isMemberOfPool && primaryPool && (
                              <button
                                onClick={() => handleOpenPoolValidate(primaryPool.id, primaryPool.name, dev)}
                                className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded font-semibold transition"
                              >
                                + Add to Pool
                              </button>
                            )}
                            <button
                              onClick={() => setInspectModalDevice(dev)}
                              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => handleUnregisterDevice(dev.uuid)}
                              className="px-2.5 py-1 text-xs bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 rounded"
                            >
                              Unregister
                            </button>
                          </td>
                        </tr>
                        {/* Partition Accordion */}
                        {expandedPartitions[dev.deviceName] && (
                          <tr className="bg-slate-900/40">
                            <td colSpan={8} className="py-3 px-8">
                              <div className="space-y-1.5">
                                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Partition Table ({dev.partitions?.length || 0}):</span>
                                {dev.partitions?.map((part) => (
                                  <div key={part.path} className="flex items-center justify-between text-xs bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                                    <span className="font-mono text-blue-400">{part.path} ({part.name})</span>
                                    <span>Size: {formatBytes(part.size)}</span>
                                    <span className="uppercase text-slate-400">{part.filesystem || 'raw'}</span>
                                    <span className="font-mono text-slate-500">UUID: {part.uuid || 'N/A'}</span>
                                    <span className="text-slate-400">Mount: {part.mountPoint || 'Not mounted'}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: AVAILABLE STORAGE DEVICES (CANDIDATES) */}
        <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-400" />
                Available Storage Candidates ({availableDevices.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Detected physical drives eligible for cloud pooling (Files are preserved without formatting)</p>
            </div>
            {/* Candidate Attach Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 hidden lg:inline">Add Candidate:</span>
              <button
                onClick={() => handleAttachTestDevice('SSD')}
                disabled={loading}
                className="px-2.5 py-1 text-xs bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 rounded-lg font-medium flex items-center gap-1 transition"
              >
                <Plus className="h-3 w-3" /> USB SSD (1TB)
              </button>
              <button
                onClick={() => handleAttachTestDevice('HDD')}
                disabled={loading}
                className="px-2.5 py-1 text-xs bg-amber-600/15 hover:bg-amber-600/25 text-amber-300 border border-amber-500/30 rounded-lg font-medium flex items-center gap-1 transition"
              >
                <Plus className="h-3 w-3" /> USB HDD (2TB)
              </button>
              <button
                onClick={() => handleAttachTestDevice('FLASH')}
                disabled={loading}
                className="px-2.5 py-1 text-xs bg-purple-600/15 hover:bg-purple-600/25 text-purple-300 border border-purple-500/30 rounded-lg font-medium flex items-center gap-1 transition"
              >
                <Plus className="h-3 w-3" /> Flash (128GB)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {availableDevices.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/20">
                <HardDrive className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">No Unallocated Storage Candidates Currently Connected</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                  Connect any external USB SSD, USB HDD, or Flash drive to the host server, or click below to attach candidate storage to select for your personal cloud:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    onClick={() => handleAttachTestDevice('SSD')}
                    disabled={loading}
                    className="px-3.5 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Attach Candidate USB SSD (1 TB)
                  </button>
                  <button
                    onClick={() => handleAttachTestDevice('HDD')}
                    disabled={loading}
                    className="px-3.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Attach Candidate USB HDD (2 TB)
                  </button>
                  <button
                    onClick={fetchDevices}
                    disabled={loading}
                    className="px-3.5 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Rescan Host Disks
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-5">Device</th>
                    <th className="py-3 px-5">Type</th>
                    <th className="py-3 px-5">Capacity</th>
                    <th className="py-3 px-5">Filesystem</th>
                    <th className="py-3 px-5">Existing Data</th>
                    <th className="py-3 px-5">Partitions</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {availableDevices.map((dev) => (
                    <tr key={dev.uuid} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{dev.deviceModel || dev.model || 'Storage Device'}</span>
                          {dev.detectionSource === 'REAL_HARDWARE' ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              ● REAL HARDWARE
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              ● SIMULATION
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
                            {dev.transport || 'Unknown'}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{dev.devicePath} ({dev.deviceName})</span>
                          <span>•</span>
                          <span>{dev.isRotational ? 'Rotational (HDD)' : 'Solid-State (SSD/Flash)'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {dev.deviceType}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 font-medium">{formatBytes(dev.totalBytes)}</td>
                      <td className="py-3.5 px-5 uppercase font-mono text-xs text-slate-300">{dev.filesystem || 'raw'}</td>
                      <td className="py-3.5 px-5">
                        {dev.hasExistingData ? (
                          <span className="text-xs text-amber-300 font-medium flex items-center gap-1">
                            <FileCheck className="h-3.5 w-3.5" /> Present
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">None</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 font-medium">{dev.partitions?.length || 1} partition(s)</td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          AVAILABLE
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right space-x-2">
                        <button
                          onClick={() => setInspectModalDevice(dev)}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                        >
                          Inspect
                        </button>
                        {primaryPool && (
                          <button
                            onClick={() => handleOpenPoolValidate(primaryPool.id, primaryPool.name, dev)}
                            disabled={loading}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Validate & Add to Pool
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* SECTION 3: PROTECTED SYSTEM DISKS */}
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-rose-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-rose-200">
                  Protected System Disks ({systemDevices.length})
                </h2>
                <p className="text-xs text-rose-300/80">Contains host Operating System, /boot, Docker runtime, or databases. Cannot be added to cloud.</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full uppercase tracking-wider">
              PROTECTED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-rose-950/40 border-b border-rose-500/20 text-xs font-semibold uppercase tracking-wider text-rose-300/70">
                  <th className="py-3 px-5">Device</th>
                  <th className="py-3 px-5">Capacity</th>
                  <th className="py-3 px-5">Mounts</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Protection Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-500/10">
                {systemDevices.map((sysDev) => (
                  <tr key={sysDev.uuid} className="hover:bg-rose-900/10 transition">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-white flex items-center gap-2">
                        <span>{sysDev.deviceModel || sysDev.model || 'Host System Disk'}</span>
                        {sysDev.detectionSource === 'REAL_HARDWARE' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            ● REAL HARDWARE
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            ● SIMULATION
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-500/15 text-blue-300 border border-blue-500/30">
                          {sysDev.transport || 'NVMe'}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-rose-300/70">{sysDev.devicePath} ({sysDev.deviceName})</div>
                    </td>
                    <td className="py-3.5 px-5 font-medium text-slate-300">{formatBytes(sysDev.totalBytes)}</td>
                    <td className="py-3.5 px-5 font-mono text-xs text-slate-300">
                      {sysDev.partitions?.map(p => p.mountPoint).filter(Boolean).join(', ') || sysDev.mountPoint || '/'}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <Lock className="h-3 w-3" /> SYSTEM DISK
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right text-xs text-rose-300 font-medium">
                      Host Root OS (Protected by Backend Guard)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Safety & Architecture Note */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-2 bg-blue-600/10 rounded-lg text-blue-400 border border-blue-500/20 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-sm text-white">Phase 4 Storage Pooling & Data Preservation Guarantee</div>
            <p>
              When a device is added to the storage pool, its capacity is unified logically into the pool mount point.
              <strong className="text-amber-300"> The system will NEVER format, wipe, or overwrite the device.</strong>
              All existing data on member drives remains preserved intact in their original file structures.
            </p>
          </div>
        </div>
      </main>

      {/* MODAL 1: INSPECT DEVICE & PARTITION DETAILS */}
      {inspectModalDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 relative shadow-2xl">
            <button 
              onClick={() => setInspectModalDevice(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-400" /> Storage Device Details
            </h3>

            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-400 shrink-0" />
              <span>Inspection Mode: <strong>No changes have been made to this device.</strong></span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div><span className="text-slate-500">Source:</span> <span className={inspectModalDevice.detectionSource === 'REAL_HARDWARE' ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>{inspectModalDevice.detectionSource === 'REAL_HARDWARE' ? '● Real Hardware (Host OS)' : '● Simulation (macOS Mode)'}</span></div>
              <div><span className="text-slate-500">Connection / Bus:</span> <span className="font-semibold text-blue-300">{inspectModalDevice.transport || 'Unknown'}</span></div>
              <div><span className="text-slate-500">Model:</span> <span className="font-semibold text-white">{inspectModalDevice.model || inspectModalDevice.deviceModel || 'Not reported by hardware'}</span></div>
              <div><span className="text-slate-500">Vendor:</span> <span className="font-semibold text-white">{inspectModalDevice.vendor || 'Not reported by hardware'}</span></div>
              <div><span className="text-slate-500">Serial:</span> <span className="font-mono text-slate-300">{inspectModalDevice.serial || 'Not available'}</span></div>
              <div><span className="text-slate-500">Media Type:</span> <span className="font-mono text-slate-300">{inspectModalDevice.isRotational ? 'Rotational (HDD)' : 'Solid-State (SSD/Flash)'}</span></div>
              <div><span className="text-slate-500">Device Path:</span> <span className="font-mono text-blue-400">{inspectModalDevice.devicePath}</span></div>
              <div><span className="text-slate-500">Capacity:</span> <span className="font-semibold text-white">{formatBytes(inspectModalDevice.totalBytes)} ({inspectModalDevice.totalBytes.toLocaleString()} bytes)</span></div>
              <div><span className="text-slate-500">Filesystem:</span> <span className="uppercase text-slate-300 font-mono">{inspectModalDevice.filesystem || 'raw'}</span></div>
              <div><span className="text-slate-500">UUID:</span> <span className="font-mono text-slate-400 text-[11px] truncate block">{inspectModalDevice.uuid}</span></div>
              <div><span className="text-slate-500">Mount:</span> <span className="text-slate-300">{inspectModalDevice.mountPoint || 'Not mounted'}</span></div>
              <div><span className="text-slate-500">Removable:</span> <span className="text-slate-300">{inspectModalDevice.isRemovable ? 'Yes' : 'No'}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className="font-semibold text-emerald-400">{inspectModalDevice.status}</span></div>
              <div><span className="text-slate-500">System Disk:</span> <span className={inspectModalDevice.isSystemDisk ? 'font-bold text-rose-400' : 'text-slate-300'}>{inspectModalDevice.isSystemDisk ? 'Yes (Protected)' : 'No (Cloud Eligible)'}</span></div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Partition Hierarchy ({inspectModalDevice.partitions?.length || 0}):</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {inspectModalDevice.partitions?.map((part) => (
                  <div key={part.path} className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-blue-400 font-semibold">{part.path}</span>
                      <span className="font-medium text-white">{formatBytes(part.size)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>FS: {part.filesystem || 'raw'} • UUID: {part.uuid || 'N/A'}</span>
                      <span>Mount: {part.mountPoint || 'None'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectModalDevice(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM REGISTRATION MODAL */}
      {registerConfirmDevice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 relative shadow-2xl">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-400" /> Register Storage Device?
            </h3>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between"><span className="text-slate-400">Device:</span> <span className="font-semibold text-white">{registerConfirmDevice.deviceModel}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Path:</span> <span className="font-mono text-blue-400">{registerConfirmDevice.devicePath}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Capacity:</span> <span className="font-medium text-white">{formatBytes(registerConfirmDevice.totalBytes)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Existing Data:</span> <span className={registerConfirmDevice.hasExistingData ? 'text-amber-300 font-semibold' : 'text-slate-400'}>{registerConfirmDevice.hasExistingData ? 'PRESENT' : 'NONE'}</span></div>
            </div>

            {registerConfirmDevice.hasExistingData && (
              <div className="bg-amber-950/40 border border-amber-500/30 text-amber-200 p-3 rounded-xl text-xs">
                <strong>Existing Data Detected:</strong> This storage device already contains files. Registering will catalog it as an existing storage location. <strong>No data will be deleted or formatted.</strong>
              </div>
            )}

            <p className="text-xs text-slate-400">
              Registering this device marks it as a storage candidate in PostgreSQL. <strong>It will NOT format or erase any partitions.</strong>
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRegisterConfirmDevice(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRegisterDevice(registerConfirmDevice.uuid)}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                {registerConfirmDevice.hasExistingData ? 'Register Existing Storage' : 'Register Device'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: POOL VALIDATION & MEMBER ADDITION MODAL */}
      {poolModal.isOpen && poolModal.device && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-blue-500/30 rounded-2xl max-w-lg w-full p-6 space-y-4 relative shadow-2xl">
            <button 
              onClick={() => setPoolModal((prev) => ({ ...prev, isOpen: false }))}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              Add Device to "{poolModal.poolName}"
            </h3>

            {poolModal.validating ? (
              <div className="py-8 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 text-blue-400 animate-spin" />
                <span>Performing safe device validation & partition check...</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Pool:</span>
                    <span className="font-bold text-white">{poolModal.poolName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Device Node:</span>
                    <span className="font-mono text-blue-400">{poolModal.device.devicePath} ({poolModal.device.deviceName})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Model:</span>
                    <span className="font-semibold text-white">{poolModal.device.deviceModel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Capacity:</span>
                    <span className="font-bold text-emerald-400">{formatBytes(poolModal.device.totalBytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Filesystem:</span>
                    <span className="font-mono uppercase text-slate-300">{poolModal.device.filesystem || 'raw'}</span>
                  </div>
                </div>

                {/* Validation Status */}
                {poolModal.validation && (
                  <div className="space-y-2">
                    {poolModal.validation.valid ? (
                      <div className="bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 p-3 rounded-xl text-xs flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Validation Passed: Device is eligible for cloud storage pooling.</span>
                      </div>
                    ) : (
                      <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-rose-200">
                          <AlertTriangle className="h-4 w-4 text-rose-400" /> Device Validation Failed
                        </div>
                        {poolModal.validation.errors?.map((err: string, i: number) => (
                          <div key={i} className="pl-5 text-rose-300">{err}</div>
                        ))}
                      </div>
                    )}

                    {poolModal.validation.warnings?.length > 0 && (
                      <div className="bg-amber-950/40 border border-amber-500/30 text-amber-200 p-3 rounded-xl text-xs space-y-1">
                        <div className="font-semibold text-amber-100 flex items-center gap-1.5">
                          <AlertCircle className="h-4 w-4 text-amber-400" /> Safety Notice:
                        </div>
                        {poolModal.validation.warnings?.map((w: string, i: number) => (
                          <div key={i} className="pl-5 text-amber-200/90">{w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {poolModal.device.hasExistingData && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={poolModal.confirmExistingData}
                      onChange={(e) => setPoolModal((prev) => ({ ...prev, confirmExistingData: e.target.checked }))}
                      className="mt-0.5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0"
                    />
                    <span className="text-slate-300">
                      I confirm that this device contains existing files and authorize adding it to the storage pool non-destructively without formatting.
                    </span>
                  </label>
                )}

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setPoolModal((prev) => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmAddToPool}
                    disabled={loading || (poolModal.validation && !poolModal.validation.valid) || (poolModal.device.hasExistingData && !poolModal.confirmExistingData)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow ${
                      poolModal.validation && !poolModal.validation.valid
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5" /> Confirm & Add to Storage Pool
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
