'use client';

import React, { useState, useEffect } from 'react';
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
  MoreVertical, 
  Download, 
  ChevronRight, 
  HardDrive, 
  Users, 
  Plus, 
  X, 
  CheckCircle,
  Eye
} from 'lucide-react';

interface FileItem {
  name: string;
  type: 'folder' | 'image' | 'document' | 'video';
  size: string;
  modified: string;
  url?: string;
}

export default function UserCloudPortal() {
  const [activeTab, setActiveTab] = useState<'files' | 'photos' | 'shared' | 'trash'>('files');
  const [currentFolder, setCurrentFolder] = useState<string[]>(['My Cloud']);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);

  const [files, setFiles] = useState<FileItem[]>([
    { name: 'Photos', type: 'folder', size: '14.2 GB', modified: 'Oct 02, 2026' },
    { name: 'Documents', type: 'folder', size: '2.8 GB', modified: 'Oct 01, 2026' },
    { name: 'Semester Project Final Report.pdf', type: 'document', size: '4.5 MB', modified: 'Today, 2:30 PM' },
    { name: 'campus_sunset_4k.jpg', type: 'image', size: '8.2 MB', modified: 'Yesterday', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80' },
    { name: 'lab_server_rack.png', type: 'image', size: '6.4 MB', modified: 'Oct 01, 2026', url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80' },
    { name: 'presentation_recording.mp4', type: 'video', size: '184 MB', modified: 'Sep 28, 2026' },
  ]);

  const photos = files.filter(f => f.type === 'image');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(10);
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev === null || prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setUploadProgress(null), 1000);
          return 100;
        }
        return prev + 30;
      });
    }, 300);

    const isImg = file.type.startsWith('image/');
    const newFileItem: FileItem = {
      name: file.name,
      type: isImg ? 'image' : 'document',
      size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      modified: 'Just now',
      url: isImg ? URL.createObjectURL(file) : undefined,
    };

    setFiles(prev => [newFileItem, ...prev]);
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
              <span className="block text-[11px] text-blue-400 font-medium">Self-Hosted NAS</span>
            </div>
          </div>

          {/* Upload Button */}
          <label className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-medium text-sm rounded-xl cursor-pointer shadow-lg shadow-blue-600/20 transition">
            <Plus className="h-4 w-4" /> Upload New File
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>

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

        {/* Abstracted Storage Quota Widget */}
        <div className="bg-[#161f36] border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-200">Cloud Storage</span>
            <span>24% Used</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full w-[24%]"></div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex justify-between">
            <span>420 GB used</span>
            <span className="text-slate-300 font-medium">1.75 TB Total</span>
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
              placeholder="Search files, photos, folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          {/* View Toggles & Profile */}
          <div className="flex items-center gap-3">
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
              U
            </div>
          </div>
        </header>

        {/* Upload Progress Notification */}
        {uploadProgress !== null && (
          <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 animate-bounce" />
              <span>Uploading to Personal Cloud: {uploadProgress}%</span>
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
            {currentFolder.map((crumb, idx) => (
              <React.Fragment key={crumb}>
                <button
                  onClick={() => navigateBack(idx)}
                  className={`hover:text-blue-400 transition ${idx === currentFolder.length - 1 ? 'text-white font-semibold' : ''}`}
                >
                  {crumb}
                </button>
                {idx < currentFolder.length - 1 && <ChevronRight className="h-4 w-4 text-slate-600" />}
              </React.Fragment>
            ))}
          </div>

          {/* TAB 1: ALL FILES */}
          {activeTab === 'files' && (
            <div>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.name}
                      onClick={() => file.type === 'folder' ? navigateIntoFolder(file.name) : setPreviewFile(file)}
                      className="bg-[#131b2e] hover:bg-[#1a253f] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition group shadow-sm"
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
                        <div className="text-[11px] text-slate-500 mt-1">{file.size} • {file.modified}</div>
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
                          <button className="p-1 hover:text-slate-200"><Download className="h-4 w-4" /></button>
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
                <span className="text-xs text-slate-400">{photos.length} Photos in Gallery</span>
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
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium flex items-center gap-2">
                <Download className="h-4 w-4" /> Download File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
