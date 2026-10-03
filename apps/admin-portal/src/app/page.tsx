'use client';

import React, { useState, useEffect } from 'react';
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
  Database,
  ExternalLink,
  Bell
} from 'lucide-react';

interface StorageDevice {
  deviceName: string;
  devicePath: string;
  deviceModel: string;
  deviceType: string;
  filesystem: string | null;
  uuid: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  mountPoint: string | null;
  isCloudStorage: boolean;
  status: string;
}

interface PoolSummary {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  percentUsed: number;
  activeDeviceCount: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 GB';
  const k = 1000;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function AdminDashboard() {
  const [devices, setDevices] = useState<StorageDevice[]>([]);
  const [pool, setPool] = useState<PoolSummary>({
    totalBytes: 1250000000000,
    usedBytes: 462000000000,
    freeBytes: 788000000000,
    percentUsed: 37,
    activeDeviceCount: 2,
    status: 'HEALTHY',
  });
  const [cpuUsage, setCpuUsage] = useState(14.8);
  const [ramPercent, setRamPercent] = useState(28);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchDevices = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/storage/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
      const poolRes = await fetch('http://localhost:4000/api/storage/status');
      if (poolRes.ok) {
        const poolData = await poolRes.json();
        setPool(poolData.pool || pool);
      }
    } catch {
      // Fallback local mock state if backend is booting
      setDevices([
        {
          deviceName: 'nvme0n1p2',
          devicePath: '/dev/nvme0n1p2',
          deviceModel: 'Samsung 980 PRO NVMe',
          deviceType: 'INTERNAL_SSD',
          filesystem: 'ext4',
          uuid: 'a4b2c1d0-1111-4444-8888-000000000001',
          totalBytes: 250000000000,
          usedBytes: 82000000000,
          freeBytes: 168000000000,
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
          totalBytes: 1000000000000,
          usedBytes: 380000000000,
          freeBytes: 620000000000,
          mountPoint: '/mnt/devices/usb-hdd1',
          isCloudStorage: true,
          status: 'ACTIVE',
        },
        {
          deviceName: 'sdc1',
          devicePath: '/dev/sdc1',
          deviceModel: 'Samsung USB SSD T7',
          deviceType: 'USB_SSD',
          filesystem: 'ext4',
          uuid: 'c6d4e3f2-3333-6666-aaaa-000000000003',
          totalBytes: 500000000000,
          usedBytes: 28000000000,
          freeBytes: 472000000000,
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
          totalBytes: 128000000000,
          usedBytes: 38000000000,
          freeBytes: 90000000000,
          mountPoint: null,
          isCloudStorage: false,
          status: 'AVAILABLE',
        }
      ]);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddToPool = async (uuid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/storage/devices/${uuid}/add`, { method: 'POST' });
      if (res.ok) {
        setActionMessage('Device added to Cloud Storage Pool successfully!');
        fetchDevices();
      }
    } catch {
      // Mock toggle
      setDevices((prev) =>
        prev.map((d) =>
          d.uuid === uuid ? { ...d, isCloudStorage: true, status: 'ACTIVE', mountPoint: `/mnt/devices/${d.deviceName}` } : d
        )
      );
      setActionMessage('Device added to Cloud Storage Pool (Simulation Mode).');
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleRemoveFromPool = async (uuid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/storage/devices/${uuid}/remove`, { method: 'POST' });
      if (res.ok) {
        setActionMessage('Device deactivated from Cloud Storage Pool.');
        fetchDevices();
      }
    } catch {
      // Mock toggle
      setDevices((prev) =>
        prev.map((d) =>
          d.uuid === uuid ? { ...d, isCloudStorage: false, status: 'AVAILABLE', mountPoint: null } : d
        )
      );
      setActionMessage('Device deactivated from Cloud Storage Pool (Simulation Mode).');
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const unattachedDevice = devices.find((d) => !d.isCloudStorage);

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
              <p className="text-sm text-slate-400">Host Physical Hardware & Nextcloud Storage Pool Controller</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchDevices}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium border border-slate-700 transition"
          >
            <RefreshCw className="h-4 w-4" /> Refresh Devices
          </button>
          <a 
            href="http://localhost:3000" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition shadow-sm"
          >
            Open User Portal <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 space-y-6">
        {/* Action toast */}
        {actionMessage && (
          <div className="bg-blue-950/50 border border-blue-500/30 text-blue-200 px-4 py-3 rounded-xl flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
            <span className="text-sm font-medium">{actionMessage}</span>
          </div>
        )}

