import { Router, Request, Response } from 'express';
import { TelemetryService } from '../services/TelemetryService.js';
import { poolService } from './storage.routes.js';

const router = Router();
const telemetryService = new TelemetryService(poolService);

router.get('/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await telemetryService.getTelemetry();
    res.json({
      success: true,
      serverStatus: 'ONLINE',
      ...data,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/containers', (req: Request, res: Response) => {
  res.json({
    success: true,
    services: [
      { name: 'Nextcloud Cloud Engine', container: 'nas_nextcloud', status: 'RUNNING', port: 8080 },
      { name: 'PostgreSQL Database', container: 'nas_postgres', status: 'RUNNING', port: 5432 },
      { name: 'Redis Cache', container: 'nas_redis', status: 'RUNNING', port: 6379 },
      { name: 'Storage Backend API', container: 'nas_backend', status: 'RUNNING', port: 4000 },
      { name: 'Admin Storage Portal', container: 'nas_admin_portal', status: 'RUNNING', port: 3001 },
      { name: 'User Cloud Portal', container: 'nas_user_portal', status: 'RUNNING', port: 3000 },
    ],
  });
});

export { telemetryService };
export default router;
