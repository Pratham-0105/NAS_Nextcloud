import { Router, Request, Response } from 'express';
import { StorageDetector } from '../services/StorageDetector.js';
import { StoragePoolService } from '../services/StoragePoolService.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
const detector = new StorageDetector();
const poolService = new StoragePoolService(detector);

// Event log store
const storageEvents: any[] = [
  {
    id: 'evt-1',
    severity: 'INFO',
    eventType: 'DEVICE_DETECTED',
    message: 'Storage device Samsung 980 PRO 250GB detected on host bus.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'evt-2',
    severity: 'INFO',
    eventType: 'POOL_INITIALIZED',
    message: 'Storage pool mergerfs mounted at /mnt/storage_pool with 2 active branches.',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
  }
];

// GET /api/storage/devices - Lists all detected host storage devices
router.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const devices = await poolService.getDevices();
    res.json({
      success: true,
      devices,
      totalCount: devices.length,
      activeCount: devices.filter((d) => d.isCloudStorage).length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/:id/add - Add device to cloud storage pool
router.post('/devices/:id/add', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const device = await poolService.addDeviceToPool(deviceId);

    storageEvents.unshift({
      id: `evt-${Date.now()}`,
      severity: 'INFO',
      eventType: 'DEVICE_ADDED',
      message: `Device ${device.deviceName} (${device.deviceModel}) was added to cloud storage pool.`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Device ${device.deviceName} successfully added to cloud storage pool`,
      device,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/:id/remove - Safely remove device from pool
router.post('/devices/:id/remove', async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = req.params.id;
    const device = await poolService.removeDeviceFromPool(deviceId);

    storageEvents.unshift({
      id: `evt-${Date.now()}`,
      severity: 'WARNING',
      eventType: 'DEVICE_REMOVED',
      message: `Device ${device.deviceName} (${device.deviceModel}) was unmounted and removed from pool.`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Device ${device.deviceName} successfully removed from cloud storage pool`,
      device,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/storage/status - Returns health and state of storage pool
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await poolService.getPoolSummary();
    res.json({
      success: true,
      pool: summary,
      isOnline: true,
      filesystem: 'mergerfs',
      mountPath: '/mnt/storage_pool',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/usage - Usage breakdown and warning thresholds
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await poolService.getPoolSummary();
    const devices = await poolService.getDevices();

    const deviceBreakdown = devices.map((d) => ({
      name: d.deviceName,
      model: d.deviceModel,
      type: d.deviceType,
      totalBytes: d.totalBytes,
      usedBytes: d.usedBytes,
      freeBytes: d.freeBytes,
      percentUsed: d.totalBytes > 0 ? Math.round((d.usedBytes / d.totalBytes) * 100) : 0,
      status: d.status,
      isCloudStorage: d.isCloudStorage,
    }));

    const warnings: string[] = [];
    if (summary.percentUsed >= 90) {
      warnings.push(`Warning: Cloud storage pool is ${summary.percentUsed}% full.`);
    }

    res.json({
      success: true,
      summary,
      deviceBreakdown,
      warnings,
      events: storageEvents.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { poolService, detector };
export default router;
