import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { NextcloudService } from '../services/NextcloudService.js';
import { logger } from '../utils/logger.js';
import { poolService } from './storage.routes.js';

const router = Router();
const ncService = new NextcloudService();

function getPhysicalStorageMount(): string | null {
  if (process.platform === 'darwin' && fs.existsSync('/Volumes/CloudNAS')) {
    return '/Volumes/CloudNAS';
  }
  if (process.platform === 'linux' && fs.existsSync('/mnt/storage_pool')) {
    return '/mnt/storage_pool';
  }
  return null;
}

// Configure Multer memory storage with 500MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    // Validate filename to prevent path traversal
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Invalid filename: Path traversal characters are not permitted.'));
    }
    cb(null, true);
  },
});

function getUsername(req: Request): string {
  // Use dedicated cloud user or query param, never default to admin for standard user ops
  return (req.query.user as string) || (req.headers['x-user-id'] as string) || 'clouduser';
}

function getUserPassword(req: Request): string {
  return (req.headers['x-user-pass'] as string) || 'CloudUserPass123!';
}

// GET /api/files/list or /api/files - List files in user directory via real WebDAV
const listHandler = async (req: Request, res: Response): Promise<void> => {
  const currentPath = (req.query.path as string) || '/';
  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    const items = await ncService.listDirectory(username, password, currentPath);
    res.json({
      success: true,
      currentPath,
      items,
      count: items.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
router.get('/list', listHandler);
router.get('/', listHandler);

// POST /api/files/upload - Real WebDAV upload to Nextcloud
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file attached in upload request' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);
  const targetFolder = (req.body.path as string) || '/';
  const fileName = req.file.originalname;
  const remotePath = path.posix.join(targetFolder, fileName);

  try {
    await ncService.uploadFile(username, password, remotePath, req.file.buffer);

    // Synchronize to physical storage device if connected
    const mount = getPhysicalStorageMount();
    if (mount) {
      try {
        const localDestDir = path.join(mount, targetFolder.replace(/^\/+/, ''));
        if (!fs.existsSync(localDestDir)) {
          fs.mkdirSync(localDestDir, { recursive: true });
        }
        fs.writeFileSync(path.join(localDestDir, fileName), req.file.buffer);
        logger.info(`[PHYSICAL SYNC] Wrote uploaded file "${fileName}" directly to physical drive (${mount})`);
      } catch (err: any) {
        logger.warn(`[PHYSICAL SYNC] Warning writing to physical storage: ${err.message}`);
      }
    }

    res.status(201).json({
      success: true,
      message: `File "${fileName}" uploaded to Nextcloud successfully`,
      file: {
        name: fileName,
        path: remotePath,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Upload to Nextcloud failed: ${err.message}` });
  }
});

// GET /api/files/download - Real WebDAV download from Nextcloud
router.get('/download', async (req: Request, res: Response): Promise<void> => {
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ success: false, error: 'File path parameter is required' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    const data = await ncService.getFileContents(username, password, filePath);
    const fileName = path.posix.basename(filePath);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', data.length);
    res.send(data);
  } catch (err: any) {
    res.status(404).json({ success: false, error: `File not found in Nextcloud: ${err.message}` });
  }
});

// POST /api/files/mkdir or /api/files/folder - Real WebDAV folder creation
const mkdirHandler = async (req: Request, res: Response): Promise<void> => {
  let { path: parentPath, name, folderPath } = req.body;
  if (folderPath && !name) {
    parentPath = path.posix.dirname(folderPath);
    name = path.posix.basename(folderPath);
  }

  if (!name || typeof name !== 'string') {
    res.status(400).json({ success: false, error: 'Valid folder name is required' });
    return;
  }

  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    res.status(400).json({ success: false, error: 'Folder name cannot contain path separators or ".."' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);
  const fullPath = path.posix.join(parentPath || '/', name);

  try {
    await ncService.createFolder(username, password, fullPath);

    // Sync folder to physical storage
    const mount = getPhysicalStorageMount();
    if (mount) {
      try {
        const localFolder = path.join(mount, fullPath.replace(/^\/+/, ''));
        if (!fs.existsSync(localFolder)) {
          fs.mkdirSync(localFolder, { recursive: true });
        }
      } catch {
        // ignore
      }
    }

    res.status(201).json({
      success: true,
      message: `Folder "${name}" created successfully in Nextcloud`,
      folder: {
        name,
        path: fullPath,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
router.post('/mkdir', mkdirHandler);
router.post('/folder', mkdirHandler);

// POST /api/files/rename or /api/files/move - Real WebDAV move/rename
const renameHandler = async (req: Request, res: Response): Promise<void> => {
  const { sourcePath, destinationPath } = req.body;
  if (!sourcePath || !destinationPath) {
    res.status(400).json({ success: false, error: 'Both sourcePath and destinationPath are required' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    await ncService.moveOrRename(username, password, sourcePath, destinationPath);

    // Sync rename to physical storage
    const mount = getPhysicalStorageMount();
    if (mount) {
      try {
        const oldP = path.join(mount, sourcePath.replace(/^\/+/, ''));
        const newP = path.join(mount, destinationPath.replace(/^\/+/, ''));
        if (fs.existsSync(oldP)) {
          fs.renameSync(oldP, newP);
        }
      } catch {
        // ignore
      }
    }

    res.json({
      success: true,
      message: `Successfully renamed "${sourcePath}" to "${destinationPath}" in Nextcloud`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
router.post('/rename', renameHandler);
router.post('/move', renameHandler);

// DELETE /api/files/delete or DELETE /api/files - Real WebDAV delete
const deleteHandler = async (req: Request, res: Response): Promise<void> => {
  const targetPath = (req.query.path as string) || req.body?.path;
  if (!targetPath) {
    res.status(400).json({ success: false, error: 'Target path is required for deletion' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    await ncService.deleteItem(username, password, targetPath);

    // Sync deletion to physical storage
    const mount = getPhysicalStorageMount();
    if (mount) {
      try {
        const localTarget = path.join(mount, targetPath.replace(/^\/+/, ''));
        if (fs.existsSync(localTarget)) {
          fs.rmSync(localTarget, { recursive: true, force: true });
          logger.info(`[PHYSICAL SYNC] Deleted "${targetPath}" from ${mount}`);
        }
      } catch {
        // ignore
      }
    }

    res.json({
      success: true,
      message: `Item at "${targetPath}" deleted from Nextcloud`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
router.delete('/delete', deleteHandler);
router.delete('/', deleteHandler);

// GET /api/files/quota - Real user quota synchronized with Active Storage Pool
router.get('/quota', async (req: Request, res: Response): Promise<void> => {
  const username = getUsername(req);
  try {
    const quota = await ncService.getUserQuota(username);

    // Retrieve active storage pool to align cloud storage with physical devices
    let activePool: any = null;
    try {
      const pools = await poolService.getPools();
      activePool = pools.find((p) => p.totalBytes > 0 && p.memberCount > 0) || pools[0];
    } catch {
      // fallback to raw quota if pool service unavailable
    }

    if (activePool && activePool.totalBytes > 0) {
      // Synchronize Nextcloud user quota to match the physical storage pool
      ncService.setUserQuota(username, activePool.totalBytes).catch(() => {});

      const poolTotal = activePool.totalBytes;
      const poolUsed = quota.used;
      const poolFree = Math.max(0, poolTotal - poolUsed);
      const poolRelative = poolTotal > 0 ? Math.min(100, Math.round((poolUsed / poolTotal) * 100)) : 0;

      res.json({
        success: true,
        username,
        quota: {
          used: poolUsed,
          free: poolFree,
          total: poolTotal,
          relative: poolRelative,
          quota: String(poolTotal),
        },
        pool: {
          id: activePool.id,
          name: activePool.name,
          status: activePool.status,
          totalBytes: poolTotal,
          usedBytes: poolUsed,
          freeBytes: poolFree,
          memberCount: activePool.memberCount,
          members: (activePool.members || []).map((m: any) => ({
            name: m.deviceName,
            model: m.deviceModel,
            size: m.totalBytes,
          })),
          isConnected: true,
        },
      });
      return;
    }

    res.json({
      success: true,
      username,
      quota,
      pool: null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/files/photos - Real image gallery fetched from Nextcloud
router.get('/photos', async (req: Request, res: Response): Promise<void> => {
  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    // List root directory and Photos directory
    const rootFiles = await ncService.listDirectory(username, password, '/');
    let photoFiles: any[] = [];
    try {
      photoFiles = await ncService.listDirectory(username, password, '/Photos');
    } catch {
      // Photos folder might be empty or not yet created
    }

    const allItems = [...rootFiles, ...photoFiles];
    const imageExtensions = /\.(jpg|jpeg|png|webp|gif|svg)$/i;

    const images = allItems.filter(
      (item) => item.type === 'file' && (item.mime?.startsWith('image/') || imageExtensions.test(item.basename))
    );

    res.json({
      success: true,
      photos: images.map((img) => ({
        id: img.etag || img.filename,
        title: img.basename,
        path: img.filename,
        size: `${(img.size / (1024 * 1024)).toFixed(2)} MB`,
        date: new Date(img.lastmod).toLocaleDateString(),
        url: `/api/files/download?path=${encodeURIComponent(img.filename)}&user=${username}`,
      })),
      total: images.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
