'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Key,
  Menu,
  FileUp,
  FolderUp,
  Zap,
  Clock,
  Sparkles,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  FileCode,
  Music,
  Archive,
  Layers,
  Check
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  type: 'folder' | 'image' | 'document' | 'video';
  size: string;
  modified: string;
  url?: string;
}

export interface UploadQueueItem {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  sizeFormatted: string;
  progress: number;
  loadedBytes: number;
  status: 'queued' | 'uploading' | 'completed' | 'error';
  speedStr?: string;
  error?: string;
  file: File;
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

  // Mobile Navigation States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileStorageOpen, setMobileStorageOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'files' | 'photos' | 'shared' | 'trash'>('files');
  const [currentFolder, setCurrentFolder] = useState<string[]>(['']);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  // Advanced Upload Engine & Queue State
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadManagerOpen, setUploadManagerOpen] = useState(false);
  const [uploadManagerMinimized, setUploadManagerMinimized] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentSpeedStr, setCurrentSpeedStr] = useState<string>('0 KB/s');
  const [uploadEtaStr, setUploadEtaStr] = useState<string>('');

  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-File Selection & Bulk Deletion State
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);



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

  // Storage Drives View States
  const [selectedDisk, setSelectedDisk] = useState<any | null>(null);
  const [disksList, setDisksList] = useState<any[]>([]);

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

        if (quotaData.disks && Array.isArray(quotaData.disks) && quotaData.disks.length > 0) {
          setDisksList(quotaData.disks);
        } else if (quotaData.disk) {
          setDisksList([quotaData.disk]);
        }

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

  // Size Formatter
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  // Enqueue Files & Folders for Upload
  const enqueueFiles = useCallback((itemsList: { file: File; relativePath?: string }[]) => {
    if (!itemsList || itemsList.length === 0) return;

    if (diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')) {
      alert('⚠️ Cannot upload files: The physical CloudNAS storage drive is disconnected or ejected. Please reconnect your drive first.');
      return;
    }

    const newItems: UploadQueueItem[] = itemsList.map(({ file, relativePath }) => ({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: file.name,
      relativePath: relativePath || (file as any).webkitRelativePath || '',
      size: file.size,
      sizeFormatted: formatBytes(file.size),
      progress: 0,
      loadedBytes: 0,
      status: 'queued',
      file,
    }));

    setUploadQueue(prev => [...prev, ...newItems]);
    setUploadManagerOpen(true);
    setUploadManagerMinimized(false);
  }, [diskInfo]);

  // Queue Processor Engine using XMLHttpRequest for byte-level accuracy & live speeds
  useEffect(() => {
    if (isUploading) return;
    const nextItem = uploadQueue.find(item => item.status === 'queued');
    if (!nextItem) return;

    const processUpload = async (item: UploadQueueItem) => {
      setIsUploading(true);
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading' } : q));

      const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
      const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
      const folderPath = getFolderPath();

      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiUrl}/files/upload?user=${encodeURIComponent(username)}`);

        let lastLoaded = 0;
        let lastTime = Date.now();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
            const now = Date.now();
            const elapsedSec = (now - lastTime) / 1000;
            if (elapsedSec >= 0.2) {
              const bytesDiff = e.loaded - lastLoaded;
              const bps = bytesDiff / elapsedSec;
              const speed = bps > 1024 * 1024
                ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
                : `${(bps / 1024).toFixed(0)} KB/s`;
              const remainingBytes = Math.max(0, e.total - e.loaded);
              const etaSec = bps > 0 ? Math.ceil(remainingBytes / bps) : 0;
              const eta = etaSec > 60 ? `${Math.ceil(etaSec / 60)}m` : `${etaSec}s`;

              setCurrentSpeedStr(speed);
              setUploadEtaStr(eta);
              lastLoaded = e.loaded;
              lastTime = now;
            }

            setUploadQueue(prev => prev.map(q => q.id === item.id ? {
              ...q,
              progress: percent,
              loadedBytes: e.loaded,
            } : q));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadQueue(prev => prev.map(q => q.id === item.id ? {
              ...q,
              progress: 100,
              loadedBytes: q.size,
              status: 'completed',
            } : q));
            fetchCloudFiles(true);
          } else {
            let errText = 'Upload failed';
            try {
              const parsed = JSON.parse(xhr.responseText);
              errText = parsed.error || errText;
            } catch {}
            setUploadQueue(prev => prev.map(q => q.id === item.id ? {
              ...q,
              status: 'error',
              error: errText,
            } : q));
          }
          resolve();
        };

        xhr.onerror = () => {
          setUploadQueue(prev => prev.map(q => q.id === item.id ? {
            ...q,
            status: 'error',
            error: 'Network connection error',
          } : q));
          resolve();
        };

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('path', folderPath);
        if (item.relativePath) {
          formData.append('relativePath', item.relativePath);
        }
        xhr.send(formData);
      });

      setIsUploading(false);
    };

    processUpload(nextItem);
  }, [uploadQueue, isUploading, currentUser, getFolderPath, fetchCloudFiles]);

  // Derived Real-Time Batch Metrics
  const totalQueueBytes = uploadQueue.reduce((acc, it) => acc + it.size, 0);
  const totalLoadedBytes = uploadQueue.reduce((acc, it) => acc + (it.status === 'completed' ? it.size : it.loadedBytes), 0);
  const overallUploadPercent = totalQueueBytes > 0 ? Math.min(100, Math.round((totalLoadedBytes / totalQueueBytes) * 100)) : 0;
  const completedUploadsCount = uploadQueue.filter(it => it.status === 'completed').length;
  const errorUploadsCount = uploadQueue.filter(it => it.status === 'error').length;
  const activeUploadItem = uploadQueue.find(it => it.status === 'uploading');
  const allUploadsFinished = uploadQueue.length > 0 && !uploadQueue.some(it => it.status === 'queued' || it.status === 'uploading');

  // Input Selection Handlers
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files).map(file => ({
        file,
        relativePath: '',
      }));
      enqueueFiles(filesArr);
      e.target.value = '';
    }
    setUploadModalOpen(false);
  };

  const handleFolderSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files).map(file => ({
        file,
        relativePath: file.webkitRelativePath || '',
      }));
      enqueueFiles(filesArr);
      e.target.value = '';
    }
    setUploadModalOpen(false);
  };

  // Drag and Drop Scanner with Recursive Folder Support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')) {
      alert('⚠️ Cannot upload: The physical CloudNAS storage drive is disconnected or ejected.');
      return;
    }

    const items = e.dataTransfer.items;
    const collectedFiles: { file: File; relativePath?: string }[] = [];

    if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
      const traverseEntry = (entry: any, curPath: string): Promise<void> => {
        return new Promise((resolve) => {
          if (!entry) return resolve();
          if (entry.isFile) {
            entry.file((file: File) => {
              collectedFiles.push({
                file,
                relativePath: curPath ? `${curPath}/${file.name}` : file.name,
              });
              resolve();
            }, () => resolve());
          } else if (entry.isDirectory) {
            const dirReader = entry.createReader();
            const readBatch = () => {
              dirReader.readEntries((entries: any[]) => {
                if (!entries || entries.length === 0) {
                  resolve();
                } else {
                  const subPromises = entries.map((child: any) =>
                    traverseEntry(child, curPath ? `${curPath}/${entry.name}` : entry.name)
                  );
                  Promise.all(subPromises).then(() => readBatch());
                }
              }, () => resolve());
            };
            readBatch();
          } else {
            resolve();
          }
        });
      };

      const rootPromises: Promise<void>[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) {
          rootPromises.push(traverseEntry(entry, ''));
        }
      }
      await Promise.all(rootPromises);
    } else {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        collectedFiles.push({
          file,
          relativePath: (file as any).webkitRelativePath || file.name,
        });
      }
    }

    if (collectedFiles.length > 0) {
      enqueueFiles(collectedFiles);
    }
  };

  const getFileBadgeIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext || '')) {
      return <ImageIcon className="h-4 w-4 text-emerald-400 shrink-0" />;
    }
    if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext || '')) {
      return <Film className="h-4 w-4 text-purple-400 shrink-0" />;
    }
    if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext || '')) {
      return <Music className="h-4 w-4 text-amber-400 shrink-0" />;
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext || '')) {
      return <Archive className="h-4 w-4 text-orange-400 shrink-0" />;
    }
    if (['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'json', 'py', 'sh'].includes(ext || '')) {
      return <FileCode className="h-4 w-4 text-cyan-400 shrink-0" />;
    }
    return <FileText className="h-4 w-4 text-blue-400 shrink-0" />;
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
      const res = await fetch(`${apiUrl}/files/delete?user=${encodeURIComponent(username)}&path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': username },
        body: JSON.stringify({ path: filePath }),
      });
      if (res.ok) {
        fetchCloudFiles();
      } else {
        const errData = await res.json().catch(() => null);
        alert(errData?.error || errData?.message || `Failed to delete item (HTTP ${res.status})`);
      }
    } catch (err: any) {
      alert(`Delete error: ${err.message || 'Network request failed'}`);
    }
  };

  const handleDownload = (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';
    window.open(`${apiUrl}/files/download?path=${encodeURIComponent(filePath)}&user=${encodeURIComponent(username)}`, '_blank');
  };

  const navigateIntoFolder = (folderName: string) => {
    setSelectedFilePaths([]);
    setCurrentFolder(prev => [...prev, folderName]);
  };

  const navigateBack = (index: number) => {
    setSelectedFilePaths([]);
    setCurrentFolder(prev => prev.slice(0, index + 1));
  };

  // Multi-File Selection & Bulk Actions
  const toggleSelectFile = (filePath: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFilePaths(prev => 
      prev.includes(filePath) ? prev.filter(p => p !== filePath) : [...prev, filePath]
    );
  };

  const toggleSelectAll = () => {
    const currentList = activeTab === 'photos' ? photos : filteredFiles;
    const allPaths = currentList.map(f => f.path);
    const allSelected = allPaths.length > 0 && allPaths.every(p => selectedFilePaths.includes(p));

    if (allSelected) {
      setSelectedFilePaths([]);
    } else {
      setSelectedFilePaths(allPaths);
    }
  };

  const clearSelection = () => {
    setSelectedFilePaths([]);
  };

  const handleBatchDelete = async () => {
    if (selectedFilePaths.length === 0) return;

    // Hardware Safety Guard: prevent delete when drive is disconnected / ejected
    if (diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')) {
      alert('⚠️ Cannot delete files: The physical CloudNAS storage drive is disconnected or ejected.');
      return;
    }

    setIsBatchDeleting(true);
    const username = currentUser?.nextcloudUser || currentUser?.id || 'clouduser';
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || '/api';

    try {
      // POST preserves body payload across all proxies/rewrites, with encoded query fallback
      const encodedPathsParam = encodeURIComponent(JSON.stringify(selectedFilePaths));
      const res = await fetch(`${apiUrl}/files/delete?user=${encodeURIComponent(username)}&paths=${encodedPathsParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': username },
        body: JSON.stringify({ paths: selectedFilePaths }),
      });

      if (res.ok) {
        setSelectedFilePaths([]);
        setShowBatchDeleteModal(false);
        fetchCloudFiles();
      } else {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error || errData?.message || (res.status ? `Deletion failed (Server HTTP ${res.status}: ${res.statusText || 'Error'})` : 'Failed to delete selected items');
        alert(errMsg);
      }
    } catch (err: any) {
      alert(`Deletion error: ${err.message || 'Network request failed'}`);
    } finally {
      setIsBatchDeleting(false);
    }
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
      <div className="min-h-screen w-full bg-[#0a0f1d] flex items-center justify-center p-3.5 sm:p-6 relative overflow-hidden font-sans">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[550px] h-[350px] sm:h-[550px] bg-blue-600/15 rounded-full blur-[100px] sm:blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[250px] sm:w-[350px] h-[250px] sm:h-[350px] bg-indigo-600/10 rounded-full blur-[80px] sm:blur-[100px] pointer-events-none" />

        <div className="w-full max-w-md bg-[#11192e]/95 backdrop-blur-xl border border-slate-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl relative z-10">
          {/* Header & Logo */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex p-3 sm:p-3.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 mb-3 sm:mb-4 text-white">
              <HardDrive className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">CloudNAS User Portal</h1>
            <p className="text-slate-400 text-xs mt-1 sm:mt-1.5">Sign in to access your physical cloud storage files</p>
          </div>

          {/* Error Banner */}
          {loginError && (
            <div className="mb-4 sm:mb-5 p-3 sm:p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2.5 animate-shake">
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
                <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter your User ID"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-slate-700/80 rounded-xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-11 py-3 bg-slate-900/80 border border-slate-700/80 rounded-xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-2 rounded-lg"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
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
          <div className="mt-5 sm:mt-6 pt-4 sm:pt-5 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5 flex-wrap">
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
    <div 
      className="flex h-screen bg-[#0b0f19] text-slate-100 overflow-hidden relative"
      onDragOver={handleDragOver}
    >
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
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-lg shadow-blue-600/25 transition"
            >
              <UploadCloud className="h-4 w-4" /> Upload Items
            </button>
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
              onClick={() => {
                setSelectedDisk(null);
                setCurrentFolder(['']);
                setActiveTab('files');
              }}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                selectedDisk === null && activeTab === 'files' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <HardDrive className="h-4 w-4" /> Storage Drives
            </button>
            <button
              onClick={() => {
                if (!selectedDisk && disksList.length > 0) {
                  setSelectedDisk(disksList[0]);
                }
                setActiveTab('files');
              }}
              className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                selectedDisk !== null && activeTab === 'files' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
              }`}
            >
              <Folder className="h-4 w-4" /> My Files {selectedDisk ? `(${selectedDisk.label || selectedDisk.name})` : ''}
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
        <header className="h-16 border-b border-slate-800 px-3 sm:px-6 md:px-8 flex items-center justify-between gap-2 sm:gap-4 bg-[#0d1322] shrink-0">
          {/* Mobile Menu & Brand Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-slate-300 hover:text-white rounded-xl bg-slate-800/80 border border-slate-700/60 active:scale-95 transition"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-[200px] xs:max-w-xs sm:max-w-md relative">
            <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 sm:pl-9 pr-3 py-1.5 sm:py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* View Toggles & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Direct Upload Button in Top Bar (Unmissable on all screens) */}
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-blue-600/30 active:scale-95 transition shrink-0"
            >
              <UploadCloud className="h-4 w-4" />
              <span className="font-medium">Upload</span>
            </button>

            {/* Active Physical Disk Badge */}
            {diskInfo && (
              <div 
                onClick={() => setMobileStorageOpen(true)}
                className={`hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs border cursor-pointer hover:border-slate-600 transition ${
                  diskInfo.isConnected !== false && diskInfo.status === 'ONLINE'
                    ? 'bg-slate-800/80 border-slate-700/80'
                    : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                }`}
              >
                <div className={`h-2 w-2 rounded-full ${
                  diskInfo.isConnected !== false && diskInfo.status === 'ONLINE'
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500 animate-ping'
                }`} />
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs truncate max-w-[140px]">
                    <HardDrive className={`h-3.5 w-3.5 ${
                      diskInfo.isConnected !== false && diskInfo.status === 'ONLINE' ? 'text-blue-400' : 'text-rose-400'
                    }`} />
                    {diskInfo.name || 'CloudNAS'}
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

            {/* Refresh Button */}
            <button
              onClick={() => fetchCloudFiles()}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title="Refresh from Nextcloud"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* View Mode Toggle */}
            <div className="hidden xs:flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                aria-label="Grid view"
              >
                <Grid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Logged in User Profile & Sign Out Button */}
            <div className="flex items-center gap-1.5 sm:gap-2 pl-2 sm:pl-3 border-l border-slate-700/80">
              <div 
                onClick={() => setMobileMenuOpen(true)}
                className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/40 flex items-center justify-center font-bold text-xs text-white shadow-sm cursor-pointer md:cursor-default"
              >
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
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-lg transition"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Real-time Dynamic Upload Strip / Bar */}
        {uploadQueue.length > 0 && (
          <div 
            onClick={() => { setUploadManagerOpen(true); setUploadManagerMinimized(false); }}
            className={`cursor-pointer px-4 py-2.5 flex items-center justify-between text-xs font-medium transition-all ${
              allUploadsFinished 
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg shadow-emerald-500/20' 
                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-lg shadow-blue-500/25'
            }`}
          >
            <div className="flex items-center gap-3 truncate mr-2">
              {allUploadsFinished ? (
                <div className="p-1 rounded-full bg-white/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                </div>
              ) : (
                <div className="p-1 rounded-full bg-white/20 animate-pulse">
                  <UploadCloud className="h-4 w-4 animate-bounce" />
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 truncate">
                <span className="font-bold">
                  {allUploadsFinished 
                    ? `Uploaded ${completedUploadsCount} items successfully!` 
                    : `Uploading to Nextcloud: ${completedUploadsCount}/${uploadQueue.length} (${overallUploadPercent}%)`}
                </span>
                {!allUploadsFinished && activeUploadItem && (
                  <span className="text-[11px] text-blue-100 truncate opacity-90 hidden sm:inline">
                    • {activeUploadItem.name} {activeUploadItem.relativePath ? `(${activeUploadItem.relativePath})` : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {!allUploadsFinished ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-black/25 text-[11px] font-mono font-semibold text-blue-200 flex items-center gap-1">
                    <Zap className="h-3 w-3 text-amber-300" /> {currentSpeedStr}
                  </span>
                  {uploadEtaStr && (
                    <span className="text-[11px] text-blue-200 hidden xs:inline">ETA: {uploadEtaStr}</span>
                  )}
                  <span className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition font-semibold">
                    View Manager
                  </span>
                </div>
              ) : (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadQueue([]);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-black/25 hover:bg-black/40 text-[11px] font-semibold transition"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Explorer with Safe Bottom Spacing for Mobile Navigation */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 md:p-8 pb-24 md:pb-8">
          {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center max-w-lg mx-auto">
              <div className="relative mb-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-2xl">
                  <HardDrive className="h-10 w-10 sm:h-12 sm:w-12 text-rose-400" />
                </div>
                <div className="absolute -bottom-1 -right-1 bg-rose-600 text-white rounded-full p-1.5 shadow-lg">
                  <AlertCircle className="h-4 w-4" />
                </div>
              </div>

              <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold uppercase tracking-wider mb-3">
                Storage Disk Ejected
              </span>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                Physical Cloud Storage Disconnected
              </h2>

              <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6">
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
              {/* Breadcrumb Path & Mobile Upload Button */}
              <div className="flex items-center justify-between gap-2 mb-4 sm:mb-6">
                <div className="flex items-center gap-1 text-xs sm:text-sm text-slate-400 font-medium flex-wrap">
                  <button
                    onClick={() => {
                      setSelectedDisk(null);
                      setCurrentFolder(['']);
                    }}
                    className={`hover:text-blue-400 transition flex items-center gap-1.5 ${selectedDisk === null ? 'text-white font-semibold' : ''}`}
                  >
                    <HardDrive className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400" />
                    <span>Storage Drives</span>
                  </button>
                  {selectedDisk && (
                    <>
                      <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                      <button
                        onClick={() => setCurrentFolder([''])}
                        className={`hover:text-blue-400 transition truncate max-w-[150px] ${currentFolder.length === 1 ? 'text-white font-semibold' : ''}`}
                      >
                        {selectedDisk.name || 'CloudNAS'} ({selectedDisk.label || 'USB'})
                      </button>
                      {currentFolder.filter(Boolean).map((crumb, idx) => (
                        <React.Fragment key={crumb}>
                          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                          <button
                            onClick={() => navigateBack(idx + 1)}
                            className={`hover:text-blue-400 transition truncate max-w-[120px] ${idx === currentFolder.filter(Boolean).length - 1 ? 'text-white font-semibold' : ''}`}
                          >
                            {crumb}
                          </button>
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </div>

                {/* Switch Drive / Back button & Select All if a disk is selected */}
                {selectedDisk && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedDisk(null);
                        setCurrentFolder(['']);
                        setSelectedFilePaths([]);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center gap-1 transition"
                    >
                      <span>← All Drives</span>
                    </button>

                    {filteredFiles.length > 0 && (
                      <button
                        onClick={toggleSelectAll}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
                          selectedFilePaths.length > 0
                            ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                            : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                        }`}
                        title="Toggle Multi-Select for All Files"
                      >
                        <Check className={`h-3 w-3 stroke-[2.5] ${selectedFilePaths.length > 0 ? 'text-blue-400' : 'text-slate-400'}`} />
                        <span>
                          {selectedFilePaths.length === filteredFiles.length && filteredFiles.length > 0
                            ? 'Deselect All'
                            : selectedFilePaths.length > 0
                              ? `Selected (${selectedFilePaths.length})`
                              : 'Select All'}
                        </span>
                      </button>
                    )}
                  </div>
                )}

                {/* Mobile Quick Action Buttons on top right (when inside a disk) */}
                {selectedDisk && (
                  <div className="flex items-center gap-2 md:hidden shrink-0">
                    <button
                      onClick={() => setShowNewFolderModal(true)}
                      className="py-1.5 px-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 text-xs flex items-center gap-1.5 active:scale-95 transition"
                      title="New Folder"
                    >
                      <FolderPlus className="h-3.5 w-3.5 text-blue-400" />
                      <span className="font-medium">Folder</span>
                    </button>
                    <button
                      onClick={() => setUploadModalOpen(true)}
                      className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/30 active:scale-95 transition"
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>Upload</span>
                    </button>
                  </div>
                )}
              </div>

              {/* TAB 1: ALL FILES */}
              {activeTab === 'files' && (
                <div>
                  {selectedDisk === null ? (
                    /* SHOW CONNECTED STORAGE DRIVES FIRST */
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <div>
                          <div className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-blue-400" />
                            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Connected Storage Drives</h2>
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold border border-blue-500/20">
                              {(disksList.length > 0 ? disksList : [diskInfo || {}]).filter((d: any) => d.isConnected !== false).length} Online
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Click on a USB drive below to open and manage its stored files, photos, and folders.
                          </p>
                        </div>

                        <button
                          onClick={() => fetchCloudFiles()}
                          className="self-start sm:self-auto px-3 py-1.5 text-slate-300 hover:text-white rounded-xl bg-slate-800/80 border border-slate-700/80 hover:bg-slate-700 transition text-xs flex items-center gap-1.5"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                          <span>Scan for Drives</span>
                        </button>
                      </div>

                      {/* Drive Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(disksList.length > 0 ? disksList : (diskInfo ? [diskInfo] : [])).map((disk: any, idx: number) => {
                          const isOnline = disk.isConnected !== false && disk.status !== 'DISCONNECTED';
                          return (
                            <div
                              key={disk.id || disk.device || idx}
                              onClick={() => {
                                if (!isOnline) {
                                  alert('⚠️ This drive is currently disconnected or ejected. Please reconnect the drive to access files.');
                                  return;
                                }
                                setSelectedDisk(disk);
                                setCurrentFolder(['']);
                                fetchCloudFiles();
                              }}
                              className={`group rounded-2xl border p-5 cursor-pointer transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                                isOnline
                                  ? 'bg-[#12192c] hover:bg-[#18233e] border-slate-800 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-500/10 active:scale-[0.99]'
                                  : 'bg-[#1a1219] border-rose-900/50 opacity-80'
                              }`}
                            >
                              <div>
                                {/* Drive Header */}
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition ${
                                      isOnline 
                                        ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 group-hover:scale-105' 
                                        : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                                    }`}>
                                      <HardDrive className="h-6 w-6" />
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition truncate max-w-[170px]">
                                        {disk.name || 'External Storage'}
                                      </h3>
                                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                        <span className="font-medium text-slate-300">{disk.label || 'CloudNAS'}</span>
                                        <span>•</span>
                                        <span className="font-mono text-[11px] text-slate-400">{disk.device || `disk${idx + 1}`}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1.5 border ${
                                    isOnline
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                                    {isOnline ? 'ONLINE' : 'EJECTED'}
                                  </span>
                                </div>

                                {/* Capacity Bar */}
                                <div className="space-y-2 mb-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">
                                  <div className="flex justify-between items-baseline text-xs">
                                    <span className="text-slate-400 font-medium">Free Space:</span>
                                    <span className="text-sm font-bold text-emerald-400">{disk.freeStr || quota.freeStr}</span>
                                  </div>
                                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${
                                        isOnline
                                          ? 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
                                          : 'bg-rose-500/50 w-full'
                                      }`}
                                      style={{ width: isOnline ? `${Math.max(3, disk.percent || quota.percent || 2)}%` : '100%' }}
                                    />
                                  </div>
                                  <div className="flex justify-between text-[11px] text-slate-400">
                                    <span>{disk.usedStr || quota.usedStr} used</span>
                                    <span className="text-slate-300 font-medium">{disk.totalStr || quota.totalStr} Total</span>
                                  </div>
                                </div>
                              </div>

                              {/* Drive Footer / Action */}
                              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                                <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                                  {disk.mountPoint || 'Physical Storage'}
                                </span>
                                <span className="font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1">
                                  Open Drive <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    /* DISK IS SELECTED -> SHOW FILES AND FOLDERS INSIDE SELECTED DISK */
                    <div>
                      {files.length === 0 && !loading && (
                        <div className="text-center py-12 sm:py-16 text-slate-400 text-sm max-w-sm mx-auto flex flex-col items-center">
                          <div className="w-16 h-16 rounded-2xl bg-[#131b2e] border border-slate-800 flex items-center justify-center text-blue-400 mb-4 shadow-xl">
                            <Folder className="h-8 w-8 text-blue-400/70" />
                          </div>
                          <h3 className="text-base font-bold text-white mb-1">This folder is empty</h3>
                          <p className="text-xs text-slate-400 mb-6 text-center">
                            Upload your photos, documents, and videos directly to {selectedDisk.name} ({selectedDisk.label}).
                          </p>
                          <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                            <button
                              onClick={() => setUploadModalOpen(true)}
                              className="flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-lg shadow-blue-600/30 transition"
                            >
                              <UploadCloud className="h-4 w-4" /> Upload Items
                            </button>
                            <button
                              onClick={() => setShowNewFolderModal(true)}
                              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition"
                            >
                              <FolderPlus className="h-4 w-4 text-blue-400" /> New Folder
                            </button>
                          </div>
                        </div>
                      )}

                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                      {filteredFiles.map((file) => {
                        const isSelected = selectedFilePaths.includes(file.path);
                        return (
                          <div
                            key={file.path || file.name}
                            onClick={() => {
                              if (selectedFilePaths.length > 0) {
                                toggleSelectFile(file.path);
                              } else {
                                file.type === 'folder' ? navigateIntoFolder(file.name) : setPreviewFile(file);
                              }
                            }}
                            className={`border rounded-2xl p-3 sm:p-4 flex flex-col justify-between cursor-pointer transition group shadow-sm relative active:scale-[0.98] ${
                              isSelected
                                ? 'bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/15'
                                : 'bg-[#131b2e] hover:bg-[#1a253f] border-slate-800'
                            }`}
                          >
                            {/* Multi-Select Checkbox */}
                            <button
                              onClick={(e) => toggleSelectFile(file.path, e)}
                              className={`absolute top-2.5 left-2.5 z-10 h-6 w-6 rounded-lg flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-blue-600 border-2 border-blue-400 text-white shadow-md shadow-blue-500/40 scale-100 opacity-100'
                                  : selectedFilePaths.length > 0
                                    ? 'bg-black/60 border-2 border-slate-600 text-transparent opacity-90 hover:border-blue-400'
                                    : 'bg-black/50 border-2 border-slate-700/80 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                              }`}
                              title={isSelected ? 'Deselect item' : 'Select item'}
                            >
                              <Check className={`h-3.5 w-3.5 stroke-[3] ${isSelected ? 'block' : 'opacity-0'}`} />
                            </button>

                            <div className="aspect-square rounded-xl bg-slate-900/60 flex items-center justify-center mb-2.5 sm:mb-3 overflow-hidden">
                              {file.type === 'folder' && <Folder className="h-10 w-10 sm:h-12 sm:w-12 text-blue-400 fill-blue-500/20" />}
                              {file.type === 'image' && file.url && (
                                <img src={file.url} alt={file.name} className="h-full w-full object-cover group-hover:scale-105 transition" />
                              )}
                              {file.type === 'document' && <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-emerald-400" />}
                              {file.type === 'video' && <Film className="h-8 w-8 sm:h-10 sm:w-10 text-purple-400" />}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-200 truncate group-hover:text-blue-400 transition">{file.name}</div>
                              <div className="text-[11px] text-slate-500 mt-1 flex justify-between items-center">
                                <span>{file.size}</span>
                                <div className="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition flex items-center gap-1">
                                  {file.type !== 'folder' && (
                                    <button onClick={(e) => handleDownload(file.path, e)} title="Download" className="p-1 hover:text-white text-slate-300">
                                      <Download className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button onClick={(e) => handleDeleteFile(file.path, e)} title="Delete" className="p-1 text-rose-400 hover:text-rose-300">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
                      <div className="divide-y divide-slate-800 text-sm">
                        {filteredFiles.map((file) => {
                          const isSelected = selectedFilePaths.includes(file.path);
                          return (
                            <div
                              key={file.path || file.name}
                              onClick={() => {
                                if (selectedFilePaths.length > 0) {
                                  toggleSelectFile(file.path);
                                } else {
                                  file.type === 'folder' ? navigateIntoFolder(file.name) : setPreviewFile(file);
                                }
                              }}
                              className={`flex items-center justify-between p-3 sm:p-3.5 cursor-pointer transition gap-2 ${
                                isSelected
                                  ? 'bg-blue-950/40 border-l-4 border-blue-500'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                <button
                                  onClick={(e) => toggleSelectFile(file.path, e)}
                                  className={`h-5 w-5 rounded-md flex items-center justify-center transition-all shrink-0 ${
                                    isSelected
                                      ? 'bg-blue-600 border-2 border-blue-400 text-white shadow-sm'
                                      : 'bg-slate-900 border border-slate-600 hover:border-blue-400 text-transparent'
                                  }`}
                                  title={isSelected ? 'Deselect' : 'Select'}
                                >
                                  <Check className={`h-3 w-3 stroke-[3] ${isSelected ? 'block' : 'opacity-0'}`} />
                                </button>
                                {file.type === 'folder' ? <Folder className="h-5 w-5 text-blue-400 shrink-0" /> : <FileText className="h-5 w-5 text-slate-400 shrink-0" />}
                                <span className="font-medium text-slate-200 text-xs sm:text-sm truncate">{file.name}</span>
                              </div>
                              <div className="flex items-center gap-2 sm:gap-5 text-xs text-slate-400 shrink-0">
                                <span className="text-[11px] sm:text-xs">{file.size}</span>
                                <span className="hidden md:inline text-[11px] sm:text-xs">{file.modified}</span>
                                {file.type !== 'folder' && (
                                  <button onClick={(e) => handleDownload(file.path, e)} className="p-1.5 text-slate-400 hover:text-white rounded">
                                    <Download className="h-4 w-4" />
                                  </button>
                                )}
                                <button onClick={(e) => handleDeleteFile(file.path, e)} className="p-1.5 text-slate-400 hover:text-rose-400 rounded">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

              {/* TAB 2: PHOTOS GALLERY */}
              {activeTab === 'photos' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base sm:text-lg font-bold text-white">Photos & Moments</h2>
                      {photos.length > 0 && (
                        <button
                          onClick={toggleSelectAll}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
                            selectedFilePaths.length > 0
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                              : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700 text-slate-300'
                          }`}
                        >
                          <Check className={`h-3 w-3 stroke-[2.5] ${selectedFilePaths.length > 0 ? 'text-blue-400' : 'text-slate-400'}`} />
                          <span>
                            {selectedFilePaths.length === photos.length && photos.length > 0
                              ? 'Deselect All'
                              : selectedFilePaths.length > 0
                                ? `Selected (${selectedFilePaths.length})`
                                : 'Select All'}
                          </span>
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{photos.length} Photos in Nextcloud</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {photos.map((photo) => {
                      const isSelected = selectedFilePaths.includes(photo.path);
                      return (
                        <div 
                          key={photo.path || photo.name}
                          onClick={() => {
                            if (selectedFilePaths.length > 0) {
                              toggleSelectFile(photo.path);
                            } else {
                              setPreviewFile(photo);
                            }
                          }}
                          className={`aspect-square rounded-2xl overflow-hidden cursor-pointer relative group border active:scale-95 transition ${
                            isSelected
                              ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/20'
                              : 'border-slate-800 bg-slate-900'
                          }`}
                        >
                          {/* Multi-Select Checkbox */}
                          <button
                            onClick={(e) => toggleSelectFile(photo.path, e)}
                            className={`absolute top-2.5 left-2.5 z-10 h-6 w-6 rounded-lg flex items-center justify-center transition-all ${
                              isSelected 
                                ? 'bg-blue-600 border-2 border-blue-400 text-white shadow-md' 
                                : selectedFilePaths.length > 0
                                  ? 'bg-black/60 border-2 border-slate-500 text-transparent'
                                  : 'bg-black/50 border-2 border-slate-600 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400'
                            }`}
                            title={isSelected ? 'Deselect photo' : 'Select photo'}
                          >
                            <Check className={`h-3.5 w-3.5 stroke-[3] ${isSelected ? 'block' : 'opacity-0'}`} />
                          </button>

                          <img src={photo.url} alt={photo.name} className="h-full w-full object-cover group-hover:scale-105 transition duration-300" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition p-3 flex flex-col justify-end">
                            <div className="text-xs font-semibold text-white truncate">{photo.name}</div>
                            <div className="text-[10px] text-slate-300">{photo.size}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Floating Action Button (FAB) for fast thumb uploads */}
      <button 
        onClick={() => setUploadModalOpen(true)}
        className="md:hidden fixed bottom-20 right-4 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-full shadow-2xl shadow-blue-500/50 border border-blue-400/40 cursor-pointer active:scale-90 transition"
      >
        <UploadCloud className="h-4 w-4" />
        <span>Upload Items</span>
      </button>

      {/* Mobile Bottom Navigation Bar (Native App Feel) */}
      <div className="fixed bottom-0 left-0 right-0 h-16 bg-[#0f1627]/95 backdrop-blur-xl border-t border-slate-800 z-40 flex items-center justify-around px-2 md:hidden">
        <button
          onClick={() => setActiveTab('files')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition ${
            activeTab === 'files' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Folder className="h-5 w-5" />
          <span className="text-[10px]">Files</span>
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`flex flex-col items-center gap-1 py-1 px-3 transition ${
            activeTab === 'photos' ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="h-5 w-5" />
          <span className="text-[10px]">Photos</span>
        </button>

        {/* Highlighted Mobile Floating Upload Button */}
        <button 
          onClick={() => setUploadModalOpen(true)}
          className="flex flex-col items-center -mt-5 cursor-pointer group"
        >
          <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-500 text-white shadow-xl shadow-blue-600/40 flex items-center justify-center border-4 border-[#0b0f19] active:scale-90 transition">
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </div>
          <span className="text-[10px] text-blue-400 font-semibold mt-0.5">Upload</span>
        </button>

        <button
          onClick={() => setMobileStorageOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400 hover:text-slate-200 transition relative"
        >
          <div className="relative">
            <HardDrive className={`h-5 w-5 ${
              diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'text-rose-400' : 'text-slate-400'
            }`} />
            <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${
              diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'bg-rose-500' : 'bg-emerald-400'
            }`} />
          </div>
          <span className="text-[10px]">Storage</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-1 px-3 text-slate-400 hover:text-slate-200 transition"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px]">Menu</span>
        </button>
      </div>

      {/* Mobile Slide-over Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" 
            onClick={() => setMobileMenuOpen(false)} 
          />

          {/* Drawer Content */}
          <div className="relative w-[85%] max-w-[320px] bg-[#111728] h-full p-5 flex flex-col justify-between shadow-2xl border-r border-slate-800 z-10 overflow-y-auto">
            <div className="space-y-6">
              {/* Header with Close */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-base text-white tracking-tight">CloudNAS</span>
                    <span className="block text-[10px] text-blue-400 font-medium">Nextcloud Storage</span>
                  </div>
                </div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User Card */}
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm text-white shrink-0">
                    {(currentUser?.name || currentUser?.id || 'U')[0].toUpperCase()}
                  </div>
                  <div className="overflow-hidden text-left">
                    <div className="text-xs font-semibold text-white truncate">{currentUser?.name || currentUser?.id}</div>
                    <div className="text-[10px] text-slate-400">@{currentUser?.id}</div>
                  </div>
                </div>
                <button 
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded-lg shrink-0"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setUploadModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-semibold text-sm rounded-xl cursor-pointer shadow-lg shadow-blue-600/25 transition"
                >
                  <UploadCloud className="h-4 w-4" /> Upload Items
                </button>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowNewFolderModal(true);
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 transition"
                >
                  <FolderPlus className="h-4 w-4" /> New Folder
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1">
                <button
                  onClick={() => { setActiveTab('files'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === 'files' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Folder className="h-4 w-4" /> My Files
                </button>
                <button
                  onClick={() => { setActiveTab('photos'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === 'photos' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <ImageIcon className="h-4 w-4" /> Photos & Gallery
                </button>
                <button
                  onClick={() => { setActiveTab('shared'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === 'shared' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Share2 className="h-4 w-4" /> Shared Links
                </button>
                <button
                  onClick={() => { setActiveTab('trash'); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    activeTab === 'trash' ? 'bg-blue-600/10 text-blue-400 font-semibold' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <Trash2 className="h-4 w-4" /> Trash
                </button>
              </nav>
            </div>

            {/* Real Physical Disk & Available Space Widget inside Drawer */}
            <div className={`mt-6 border p-4 rounded-2xl shadow-lg transition ${
              diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                ? 'bg-[#1e131d] border-rose-900/60'
                : 'bg-[#161f36] border-slate-800'
            }`}>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <div className="flex items-center gap-1.5 truncate">
                  <HardDrive className={`h-4 w-4 shrink-0 ${
                    diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'text-rose-400' : 'text-blue-400'
                  }`} />
                  <span className="font-semibold text-slate-200 truncate">{diskInfo?.name || 'CloudNAS'}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                    ? 'bg-rose-500/10 text-rose-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED') ? 'Ejected' : 'Online'}
                </span>
              </div>

              <div className="mb-2">
                <div className="text-lg font-bold text-slate-100 flex items-baseline justify-between">
                  <span>{diskInfo?.freeStr || quota.freeStr}</span>
                  <span className="text-[11px] font-medium text-emerald-400">Free</span>
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between mt-0.5">
                  <span>{quota.usedStr} used</span>
                  <span className="text-slate-300">{quota.totalStr} Total</span>
                </div>
              </div>

              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    diskInfo && (diskInfo.isConnected === false || diskInfo.status === 'DISCONNECTED')
                      ? 'bg-rose-500 w-full'
                      : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
                  }`}
                  style={{ width: `${Math.max(2, quota.percent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Storage Info Modal */}
      {mobileStorageOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-blue-400" /> Physical Storage Status
              </h3>
              <button
                onClick={() => setMobileStorageOpen(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Attached Hardware</span>
                <span className="text-xs font-semibold text-white">{diskInfo?.name || 'SanDisk USB 3.2'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Free Space Available</span>
                <span className="text-xs font-bold text-emerald-400">{diskInfo?.freeStr || quota.freeStr}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Total Capacity</span>
                <span className="text-xs font-semibold text-slate-200">{quota.totalStr}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Mount Path</span>
                <span className="text-xs font-mono text-slate-300">{diskInfo?.mountPoint || '/Volumes/CloudNAS'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-900/80 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Single-Copy Guard</span>
                <span className="text-xs font-semibold text-emerald-400">Active (External Drive Only)</span>
              </div>
            </div>

            <button
              onClick={() => setMobileStorageOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateFolder} className="bg-[#111726] border border-slate-800 rounded-2xl max-w-sm w-full p-5 sm:p-6 space-y-4">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-400" /> Create New Folder
            </h3>
            <input
              type="text"
              placeholder="Folder Name (e.g. Projects)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#111726] border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 relative max-h-[90vh] flex flex-col justify-between">
            <div>
              <button 
                onClick={() => setPreviewFile(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
              <h3 className="font-bold text-base sm:text-lg text-white mb-3 sm:mb-4 flex items-center gap-2 truncate pr-10">
                <Eye className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0" />
                <span className="truncate">{previewFile.name}</span>
              </h3>
              <div className="rounded-xl overflow-hidden bg-black/40 flex items-center justify-center min-h-[220px] sm:min-h-[300px] border border-slate-800 mb-4">
                {previewFile.type === 'image' && previewFile.url ? (
                  <img src={previewFile.url} alt={previewFile.name} className="max-h-[350px] object-contain" />
                ) : (
                  <div className="text-center p-6 sm:p-8">
                    <FileText className="h-12 w-12 sm:h-16 sm:w-16 text-slate-500 mx-auto mb-2" />
                    <p className="text-xs sm:text-sm text-slate-400">Document preview ready via Nextcloud PDF viewer</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span className="truncate">Size: {previewFile.size} • Modified: {previewFile.modified}</span>
              <button 
                onClick={(e) => handleDownload(previewFile.path, e)}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 text-xs sm:text-sm shadow-md"
              >
                <Download className="h-4 w-4" /> Download File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden File and Folder Inputs */}
      <input 
        ref={multiFileInputRef} 
        type="file" 
        multiple 
        className="hidden" 
        onChange={handleFilesSelected} 
      />
      <input 
        ref={folderInputRef} 
        type="file" 
        {...({ webkitdirectory: '', directory: '', multiple: true } as any)} 
        className="hidden" 
        onChange={handleFolderSelected} 
      />

      {/* Upload Selection Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700/80 rounded-3xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Ambient subtle glow */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Upload to CloudNAS</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[240px]">
                    Target: {selectedDisk?.name || 'Storage'} {getFolderPath()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Selection Options */}
            <div className="space-y-3.5 my-6">
              {/* Option 1: Multi Files */}
              <button
                onClick={() => {
                  setUploadModalOpen(false);
                  multiFileInputRef.current?.click();
                }}
                className="group flex items-start gap-4 p-4 rounded-2xl bg-slate-900/90 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/50 transition-all text-left w-full hover:shadow-lg hover:shadow-blue-500/10"
              >
                <div className="p-3 rounded-xl bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition shrink-0">
                  <FileUp className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white group-hover:text-blue-200 transition">
                      Upload Files
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Multi-select
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Select single or multiple photos, videos, documents, or archives from your device.
                  </p>
                </div>
              </button>

              {/* Option 2: Folder Upload */}
              <button
                onClick={() => {
                  setUploadModalOpen(false);
                  folderInputRef.current?.click();
                }}
                className="group flex items-start gap-4 p-4 rounded-2xl bg-slate-900/90 hover:bg-indigo-950/40 border border-slate-800 hover:border-indigo-500/50 transition-all text-left w-full hover:shadow-lg hover:shadow-indigo-500/10"
              >
                <div className="p-3 rounded-xl bg-indigo-600/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition shrink-0">
                  <FolderUp className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white group-hover:text-indigo-200 transition">
                      Upload Entire Folder
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Directory Tree
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Upload an entire directory with all subfolders and files preserved in their original hierarchy.
                  </p>
                </div>
              </button>
            </div>

            {/* Drag & Drop Hint */}
            <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-center flex items-center justify-center gap-2 text-xs text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Drag & drop files or folders anywhere onto the window</span>
            </div>
          </div>
        </div>
      )}

      {/* Full Window Drag and Drop Overlay */}
      {isDragOver && (
        <div 
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="fixed inset-0 z-50 bg-[#080d1a]/90 backdrop-blur-xl flex flex-col items-center justify-center p-6 border-4 border-dashed border-blue-500/80 animate-pulse-slow"
        >
          <div className="relative mb-6">
            <div className="w-28 h-28 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center text-blue-400 shadow-2xl shadow-blue-500/50">
              <UploadCloud className="h-14 w-14 animate-bounce" />
            </div>
            <div className="absolute inset-0 rounded-full border border-blue-400/40 animate-ping pointer-events-none" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2 text-center">
            Drop Files or Folders Here
          </h2>
          <p className="text-sm sm:text-base text-blue-200 max-w-md text-center mb-6">
            Release to instantly start uploading to <span className="font-semibold text-white">{selectedDisk?.name || 'CloudNAS'}</span> ({getFolderPath()})
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center text-xs font-semibold text-slate-300">
            <span className="px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700/60 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-blue-400" /> Multi-file Upload
            </span>
            <span className="px-3 py-1 rounded-full bg-indigo-900/60 border border-indigo-700/60 flex items-center gap-1.5">
              <FolderUp className="h-3.5 w-3.5 text-indigo-400" /> Recursive Folder Trees
            </span>
            <span className="px-3 py-1 rounded-full bg-emerald-900/60 border border-emerald-700/60 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-emerald-400" /> Real-time Progress
            </span>
          </div>
        </div>
      )}

      {/* Floating Upload Manager Widget */}
      {uploadManagerOpen && (
        <div className={`fixed z-50 transition-all duration-300 ${
          uploadManagerMinimized 
            ? 'bottom-20 md:bottom-6 right-4 sm:right-6 w-auto max-w-[92vw]'
            : 'bottom-20 md:bottom-6 right-3 sm:right-6 w-[94vw] sm:w-[440px] max-w-lg'
        }`}>
          {uploadManagerMinimized ? (
            /* Minimized Pill */
            <div 
              onClick={() => setUploadManagerMinimized(false)}
              className="flex items-center gap-3 px-4 py-2.5 bg-[#0e1628]/95 backdrop-blur-xl border border-blue-500/50 rounded-2xl shadow-2xl shadow-blue-500/20 cursor-pointer hover:border-blue-400 transition"
            >
              <div className={`p-1.5 rounded-xl ${allUploadsFinished ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-600 text-white animate-pulse'}`}>
                {allUploadsFinished ? <CheckCircle2 className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold text-white">
                  {allUploadsFinished ? 'Uploads Completed' : `Uploading (${completedUploadsCount}/${uploadQueue.length})`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {allUploadsFinished ? `${uploadQueue.length} items ready` : `${overallUploadPercent}% • ${currentSpeedStr}`}
                </span>
              </div>
              <div className="flex items-center gap-1 ml-2 text-slate-400">
                <button 
                  onClick={(e) => { e.stopPropagation(); setUploadManagerMinimized(false); }}
                  className="p-1 hover:text-white"
                  title="Expand"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setUploadManagerOpen(false); }}
                  className="p-1 hover:text-rose-400"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Expanded Card */
            <div className="bg-[#0e1628]/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
              {/* Card Header */}
              <div className="p-4 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${
                    allUploadsFinished 
                      ? 'bg-emerald-500/20 text-emerald-400' 
                      : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
                  }`}>
                    {allUploadsFinished ? <CheckCircle2 className="h-5 w-5" /> : <UploadCloud className="h-5 w-5 animate-pulse" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                      {allUploadsFinished ? 'All Uploads Completed!' : 'Uploading to CloudNAS'}
                    </h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {completedUploadsCount} of {uploadQueue.length} files ({formatBytes(totalLoadedBytes)} / {formatBytes(totalQueueBytes)})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!allUploadsFinished && currentSpeedStr && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-[10px] font-mono text-blue-300 flex items-center gap-1">
                      <Zap className="h-3 w-3 text-amber-300" /> {currentSpeedStr}
                    </span>
                  )}
                  <button 
                    onClick={() => setUploadManagerMinimized(true)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                    title="Minimize"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => setUploadManagerOpen(false)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Real-time Glowing Progress Bar */}
              <div className="h-1.5 w-full bg-slate-800 overflow-hidden relative">
                <div 
                  className={`h-full transition-all duration-300 relative overflow-hidden ${
                    allUploadsFinished 
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                      : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400'
                  }`}
                  style={{ width: `${overallUploadPercent}%` }}
                >
                  {!allUploadsFinished && (
                    <div className="absolute inset-0 bg-white/25 animate-shimmer" />
                  )}
                </div>
              </div>

              {/* Queue Items List */}
              <div className="max-h-60 sm:max-h-68 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
                {uploadQueue.map((item) => (
                  <div key={item.id} className="p-2.5 rounded-xl bg-slate-900/40 hover:bg-slate-900/80 transition space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {getFileBadgeIcon(item.name)}
                        <div className="overflow-hidden text-left">
                          <p className="text-xs font-semibold text-slate-200 truncate max-w-[220px] sm:max-w-[260px]">
                            {item.name}
                          </p>
                          {item.relativePath && (
                            <p className="text-[10px] text-slate-400 truncate max-w-[220px] sm:max-w-[260px]">
                              📁 {item.relativePath}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.sizeFormatted}
                        </span>

                        {item.status === 'completed' && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <Check className="h-3 w-3" /> Done
                          </span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                            {item.progress}%
                          </span>
                        )}
                        {item.status === 'queued' && (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                            Queued
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20" title={item.error}>
                            Failed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Individual Progress Bar */}
                    {item.status === 'uploading' && (
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden relative">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-200 relative overflow-hidden"
                          style={{ width: `${item.progress}%` }}
                        >
                          <div className="absolute inset-0 bg-white/30 animate-shimmer" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Card Footer */}
              <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  {allUploadsFinished ? 'All transfers finished' : `${uploadQueue.filter(i => i.status === 'queued').length} items remaining`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setUploadQueue(prev => prev.filter(i => i.status !== 'completed'));
                      if (allUploadsFinished) setUploadManagerOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                  >
                    {allUploadsFinished ? 'Clear & Close' : 'Clear Completed'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Multi-Select Bulk Action Dock */}
      {selectedFilePaths.length > 0 && (
        <div className="fixed bottom-20 md:bottom-7 left-1/2 -translate-x-1/2 z-40 w-[94vw] sm:w-auto max-w-xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="bg-[#0e1628]/95 backdrop-blur-2xl border border-blue-500/50 rounded-2xl shadow-2xl shadow-black/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sm:gap-6">
            {/* Left: Selected count */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-sm shadow-blue-500/50">
                {selectedFilePaths.length}
              </span>
              <span className="text-xs font-semibold text-white hidden xs:inline">
                {selectedFilePaths.length === 1 ? '1 item selected' : `${selectedFilePaths.length} items selected`}
              </span>
            </div>

            {/* Middle: Select All / Deselect All */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium border border-slate-700 transition"
              >
                {selectedFilePaths.length === (activeTab === 'photos' ? photos.length : filteredFiles.length) && (activeTab === 'photos' ? photos.length : filteredFiles.length) > 0
                  ? 'Deselect All'
                  : 'Select All'}
              </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowBatchDeleteModal(true)}
                disabled={isBatchDeleting}
                className="px-3.5 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-600/30 active:scale-95 transition disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete ({selectedFilePaths.length})</span>
              </button>

              <button
                onClick={clearSelection}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                title="Cancel Selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-700/80 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
              <Trash2 className="h-6 w-6" />
            </div>

            <h3 className="font-bold text-lg text-white mb-2">
              Delete {selectedFilePaths.length} {selectedFilePaths.length === 1 ? 'Item' : 'Items'}?
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Are you sure you want to permanently delete {selectedFilePaths.length} selected items from physical storage on <span className="text-slate-200 font-semibold">{selectedDisk?.name || 'CloudNAS'}</span>? This cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={isBatchDeleting}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={isBatchDeleting}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
              >
                {isBatchDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
