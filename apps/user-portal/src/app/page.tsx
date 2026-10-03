'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  UploadCloud, 
  Search, 
  Grid, 
  List, 
  Share2, 
  Trash2, 
  Download, 
  ChevronRight, 
  HardDrive, 
  Plus, 
  X, 
  CheckCircle,
  FolderPlus,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
  User,
  LogOut,
  Key
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  type: 'folder' | 'image' | 'document' | 'video';
  size: string;
  modified: string;
  url?: string;
}

export default function UserCloudPortal() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email: string; role: string; nextcloudUser: string } | null>(null);
  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [activeTab, setActiveTab] = useState<'files' | 'photos' | 'shared' | 'trash'>('files');
  const [currentFolder, setCurrentFolder] = useState<string[]>(['']);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  // Real Physical Disk & Quota State
  const [quota, setQuota] = useState<{ usedStr: string; totalStr: string; freeStr: string; percent: number }>({
    usedStr: '0 MB',
    totalStr: 'Detecting Storage...',
    freeStr: '...',
    percent: 0,
  });

  const [diskInfo, setDiskInfo] = useState<{
    name: string;
    label: string;
    device: string;
    mountPoint: string | null;
    filesystem: string;
    freeStr: string;
    totalStr: string;
    usedStr: string;
    isPhysical: boolean;
    isMounted?: boolean;
    isConnected?: boolean;
    status: string;
  } | null>(null);

  const [poolInfo, setPoolInfo] = useState<{
    name: string;
    isConnected: boolean;
    memberCount: number;
    members?: { name: string; model: string; size: number }[];
  } | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);

  const getFolderPath = useCallback(() => {
    const joined = currentFolder.filter(Boolean).join('/');
    return joined ? `/${joined}` : '/';
  }, [currentFolder]);

  const fetchCloudFiles = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    const folderPath = getFolderPath();
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';

    try {
      // 1. First check real-time physical drive connection and quota
      let isConnected = true;
      const quotaRes = await fetch(`${apiUrl}/files/quota?user=${encodeURIComponent(username)}`);
      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        const usedStr = quotaData.quota?.usedStr || `${((quotaData.quota?.used || 0) / (1024 * 1024)).toFixed(1)} MB`;
        const totalGb = Math.round((quotaData.quota?.total || 0) / 1e9);
        const freeGb = ((quotaData.quota?.free || 0) / 1e9).toFixed(1);

        isConnected = quotaData.isStorageConnected ?? (quotaData.disk?.status === 'ONLINE' && quotaData.disk?.isConnected !== false);

        setQuota({
          usedStr: usedStr,
          totalStr: quotaData.quota?.totalStr || (totalGb > 0 ? `${totalGb} GB` : 'Cloud Quota'),
          freeStr: quotaData.quota?.freeStr || `${freeGb} GB`,
          percent: Math.min(100, Math.max(1, Math.round(quotaData.quota?.relative || 1))),
        });

        if (quotaData.disk) {
          setDiskInfo({
            ...quotaData.disk,
            isConnected,
          });
        }

        if (quotaData.pool) {
          setPoolInfo(quotaData.pool);
        }
      }

      // 2. CRITICAL SAFETY GUARD: If physical disk is ejected or disconnected, NEVER show files on dashboard!
      if (!isConnected) {
        setFiles([]);
        return;
      }

      // 3. Drive is connected and online: fetch files
      const res = await fetch(`${apiUrl}/files/list?user=${encodeURIComponent(username)}&path=${encodeURIComponent(folderPath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.isStorageConnected === false) {
          setFiles([]);
          return;
        }
        if (data.items) {
          const mapped: FileItem[] = data.items.map((item: any) => {
            const isImg = item.mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item.basename);
            const isVid = item.mime?.startsWith('video/') || /\.(mp4|mov|mkv)$/i.test(item.basename);
            const cleanPath = item.filename.startsWith('/remote.php/dav/files/' + username)
              ? item.filename.replace('/remote.php/dav/files/' + username, '')
              : item.filename;

            return {
              name: item.basename,
              path: cleanPath,
              type: item.type === 'directory' ? 'folder' : isImg ? 'image' : isVid ? 'video' : 'document',
              size: item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : 'Folder',
              modified: new Date(item.lastmod).toLocaleDateString(),
              url: isImg ? `${apiUrl}/files/download?path=${encodeURIComponent(cleanPath)}&user=${encodeURIComponent(username)}` : undefined,
            };
          });
          setFiles(mapped);
        }
      }
    } catch {
      // Fallback
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [getFolderPath, currentUser]);

  // Load session from localStorage on initial render
  useEffect(() => {
    const savedUser = localStorage.getItem('cloudnas_user');
    const savedToken = localStorage.getItem('cloudnas_token');
    if (savedUser && savedToken) {
      try {
        setCurrentUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      }
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  // Live polling when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchCloudFiles();
      const timer = setInterval(() => {
        fetchCloudFiles(true);
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [fetchCloudFiles, isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both User ID and Password');
      return;
    }

    setLoginError(null);
    setIsSubmittingLogin(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: loginId.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('cloudnas_token', data.token);
        localStorage.setItem('cloudnas_user', JSON.stringify(data.user));
        setCurrentUser(data.user);
        setIsAuthenticated(true);
        setLoginPassword('');
        setLoginError(null);
      } else {
        setLoginError(data.error || 'Invalid User ID or password');
      }
    } catch (err: any) {
      setLoginError(`Connection error: ${err.message || 'Failed to reach cloud backend'}`);
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cloudnas_token');
    localStorage.removeItem('cloudnas_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setFiles([]);
  };

  const photos = files.filter(f => f.type === 'image');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Hardware Safety Guard: prevent uploading when drive is disconnected / ejected
    if (diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')) {
      alert('⚠️ Cannot upload file: The physical CloudNAS storage drive is disconnected or ejected. Please reconnect your drive first.');
      if (e.target) e.target.value = '';
      return;
    }

    setUploadProgress(15);
    const interval = setInterval(() => {
      setUploadProgress(prev => (prev === null || prev >= 90 ? 90 : prev + 25));
    }, 200);

    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    try {
      const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', getFolderPath());

      const res = await fetch(`${apiUrl}/files/upload?user=${encodeURIComponent(username)}`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(null), 1200);

      if (res.ok) {
        fetchCloudFiles();
      } else {
        const errData = await res.json().catch(() => null);
        alert(errData?.error || 'Upload failed');
      }
    } catch (err: any) {
      clearInterval(interval);
      setUploadProgress(null);
      alert(`Upload error: ${err.message || 'Network request failed'}`);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
    try {
      const res = await fetch(`${apiUrl}/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': username },
        body: JSON.stringify({
          path: getFolderPath(),
          name: newFolderName.trim(),
        }),
      });

      if (res.ok) {
        setShowNewFolderModal(false);
        setNewFolderName('');
        fetchCloudFiles();
      }
    } catch {
      setShowNewFolderModal(false);
    }
  };

  const handleDeleteFile = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Move this item to trash?')) return;

    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
    try {
      const res = await fetch(`${apiUrl}/files/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-id': username },
        body: JSON.stringify({ path: filePath }),
      });
      if (res.ok) {
        fetchCloudFiles();
      }
    } catch {
      //
    }
  };

  const handleDownload = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
    window.open(`${apiUrl}/files/download?path=${encodeURIComponent(filePath)}&user=${encodeURIComponent(username)}`, '_blank');
  };

  const navigateIntoFolder = (folderName: string) => {
    setCurrentFolder(prev => [...prev, folderName]);
  };

  const navigateBack = (index: number) => {
    setCurrentFolder(prev => prev.slice(0, index + 1));
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Session Check Loading State
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen w-full bg-[#0a0f1d] flex flex-col items-center justify-center text-slate-400 font-sans">
        <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-300">Checking CloudNAS Session...</p>
      </div>
    );
  }

  // Not Logged In - High-End Login Interface
  if (isAuthenticated === false) {
    return (
      <div className="min-h-screen w-full bg-[#0a0f1d] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-blue-600/15 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[350px] h-[350px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-md bg-[#11192e]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
          {/* Header & Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex p-3.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 mb-4 text-white">
              <HardDrive className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">CloudNAS User Portal</h1>
            <p className="text-slate-400 text-xs mt-1.5">Sign in to access your physical cloud storage files</p>
          </div>

          {/* Error Banner */}
          {loginError && (
            <div className="mb-5 p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2.5 animate-shake">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                User ID / Username
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter your User ID"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmittingLogin ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Sign In to Cloud</span>
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <span>🔒 Single copy physical storage</span>
              <span>•</span>
              <span>Hardware guarded</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b0f19] text-slate-100 overflow-hidden">
      {/* Sidebar (Desktop / Tablet) */}
      <aside className="w-64 bg-[#111728] border-r border-slate-800 p-5 hidden md:flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          {/* Logo */}
          <div className="flex items-center gap-3 px-2">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight">Personal Cloud</span>
              <span className="block text-[11px] text-blue-400 font-medium">Nextcloud File Engine</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-medium text-sm rounded-xl cursor-pointer shadow-lg shadow-blue-600/20 transition">
              <Plus className="h-4 w-4" /> Upload File
              <input type="file" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              onClick={() => setShowNewFolderModal(true)}
              className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition"
            >
              <FolderPlus className="h-4 w-4" /> New Folder
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'files' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Folder className="h-4 w-4" /> My Files
            </button>
            <button
              onClick={() => setActiveTab('photos')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'photos' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <ImageIcon className="h-4 w-4" /> Photos & Gallery
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'shared' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Share2 className="h-4 w-4" /> Shared Links
            </button>
            <button
              onClick={() => setActiveTab('trash')}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                activeTab === 'trash' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Trash2 className="h-4 w-4" /> Trash
            </button>
          </nav>
        </div>

        {/* Real Physical Disk & Available Space Widget */}
        <div className={`border p-4 rounded-2xl shadow-lg transition ${
          diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
            ? 'bg-[#1e131d] border-rose-900/60'
            : 'bg-[#161f36] border-slate-800'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2.5">
            <div className="flex items-center gap-1.5">
              <HardDrive className={`h-4 w-4 ${
                diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'text-rose-400' : 'text-blue-400'
              }`} />
              <span className="font-semibold text-slate-200 truncate max-w-[130px]" title={diskInfo?.name || 'SanDisk 3.2Gen1'}>
                {diskInfo?.name || 'CloudNAS'}
              </span>
            </div>
            {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-medium">
                Ejected / Offline
              </span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                Physical Disk
              </span>
            )}
          </div>

          {/* Available Space - Large Highlight */}
          <div className="mb-2.5">
            {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? (
              <div>
                <div className="text-base font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                  Disk Disconnected
                </div>
                <p className="text-[11px] text-rose-300/80 mt-1 leading-snug">
                  CloudNAS drive was ejected. Reconnect USB drive to store files.
                </p>
              </div>
            ) : (
              <>
                <div className="text-xl font-bold text-slate-100 flex items-baseline justify-between">
                  <span>{diskInfo?.freeStr || quota.freeStr}</span>
                  <span className="text-xs font-medium text-emerald-400">Available Free</span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between mt-1">
                  <span>{quota.usedStr} used</span>
                  <span className="text-slate-300 font-medium">{quota.totalStr} Total</span>
                </div>
              </>
            )}
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                  ? 'bg-rose-500/40 w-full'
                  : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
              }`}
              style={{ width: diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? '100%' : `${Math.max(2, quota.percent)}%` }}
            />
          </div>

          {/* Storage Destination Proof */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Disk Volume:</span>
              <span className={diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'text-rose-400 font-medium' : 'text-slate-200 font-medium'}>
                {diskInfo?.device || 'disk12'} ({diskInfo?.label || 'CloudNAS'})
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Hardware Status:</span>
              <span className={`font-mono font-medium truncate max-w-[125px] ${
                diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                  ? 'text-rose-400 font-bold'
                  : 'text-emerald-400'
              }`}>
                {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                  ? 'DISCONNECTED'
                  : (diskInfo?.mountPoint || '/Volumes/CloudNAS')}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main View Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 px-4 md:px-8 flex items-center justify-between gap-4 bg-[#0d1322]">
          {/* Search bar */}
          <div className="flex-1 max-w-md relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search files, photos, folders in Nextcloud..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* View Toggles & Actions */}
          <div className="flex items-center gap-3">
            {/* Active Physical Disk Badge */}
            {diskInfo && (
              <div className={`hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs border transition ${
                diskInfo.isConnected !== false && diskInfo.status === 'ONLINE'
                  ? 'bg-slate-800/80 border-slate-700/80'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}>
                <div className={`h-2 w-2 rounded-full ${
                  diskInfo.isConnected !== false && diskInfo.status === 'ONLINE'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500 animate-ping'
                }`} />
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs truncate max-w-[160px]">
                    <HardDrive className={`h-3.5 w-3.5 ${
                      diskInfo.isConnected !== false && diskInfo.status === 'ONLINE' ? 'text-blue-400' : 'text-rose-400'
                    }`} />
                    {diskInfo.name || 'SanDisk 3.2Gen1'}
                  </span>
                  <span className={`text-[10px] font-medium ${
                    diskInfo.isConnected !== false && diskInfo.status === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400 font-semibold'
                  }`}>
                    {diskInfo.isConnected !== false && diskInfo.status === 'ONLINE'
                      ? `${diskInfo.freeStr || quota.freeStr} Available`
                      : '⚠️ Ejected / Offline'}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={() => fetchCloudFiles()}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh from Nextcloud"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>

            {/* Logged in User Profile & Sign Out Button */}
            <div className="flex items-center gap-2 pl-3 border-l border-slate-700/80">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/40 flex items-center justify-center font-bold text-xs text-white shadow-sm">
                {(currentUser?.name || currentUser?.id || 'U')[0].toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[110px]" title={currentUser?.name || currentUser?.id || 'User'}>
                  {currentUser?.name || currentUser?.id || 'User'}
                </span>
                <span className="text-[10px] text-blue-400 font-medium">@{currentUser?.id || 'clouduser'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 ml-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Upload Progress Notification */}
        {uploadProgress !== null && (
          <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium animate-pulse">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 animate-bounce" />
              <span>Uploading to Nextcloud Storage: {uploadProgress}%</span>
            </div>
            {uploadProgress === 100 && (
              <span className="flex items-center gap-1 font-semibold"><CheckCircle className="h-3.5 w-3.5" /> Upload Complete</span>
            )}
          </div>
        )}

        {/* Content Explorer */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-lg mx-auto">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-2xl">
                  <HardDrive className="h-12 w-12 text-rose-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-rose-600 text-white rounded-full p-1.5 shadow-lg">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider mb-3">
                Storage Disk Ejected
              </span>

              <h2 className="text-2xl font-bold text-white mb-2">
                Physical Cloud Storage Disconnected
              </h2>

              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                Your cloud files and documents are stored physically on <span className="text-slate-200 font-semibold">{diskInfo?.name || 'CloudNAS'}</span>. For your privacy and storage safety, your personal data is locked and hidden while the physical drive is disconnected.
              </p>

              <div className="w-full bg-[#161f36] border border-slate-800 rounded-2xl p-4 text-xs text-left mb-6 space-y-2.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Storage Volume:</span>
                  <span className="text-slate-200 font-medium">{diskInfo?.device || 'disk12'} ({diskInfo?.label || 'CloudNAS'})</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Drive Status:</span>
                  <span className="text-rose-400 font-bold flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                    EJECTED / DISCONNECTED
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Data Protection Guard:</span>
                  <span className="text-emerald-400 font-medium">Active (Files Hidden)</span>
                </div>
              </div>

              <button
                onClick={() => fetchCloudFiles()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 transition"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Check Connection Again
              </button>
            </div>
          ) : (
            <>
              {/* Breadcrumb Path */}
              <div className="flex items-center gap-1 text-sm text-slate-400 mb-6 font-medium">
                <button
                  onClick={() => setCurrentFolder([''])}
                  className={`hover:text-blue-400 transition ${currentFolder.length === 1 ? 'text-white font-semibold' : ''}`}
                >
                  My Cloud
                </button>
                {currentFolder.filter(Boolean).map((crumb, idx) => (
                  <React.Fragment key={crumb}>
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                    <button
                      onClick={() => navigateBack(idx + 1)}
                      className={`hover:text-blue-400 transition ${idx === currentFolder.filter(Boolean).length - 1 ? 'text-white font-semibold' : ''}`}
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* TAB 1: ALL FILES */}
              {activeTab === 'files' && (
                <div>
                  {files.length === 0 && !loading && (
                    <div className="text-center py-16 text-slate-500 text-sm">
                      <Folder className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      This folder is empty. Upload a file or create a folder.
                    </div>
                  )}

                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {filteredFiles.map((file) => (
                        <div
                          key={file.name}
                          onClick={() => file.type === 'folder' ? navigateIntoFolder(file.name) : setPreviewFile(file)}
                          className="bg-[#131b2e] hover:bg-[#1a253f] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition group shadow-sm relative"
                        >
                          <div className="aspect-square rounded-xl bg-slate-900/60 flex items-center justify-center mb-3 overflow-hidden">
                            {file.type === 'folder' && <Folder className="h-12 w-12 text-blue-400 fill-blue-500/20" />}
                            {file.type === 'image' && file.url && (
                              <img src={file.url} alt={file.name} className="h-full w-full object-cover group-hover:scale-105 transition" />
                            )}
                            {file.type === 'document' && <FileText className="h-10 w-10 text-emerald-400" />}
                            {file.type === 'video' && <Film className="h-10 w-10 text-purple-400" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-blue-400 transition">{file.name}</div>
                            <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                              <span>{file.size}</span>
                              <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                                {file.type !== 'folder' && (
                                  <button onClick={(e) => handleDownload(file.path, e)} title="Download">
                                    <Download className="h-3.5 w-3.5 text-slate-300 hover:text-white" />
                                  </button>
                                )}
                                <button onClick={(e) => handleDeleteFile(file.path, e)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5 text-rose-400 hover:text-rose-300" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
                      <div className="divide-y divide-slate-800 text-sm">
                        {filteredFiles.map((file) => (
                          <div
                            key={file.name}
                            onClick={() => file.type === 'folder' ? navigateIntoFolder(file.name) : setPreviewFile(file)}
                            className="flex items-center justify-between p-3.5 hover:bg-slate-800/40 cursor-pointer transition"
                          >
                            <div className="flex items-center gap-3">
                              {file.type === 'folder' ? <Folder className="h-5 w-5 text-blue-400" /> : <FileText className="h-5 w-5 text-slate-400" />}
                              <span className="font-medium text-slate-200">{file.name}</span>
                            </div>
                            <div className="flex items-center gap-6 text-xs text-slate-400">
                              <span>{file.size}</span>
                              <span>{file.modified}</span>
                              {file.type !== 'folder' && (
                                <button onClick={(e) => handleDownload(file.path, e)} className="p-1 hover:text-slate-200">
                                  <Download className="h-4 w-4" />
                                </button>
                              )}
                              <button onClick={(e) => handleDeleteFile(file.path, e)} className="p-1 hover:text-rose-400">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PHOTOS GALLERY */}
              {activeTab === 'photos' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Photos & Moments</h2>
                    <span className="text-xs text-slate-400">{photos.length} Photos in Nextcloud</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map((photo) => (
                      <div 
                        key={photo.name}
                        onClick={() => setPreviewFile(photo)}
                        className="aspect-square bg-slate-900 rounded-2xl overflow-hidden cursor-pointer relative group border border-slate-800"
                      >
                        <img src={photo.url} alt={photo.name} className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition p-3 flex flex-col justify-end">
                          <div className="text-xs font-semibold text-white truncate">{photo.name}</div>
                          <div className="text-[10px] text-slate-300">{photo.size}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolder} className="bg-[#111726] border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-400" /> Create New Folder
            </h3>
            <input
              type="text"
              placeholder="Folder Name (e.g. Projects)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 relative">
            <button 
              onClick={() => setPreviewFile(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="font-bold text-lg text-white mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-400" /> {previewFile.name}
            </h3>
            <div className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center min-h-[300px] border border-slate-800 mb-4">
              {previewFile.type === 'image' && previewFile.url ? (
                <img src={previewFile.url} alt={previewFile.name} className="max-h-[400px] object-contain" />
              ) : (
                <div className="text-center p-8">
                  <FileText className="h-16 w-16 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Document preview ready via Nextcloud PDF viewer</p>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Size: {previewFile.size} • Modified: {previewFile.modified}</span>
              <button 
                onClick={(e) => handleDownload(previewFile.path, e)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
