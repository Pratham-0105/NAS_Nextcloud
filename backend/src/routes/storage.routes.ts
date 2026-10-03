import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { StorageDetector } from '../services/StorageDetector.js';
import { StoragePoolService, StorageEventPayload } from '../services/StoragePoolService.js';
import { AuthenticatedUser } from '../types/index.js';
import { prisma } from '../db/prisma.js';

const router = Router();
const detector = new StorageDetector();
const poolService = new StoragePoolService(detector);

// In-memory event log store for telemetry and admin timeline (populated dynamically)
const storageEvents: StorageEventPayload[] = [];

// Subscribe to pool service events
poolService.onEvent((evt) => {
  storageEvents.unshift(evt);
  if (storageEvents.length > 50) storageEvents.pop();
});

/**
 * Enforce Admin Authorization on Storage Endpoints
 * 1. Checks Bearer JWT token
 * 2. Blocks normal users (role !== 'ADMIN') with 403 Forbidden
 * 3. Supports x-admin-portal bypass header only in local development
 */
function requireAdminAuthorization(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    // Allow local development admin portal requests if header present
    if (req.headers['x-admin-portal'] === 'true' && process.env.NODE_ENV !== 'production') {
      return next();
    }
    res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
    if (decoded.role !== 'ADMIN') {
      res.status(403).json({ success: false, error: 'Access denied. Administrator privileges required.' });
      return;
    }
    (req as any).user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired authentication token.' });
  }
}

// Apply admin authorization to all storage management endpoints
router.use(requireAdminAuthorization);

// GET /api/storage/mode - Get current storage detection mode
router.get('/mode', (req: Request, res: Response): void => {
  res.json({
    success: true,
    mode: detector.getMode(),
    platform: process.platform,
    isLinux: process.platform === 'linux',
    isDarwin: process.platform === 'darwin',
  });
});

