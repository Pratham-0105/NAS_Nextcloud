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
  Radio
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
  deviceModel: string;
  vendor?: string | null;
  model?: string | null;
  serial?: string | null;
  deviceType: string;
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
  const [pool, setPool] = useState<PoolSummary>({
    totalBytes: 1000000000000,
    usedBytes: 380000000000,
    freeBytes: 620000000000,
    percentUsed: 38,
    activeDeviceCount: 1,
    status: 'HEALTHY',
  });
  const [cpuUsage, setCpuUsage] = useState(18.2);
  const [ramPercent, setRamPercent] = useState(34);
  const [dockerStatus, setDockerStatus] = useState({ nextcloud: true, postgres: true, redis: true });
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Inspection Drawer & Registration Modals
  const [selectedDevice, setSelectedDevice] = useState<StorageDevice | null>(null);
  const [inspectModalDevice, setInspectModalDevice] = useState<StorageDevice | null>(null);
  const [registerConfirmDevice, setRegisterConfirmDevice] = useState<StorageDevice | null>(null);
  const [expandedPartitions, setExpandedPartitions] = useState<Record<string, boolean>>({});

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
          } else if (payload.type?.startsWith('storage.device.')) {
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
        setActionMessage(data.message || 'Device unregistered successfully.');
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

  // Group devices into 3 distinct sections
  const activeStorage = devices.filter((d) => d.isCloudStorage && !d.isSystemDisk);
  const availableDevices = devices.filter((d) => !d.isCloudStorage && !d.isSystemDisk);
  const systemDevices = devices.filter((d) => d.isSystemDisk);

  const hotPlugCandidate = availableDevices[0];

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
                  ONLINE
                </span>
              </h1>
              <p className="text-sm text-slate-400">Hardware Detection, Partition Inspection & Safe Device Registration</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchDevices}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw className="h-4 w-4" /> Rescan Host Disks
          </button>
          <a 
            href="http://localhost:3002" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition shadow-sm"
          >
            Open User Portal <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 space-y-6">
        {/* Action toast */}
        {actionMessage && (
          <div className="bg-blue-950/60 border border-blue-500/40 text-blue-200 px-4 py-3 rounded-xl flex items-center gap-3 animate-fade-in shadow-md">
            <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
            <span className="text-sm font-medium">{actionMessage}</span>
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
                  onClick={() => setRegisterConfirmDevice(hotPlugCandidate)}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Register as Cloud Storage
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Telemetry Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cloud Storage Pool</span>
              <HardDrive className="h-5 w-5 text-blue-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">
                {formatBytes(pool.usedBytes)} <span className="text-sm font-normal text-slate-400">/ {formatBytes(pool.totalBytes)}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pool.percentUsed}%` }}></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Free: {formatBytes(pool.freeBytes)}</span>
                <span className="text-blue-400 font-medium">{pool.activeDeviceCount} Registered Drive(s)</span>
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

        {/* SECTION 1: ACTIVE CLOUD STORAGE */}
        <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                Active Registered Cloud Storage ({activeStorage.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Disks explicitly registered to participate in the cloud storage pool</p>
            </div>
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
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {activeStorage.map((dev) => (
                  <React.Fragment key={dev.uuid}>
                    <tr className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <button onClick={() => togglePartitions(dev.deviceName)} className="text-slate-400 hover:text-white">
                            {expandedPartitions[dev.deviceName] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          {dev.deviceModel}
                        </div>
                        <div className="text-xs font-mono text-slate-400 pl-6">{dev.devicePath} ({dev.deviceName})</div>
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
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> REGISTERED
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right space-x-2">
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
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: AVAILABLE STORAGE DEVICES (CANDIDATES) */}
        <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-400" />
                Available Storage Candidates ({availableDevices.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Detected physical drives eligible for registration (Files are preserved without formatting)</p>
            </div>
          </div>

          <div className="overflow-x-auto">
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
                      <div className="font-semibold text-white">{dev.deviceModel}</div>
                      <div className="text-xs font-mono text-slate-400">{dev.devicePath} ({dev.deviceName})</div>
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
                      <button
                        onClick={() => setRegisterConfirmDevice(dev)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-sm transition"
                      >
                        Register
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <div className="font-semibold text-white">{sysDev.deviceModel}</div>
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
            <div className="font-semibold text-sm text-white">Phase 3 Storage Management Safety Guarantee</div>
            <p>
              Registering a storage device only updates the catalog state in PostgreSQL. 
              <strong className="text-amber-300"> The system will NEVER automatically format, repartition, or wipe any disk.</strong>
              All existing data on candidate drives remains completely preserved.
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
              <div><span className="text-slate-500">Model:</span> <span className="font-semibold text-white">{inspectModalDevice.deviceModel}</span></div>
              <div><span className="text-slate-500">Device Path:</span> <span className="font-mono text-blue-400">{inspectModalDevice.devicePath}</span></div>
              <div><span className="text-slate-500">Capacity:</span> <span className="font-semibold text-white">{formatBytes(inspectModalDevice.totalBytes)}</span></div>
              <div><span className="text-slate-500">Type:</span> <span className="font-mono text-slate-300">{inspectModalDevice.deviceType}</span></div>
              <div><span className="text-slate-500">Filesystem:</span> <span className="uppercase text-slate-300 font-mono">{inspectModalDevice.filesystem || 'raw'}</span></div>
              <div><span className="text-slate-500">UUID:</span> <span className="font-mono text-slate-400 text-[11px] truncate block">{inspectModalDevice.uuid}</span></div>
              <div><span className="text-slate-500">Mount:</span> <span className="text-slate-300">{inspectModalDevice.mountPoint || 'Not mounted'}</span></div>
              <div><span className="text-slate-500">Status:</span> <span className="font-semibold text-emerald-400">{inspectModalDevice.status}</span></div>
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
    </div>
  );
}
