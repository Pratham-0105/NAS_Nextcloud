import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

export const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

prisma.$connect()
  .then(() => {
    logger.info('[DATABASE] Prisma connected to PostgreSQL successfully.');
  })
  .catch((err) => {
    logger.error('[DATABASE] Failed to connect to PostgreSQL via Prisma:', err);
  });
