import { Router, Request, Response } from 'express';
import multer from 'multer';
import { NextcloudService } from '../services/NextcloudService.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
const ncService = new NextcloudService();
const upload = multer({ limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max limit

// GET /api/files/list - List files in user directory
router.get('/list', async (req: Request, res: Response): Promise<void> => {
  const currentPath = (req.query.path as string) || '/';
  const username = (req.query.user as string) || 'demouser';

  try {
    const items = await ncService.listDirectory(username, 'user123', currentPath);
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

// POST /api/files/upload - Handle file upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file provided in multipart request' });
    return;
  }

  const destinationPath = (req.body.path as string) || '/';
  logger.info(`Received file upload: ${req.file.originalname} (${req.file.size} bytes) destination: ${destinationPath}`);

  res.status(201).json({
    success: true,
    message: `File ${req.file.originalname} uploaded successfully to ${destinationPath}`,
    file: {
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
    },
  });
});

// POST /api/files/mkdir - Create virtual folder
router.post('/mkdir', async (req: Request, res: Response): Promise<void> => {
  const { path: folderPath, name } = req.body;
  if (!name) {
    res.status(400).json({ success: false, error: 'Folder name is required' });
    return;
  }

  res.status(201).json({
    success: true,
    message: `Folder "${name}" created at ${folderPath || '/'}`,
    folder: {
      name,
      path: `${folderPath || ''}/${name}`,
      createdAt: new Date().toISOString(),
    },
  });
});

// DELETE /api/files/delete - Remove file or folder
router.delete('/delete', async (req: Request, res: Response): Promise<void> => {
  const { path: targetPath } = req.body;
  if (!targetPath) {
    res.status(400).json({ success: false, error: 'Target path is required for deletion' });
    return;
  }

  res.json({
    success: true,
    message: `Item at "${targetPath}" moved to trash`,
  });
});

// GET /api/files/photos - Gallery view filtering for media
router.get('/photos', async (req: Request, res: Response): Promise<void> => {
  const photos = [
    {
      id: 'photo-1',
      title: 'campus_sunset.jpg',
      url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
      thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=300&auto=format&fit=crop&q=60',
      size: '4.1 MB',
      date: 'Yesterday, 6:45 PM',
    },
    {
      id: 'photo-2',
      title: 'lab_server_setup.png',
      url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&auto=format&fit=crop&q=80',
      thumbnail: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=300&auto=format&fit=crop&q=60',
      size: '6.8 MB',
      date: 'Oct 02, 2026',
    },
    {
      id: 'photo-3',
      title: 'project_diagram_v2.png',
      url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80',
      thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300&auto=format&fit=crop&q=60',
      size: '1.9 MB',
      date: 'Sep 29, 2026',
    },
  ];

  res.json({
    success: true,
    photos,
    total: photos.length,
  });
});

export default router;