        {/* New Device Detected Hot-Plug Card */}
        {unattachedDevice && (
          <div className="bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900/60 border border-amber-500/40 rounded-2xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400 border border-amber-500/30">
                  <Bell className="h-6 w-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-amber-200 flex items-center gap-2">
                    New Storage Device Detected on Host
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Device: <span className="font-semibold text-white">{unattachedDevice.deviceModel}</span> ({unattachedDevice.deviceName}) •
                    Capacity: <span className="text-white font-medium">{formatBytes(unattachedDevice.totalBytes)}</span> • 
                    Filesystem: <span className="text-amber-400 uppercase font-mono text-xs">{unattachedDevice.filesystem || 'raw'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleAddToPool(unattachedDevice.uuid)}
                  disabled={loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition"
                >
                  <Plus className="h-4 w-4" /> Use as Cloud Storage
                </button>
                <button
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition"
                >
                  Ignore
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Telemetry Overview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Storage Pool</span>
              <HardDrive className="h-5 w-5 text-blue-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">{formatBytes(pool.usedBytes)} <span className="text-sm font-normal text-slate-400">/ {formatBytes(pool.totalBytes)}</span></div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${pool.percentUsed}%` }}></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>Free: {formatBytes(pool.freeBytes)}</span>
                <span className="text-blue-400 font-medium">{pool.percentUsed}% Allocated</span>
              </div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU Usage</span>
              <Cpu className="h-5 w-5 text-purple-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">{cpuUsage}%</div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-purple-500 h-2 rounded-full transition-all duration-500" style={{ width: `${cpuUsage}%` }}></div>
              </div>
              <div className="text-xs text-slate-400 mt-2">Host Quad-Core Processor Normal</div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">RAM Allocation</span>
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-white">{ramPercent}%</div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${ramPercent}%` }}></div>
              </div>
              <div className="text-xs text-slate-400 mt-2">4.2 GB / 16.0 GB Used</div>
            </div>
          </div>

          <div className="bg-[#111726] border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Docker Services</span>
              <Layers className="h-5 w-5 text-cyan-400" />
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">Nextcloud WebDAV</span>
                <span className="text-emerald-400 font-medium">RUNNING</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">PostgreSQL 16</span>
                <span className="text-emerald-400 font-medium">HEALTHY</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-300">Redis Cache</span>
                <span className="text-emerald-400 font-medium">ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Storage Devices Table */}
        <div className="bg-[#111726] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-400" />
                Physical Storage Devices
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Detected NVMe, Internal SATA, and USB External Block Devices</p>
            </div>
            <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              Active in Pool: <span className="text-blue-400 font-bold">{devices.filter(d => d.isCloudStorage).length}</span> / {devices.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-5">Device</th>
                  <th className="py-3.5 px-5">Type</th>
                  <th className="py-3.5 px-5">Capacity</th>
                  <th className="py-3.5 px-5">Free</th>
                  <th className="py-3.5 px-5">Filesystem</th>
                  <th className="py-3.5 px-5">Mount Point</th>
                  <th className="py-3.5 px-5">Status</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {devices.map((dev) => (
                  <tr key={dev.uuid} className="hover:bg-slate-800/30 transition">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-white">{dev.deviceModel}</div>
                      <div className="text-xs font-mono text-slate-400">{dev.deviceName} ({dev.devicePath})</div>
                    </td>
                    <td className="py-4 px-5">
                      <span className="inline-block px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {dev.deviceType.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-4 px-5 font-medium text-slate-200">{formatBytes(dev.totalBytes)}</td>
                    <td className="py-4 px-5 text-emerald-400 font-medium">{formatBytes(dev.freeBytes)}</td>
                    <td className="py-4 px-5 font-mono text-xs uppercase text-slate-300">{dev.filesystem || 'raw'}</td>
                    <td className="py-4 px-5 font-mono text-xs text-slate-400">{dev.mountPoint || '—'}</td>
                    <td className="py-4 px-5">
                      {dev.isCloudStorage ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-right">
                      {dev.isCloudStorage ? (
                        <button
                          onClick={() => handleRemoveFromPool(dev.uuid)}
                          disabled={loading}
                          className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-medium transition"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddToPool(dev.uuid)}
                          disabled={loading}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition shadow-sm"
                        >
                          Add to Cloud
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Data Safety & Architecture Notice */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
          <div className="p-2 bg-blue-600/10 rounded-lg text-blue-400 border border-blue-500/20 shrink-0">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="text-xs text-slate-300 space-y-1">
            <div className="font-semibold text-sm text-white">Storage Pooling Architecture Note (mergerfs)</div>
            <p>
              The Cloud Storage Pool aggregates storage capacity across disparate physical drives without reformatting. 
              <strong className="text-amber-300"> Storage pooling combines capacity; it does not provide data mirroring or RAID redundancy.</strong>
              If a drive is physically disconnected, the system safely isolates the branch while remaining branches remain fully accessible.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
