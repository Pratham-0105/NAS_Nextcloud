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
  Eye,
  FolderPlus,
  RefreshCw
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
  const [activeTab, setActiveTab] = useState<'files' | 'photos' | 'shared' | 'trash'>('files');
  const [currentFolder, setCurrentFolder] = useState<string[]>(['']);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);

  // Real Nextcloud Quota State
  const [quota, setQuota] = useState<{ usedStr: string; totalStr: string; percent: number }>({
    usedStr: '39.1 MB',
    totalStr: 'Unlimited',
    percent: 1,
  });

  const [files, setFiles] = useState<FileItem[]>([]);

  const getFolderPath = useCallback(() => {
    const joined = currentFolder.filter(Boolean).join('/');
    return joined ? `/${joined}` : '/';
  }, [currentFolder]);

  const fetchCloudFiles = useCallback(async () => {
    setLoading(true);
    const folderPath = getFolderPath();
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:4001/api';

    try {
      const res = await fetch(`${apiUrl}/files/list?user=clouduser&path=${encodeURIComponent(folderPath)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          const mapped: FileItem[] = data.items.map((item: any) => {
            const isImg = item.mime?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(item.basename);
            const isVid = item.mime?.startsWith('video/') || /\.(mp4|mov|mkv)$/i.test(item.basename);
            const cleanPath = item.filename.startsWith('/remote.php/dav/files/clouduser')
              ? item.filename.replace('/remote.php/dav/files/clouduser', '')
              : item.filename;

            return {
              name: item.basename,
              path: cleanPath,
              type: item.type === 'directory' ? 'folder' : isImg ? 'image' : isVid ? 'video' : 'document',
              size: item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : 'Folder',
              modified: new Date(item.lastmod).toLocaleDateString(),
              url: isImg ? `${apiUrl}/files/download?path=${encodeURIComponent(cleanPath)}&user=clouduser` : undefined,
            };
          });
          setFiles(mapped);
        }
      }

      // Fetch Real Quota
      const quotaRes = await fetch(`${apiUrl}/files/quota?user=clouduser`);
      if (quotaRes.ok) {
        const quotaData = await quotaRes.json();
        const usedMb = ((quotaData.quota?.used || 0) / (1024 * 1024)).toFixed(1);
        setQuota({
          usedStr: `${usedMb} MB`,
          totalStr: quotaData.quota?.quota === 'unlimited' ? 'Cloud Quota' : `${Math.round(quotaData.quota?.total / 1e9)} GB`,
          percent: Math.min(100, Math.max(1, Math.round(quotaData.quota?.relative || 2))),
        });
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [getFolderPath]);

  useEffect(() => {
    fetchCloudFiles();
  }, [fetchCloudFiles]);

  const photos = files.filter(f => f.type === 'image');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(15);
    const interval = setInterval(() => {
      setUploadProgress(prev => (prev === null || prev >= 90 ? 90 : prev + 25));
    }, 200);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:4001/api';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', getFolderPath());

      const res = await fetch(`${apiUrl}/files/upload?user=clouduser`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => setUploadProgress(null), 1200);

      if (res.ok) {
        fetchCloudFiles();
      }
    } catch {
      clearInterval(interval);
      setUploadProgress(null);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:4001/api';
    try {
      const res = await fetch(`${apiUrl}/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'clouduser' },
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

    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:4001/api';
    try {
      const res = await fetch(`${apiUrl}/files/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'clouduser' },
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
    const apiUrl = process.env.NEXT_PUBLIC_USER_API_URL || 'http://localhost:4001/api';
    window.open(`${apiUrl}/files/download?path=${encodeURIComponent(filePath)}&user=clouduser`, '_blank');
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

        {/* Real User Quota Widget */}
        <div className="bg-[#161f36] border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-200">Nextcloud Storage</span>
            <span>{quota.percent}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${quota.percent}%` }}></div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>{quota.usedStr} used</span>
            <span className="text-slate-300 font-medium">{quota.totalStr}</span>
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

            <div className="h-8 w-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center font-bold text-xs text-blue-300">
              C
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