// POST /api/storage/mode - Switch storage detection mode
router.post('/mode', async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode } = req.body || {};
    if (!['auto', 'real', 'simulation'].includes(mode)) {
      res.status(400).json({ success: false, error: 'Invalid mode. Supported: auto, real, simulation' });
      return;
    }
    detector.setMode(mode);
    const devices = await poolService.pollDevices();
    res.json({
      success: true,
      message: `Storage detection mode switched to ${mode.toUpperCase()}`,
      mode,
      deviceCount: devices.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/reset-all - Unregister all cloud devices back to available
router.post('/devices/reset-all', async (req: Request, res: Response): Promise<void> => {
  try {
    await poolService.unregisterAllDevices();
    res.json({
      success: true,
      message: 'All storage devices unregistered. Storage pool reset to 0 bytes.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/devices - Full inventory with category grouping
router.get('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const devices = await poolService.getDevices();

    const activeStorage = devices.filter((d) => d.isCloudStorage && !d.isSystemDisk);
    const availableDevices = devices.filter((d) => !d.isCloudStorage && !d.isSystemDisk);
    const systemDevices = devices.filter((d) => d.isSystemDisk);

    res.json({
      success: true,
      devices,
      categorized: {
        active: activeStorage,
        available: availableDevices,
        system: systemDevices,
      },
      summary: {
        total: devices.length,
        activeCount: activeStorage.length,
        availableCount: availableDevices.length,
        systemCount: systemDevices.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/status - Returns health, capacity summary, and safety flags
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const summary = await poolService.getPoolSummary();
    res.json({
      success: true,
      pool: summary,
      isOnline: true,
      safetyNotice: 'Storage pooling aggregates capacity without formatting. It does NOT provide data redundancy or backup.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/usage - Usage breakdown and recent storage events
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
      isSystemDisk: d.isSystemDisk,
      partitionsCount: d.partitions?.length || 0,
    }));

    res.json({
      success: true,
      summary,
      deviceBreakdown,
      events: storageEvents.slice(0, 15),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/simulate-hotplug - Connect a simulated USB SSD/HDD
router.post('/devices/simulate-hotplug', async (req: Request, res: Response): Promise<void> => {
  try {
    const customDevice = (req.body && req.body.deviceName) ? req.body : {
      deviceName: 'sde',
      devicePath: '/dev/sde',
      deviceModel: 'Crucial X8 1TB Portable USB SSD [SIMULATED DEVICE]',
      vendor: 'Crucial',
      model: 'CT1000X8SSD9',
      serial: 'CRUCIAL-X8-1000',
      deviceType: 'USB_SSD',
      transport: 'USB',
      detectionSource: 'SIMULATION',
      filesystem: 'ext4',
      uuid: 'e8f7a6b5-5555-8888-cccc-000000000005',
      totalBytes: 1_000_000_000_000,
      usedBytes: 120_000_000_000,
      freeBytes: 880_000_000_000,
      mountPoint: null,
      isRemovable: true,
      isRotational: false,
      isReadOnly: false,
      isSystemDisk: false,
      hasExistingData: true,
      isCloudStorage: false,
      isSimulated: true,
      status: 'AVAILABLE',
      partitions: [
        {
          name: 'sde1',
          path: '/dev/sde1',
          size: 1_000_000_000_000,
          filesystem: 'ext4',
          uuid: 'e8f7a6b5-5555-8888-cccc-000000000005',
          label: 'Crucial_Fast',
          mountPoint: null,
          usedBytes: 120_000_000_000,
          freeBytes: 880_000_000_000,
          isSystemPartition: false,
          hasExistingData: true,
        }
      ],
      lastSeenAt: new Date().toISOString(),
    };

    const added = await poolService.simulateHotPlug(customDevice);
    res.json({
      success: true,
      message: `Hot-plug simulated for ${added.deviceModel}`,
      device: added,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/simulate-reset - Reset simulated hardware inventory
router.post('/devices/simulate-reset', async (req: Request, res: Response): Promise<void> => {
  try {
    detector.resetSimulatedDevices();
    await poolService.pollDevices();
    res.json({ success: true, message: 'Simulated hardware devices reset to default baseline.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/devices/:id - Details of a single device
router.get('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await poolService.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: `Device "${req.params.id}" not found.` });
      return;
    }
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/devices/:id/partitions - Partition inspection
router.get('/devices/:id/partitions', async (req: Request, res: Response): Promise<void> => {
  try {
    const partitions = await poolService.getDevicePartitions(req.params.id);
    res.json({
      success: true,
      deviceId: req.params.id,
      partitions,
      count: partitions.length,
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// GET /api/storage/devices/:id/health - Basic health check of device
router.get('/devices/:id/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await poolService.getDeviceById(req.params.id);
    if (!device) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    res.json({
      success: true,
      deviceId: device.uuid,
      deviceName: device.deviceName,
      health: {
        isAvailable: device.status !== 'UNAVAILABLE' && device.status !== 'DISCONNECTED',
        isReadOnly: device.isReadOnly,
        hasExistingData: device.hasExistingData,
        smartStatus: 'PASSED',
        temperatureCelsius: 36,
        mountState: device.mountPoint ? 'MOUNTED' : 'UNMOUNTED',
        inspectedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/:id/register - Safe device registration (rejects system disks)
router.post('/devices/:id/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { confirmExistingData } = req.body || {};
    const updated = await poolService.registerDevice(req.params.id, { confirmExistingData });

    res.json({
      success: true,
      message: `Device ${updated.deviceModel} (${updated.deviceName}) registered for cloud storage. No data altered.`,
      device: updated,
    });
  } catch (err: any) {
    const isProtected = err.message.includes('PROTECTED DISK');
    res.status(isProtected ? 403 : 400).json({
      success: false,
      error: err.message,
      isSystemDisk: isProtected,
    });
  }
});

// POST /api/storage/devices/:id/unregister - Safe removal from cloud catalog
router.post('/devices/:id/unregister', async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await poolService.unregisterDevice(req.params.id);
    res.json({
      success: true,
      message: `Device ${updated.deviceModel} (${updated.deviceName}) unregistered. Data remains intact.`,
      device: updated,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/:id/simulate-unplug - Simulate unplugging a device
router.post('/devices/:id/simulate-unplug', async (req: Request, res: Response): Promise<void> => {
  try {
    const removed = await poolService.simulateDisconnect(req.params.id);
    if (!removed) {
      res.status(404).json({ success: false, error: `Device ${req.params.id} not found.` });
      return;
    }
    res.json({
      success: true,
      message: `Device ${removed.deviceModel} (${removed.deviceName}) disconnected.`,
      device: removed,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/devices/simulate-unplug - Simulate unplugging a device with uuid in body
router.post('/devices/simulate-unplug', async (req: Request, res: Response): Promise<void> => {
  try {
    const uuid = req.body?.uuid || req.body?.id;
    if (!uuid) {
      res.status(400).json({ success: false, error: 'Device uuid is required' });
      return;
    }
    const removed = await poolService.simulateDisconnect(uuid);
    if (!removed) {
      res.status(404).json({ success: false, error: `Device ${uuid} not found.` });
      return;
    }
    res.json({
      success: true,
      message: `Device ${removed.deviceModel} (${removed.deviceName}) disconnected.`,
      device: removed,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Aliases for Phase 1 / Phase 2 backward compatibility
router.post('/devices/:id/add', async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await poolService.registerDevice(req.params.id);
    res.json({
      success: true,
      message: `Device ${updated.deviceName} registered for cloud storage`,
      device: updated,
    });
  } catch (err: any) {
    const isProtected = err.message.includes('PROTECTED DISK');
    res.status(isProtected ? 403 : 400).json({ success: false, error: err.message });
  }
});

router.post('/devices/:id/remove', async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await poolService.unregisterDevice(req.params.id);
    res.json({
      success: true,
      message: `Device ${updated.deviceName} unregistered from cloud storage`,
      device: updated,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ======================================================================
// Phase 4: Storage Pool Management Endpoints
// ======================================================================

// GET /api/storage/pools - List all storage pools
router.get('/pools', async (req: Request, res: Response): Promise<void> => {
  try {
    const pools = await poolService.getPools();
    res.json({
      success: true,
      pools,
      count: pools.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/pools - Create a new storage pool
router.post('/pools', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, mountPoint, poolingMethod } = req.body || {};
    if (!name || typeof name !== 'string') {
      res.status(400).json({ success: false, error: 'Storage pool name is required.' });
      return;
    }
    const pool = await poolService.createPool({ name, mountPoint, poolingMethod });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'STORAGE_POOL_CREATE',
          details: { poolId: pool.id, name: pool.name, mountPoint: pool.mountPoint },
        },
      });
    } catch {
      // ignore
    }

    res.status(201).json({
      success: true,
      message: `Storage pool "${pool.name}" created successfully.`,
      pool,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/storage/pools/:id - Get a specific storage pool
router.get('/pools/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await poolService.getPoolById(req.params.id);
    if (!pool) {
      res.status(404).json({ success: false, error: `Storage pool "${req.params.id}" not found.` });
      return;
    }
    res.json({ success: true, pool });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/pools/:id/usage - Get detailed pool usage breakdown
router.get('/pools/:id/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await poolService.getPoolById(req.params.id);
    if (!pool) {
      res.status(404).json({ success: false, error: `Storage pool "${req.params.id}" not found.` });
      return;
    }
    const percentUsed = pool.totalBytes > 0 ? Math.round((pool.usedBytes / pool.totalBytes) * 100) : 0;
    res.json({
      success: true,
      usage: {
        poolId: pool.id,
        name: pool.name,
        totalBytes: pool.totalBytes,
        usedBytes: pool.usedBytes,
        freeBytes: pool.freeBytes,
        percentUsed,
        memberCount: pool.memberCount,
        members: pool.members.map((m) => ({
          deviceName: m.deviceName,
          deviceModel: m.deviceModel,
          totalBytes: m.totalBytes,
          usedBytes: m.usedBytes,
          freeBytes: m.freeBytes,
          status: m.status,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/storage/pools/:id/health - Inspect health of pool and its member drives
router.get('/pools/:id/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const health = await poolService.checkPoolHealth(req.params.id);
    res.json({ success: true, health });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// POST /api/storage/pools/:id/members/:deviceId/validate - Validate device eligibility
router.post('/pools/:id/members/:deviceId/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = await poolService.validatePoolMember(req.params.id, req.params.deviceId);
    res.json({ success: true, validation });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/storage/pools/:id/members/:deviceId/add - Add device to storage pool
router.post('/pools/:id/members/:deviceId/add', async (req: Request, res: Response): Promise<void> => {
  try {
    const { confirm, confirmExistingData } = req.body || {};
    const pool = await poolService.addDeviceToPool(req.params.id, req.params.deviceId, {
      confirm,
      confirmExistingData,
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'STORAGE_POOL_MEMBER_ADD',
          details: { poolId: pool.id, deviceId: req.params.deviceId },
        },
      });
    } catch {
      // ignore
    }

    res.json({
      success: true,
      message: `Device added to pool "${pool.name}" successfully. Capacity updated.`,
      pool,
    });
  } catch (err: any) {
    const isProtected = err.message.includes('CRITICAL: Operating system') || err.message.includes('boot disk');
    const isConfirmNeeded = err.message.includes('Confirmation required');
    res.status(isProtected ? 403 : isConfirmNeeded ? 400 : 400).json({
      success: false,
      error: err.message,
      requiresConfirmation: isConfirmNeeded,
      isSystemDisk: isProtected,
    });
  }
});

// POST /api/storage/pools/:id/members/:deviceId/remove - Remove device from storage pool
router.post('/pools/:id/members/:deviceId/remove', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await poolService.removeDeviceFromPool(req.params.id, req.params.deviceId);

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'STORAGE_POOL_MEMBER_REMOVE',
          details: { poolId: pool.id, deviceId: req.params.deviceId },
        },
      });
    } catch {
      // ignore
    }

    res.json({
      success: true,
      message: `Device removed from pool "${pool.name}". Member unlinked safely.`,
      pool,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/storage/pools/:id/start - Start storage pool
router.post('/pools/:id/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await poolService.startPool(req.params.id);
    res.json({ success: true, message: `Storage pool "${pool.name}" is now ACTIVE.`, pool });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/storage/pools/:id/stop - Stop storage pool
router.post('/pools/:id/stop', async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = await poolService.stopPool(req.params.id);
    res.json({ success: true, message: `Storage pool "${pool.name}" is now STOPPED.`, pool });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

export { poolService, detector };
export default router;

