import path from 'node:path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { NextcloudService } from '../services/NextcloudService.js';
import { logger } from '../utils/logger.js';

const router = Router();
const ncService = new NextcloudService();

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

// GET /api/files/list - List files in user directory via real WebDAV
router.get('/list', async (req: Request, res: Response): Promise<void> => {
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
});

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

// POST /api/files/mkdir - Real WebDAV folder creation
router.post('/mkdir', async (req: Request, res: Response): Promise<void> => {
  const { path: parentPath, name } = req.body;
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
});

// POST /api/files/rename - Real WebDAV move/rename
router.post('/rename', async (req: Request, res: Response): Promise<void> => {
  const { sourcePath, destinationPath } = req.body;
  if (!sourcePath || !destinationPath) {
    res.status(400).json({ success: false, error: 'Both sourcePath and destinationPath are required' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    await ncService.moveOrRename(username, password, sourcePath, destinationPath);
    res.json({
      success: true,
      message: `Successfully renamed "${sourcePath}" to "${destinationPath}" in Nextcloud`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/files/delete - Real WebDAV delete
router.delete('/delete', async (req: Request, res: Response): Promise<void> => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    res.status(400).json({ success: false, error: 'Target path is required for deletion' });
    return;
  }

  const username = getUsername(req);
  const password = getUserPassword(req);

  try {
    await ncService.deleteItem(username, password, targetPath);
    res.json({
      success: true,
      message: `Item at "${targetPath}" deleted from Nextcloud`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/files/quota - Real user quota from Nextcloud OCS API
router.get('/quota', async (req: Request, res: Response): Promise<void> => {
  const username = getUsername(req);
  try {
    const quota = await ncService.getUserQuota(username);
    res.json({
      success: true,
      username,
      quota,
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
