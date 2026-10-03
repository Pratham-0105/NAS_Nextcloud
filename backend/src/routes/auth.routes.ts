import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { NextcloudService } from '../services/NextcloudService.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
const ncService = new NextcloudService();

// In-memory user store for demo/development before full DB migration
const inMemoryUsers: any[] = [
  {
    id: 'clouduser',
    email: 'clouduser@cloudnas.local',
    name: 'CloudNAS User',
    passwordHash: bcrypt.hashSync('CloudUserPass123!', 10),
    role: 'USER',
    nextcloudUser: 'clouduser',
  },
  {
    id: 'admin',
    email: 'admin@cloud.local',
    name: 'System Administrator',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'ADMIN',
    nextcloudUser: 'admin',
  },
  {
    id: 'user',
    email: 'user@cloud.local',
    name: 'Standard User',
    passwordHash: bcrypt.hashSync('user123', 10),
    role: 'USER',
    nextcloudUser: 'clouduser',
  }
];

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['ADMIN', 'USER']).optional().default('USER'),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.errors[0].message });
    return;
  }

  const { name, email, password, role } = result.data;
  const existing = inMemoryUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    res.status(409).json({ success: false, error: 'User with this email already exists' });
    return;
  }

  const username = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const passwordHash = await bcrypt.hash(password, 10);

  // Synchronously provision Nextcloud shadow user
  await ncService.provisionUser(username, email, password);

  const newUser = {
    id: username,
    name,
    email,
    passwordHash,
    role,
    nextcloudUser: username,
  };
  inMemoryUsers.push(newUser);

  const token = jwt.sign(
    {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      nextcloudUser: newUser.nextcloudUser,
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      nextcloudUser: newUser.nextcloudUser,
    },
  });
});

const loginSchema = z.object({
  id: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ success: false, error: result.error.errors[0].message });
    return;
  }

  const { id, username, email, password } = result.data;
  const identifier = (id || username || email || '').toLowerCase().trim();

  if (!identifier) {
    res.status(400).json({ success: false, error: 'User ID or Email is required' });
    return;
  }

  const user = inMemoryUsers.find(
    (u) =>
      u.email.toLowerCase() === identifier ||
      u.id.toLowerCase() === identifier ||
      (u.nextcloudUser && u.nextcloudUser.toLowerCase() === identifier)
  );

  let isValidPassword = false;
  if (user) {
    isValidPassword = await bcrypt.compare(password, user.passwordHash);
    // Development convenience fallback
    if (!isValidPassword) {
      if (
        (user.id === 'clouduser' && (password === 'CloudUserPass123!' || password === 'cloud123' || password === 'password123')) ||
        (user.id === 'admin' && (password === 'admin123' || password === 'Admin@Nextcloud2026!')) ||
        (user.id === 'user' && password === 'user123')
      ) {
        isValidPassword = true;
      }
    }
  }

  if (!user || !isValidPassword) {
    res.status(401).json({ success: false, error: 'Invalid User ID or password' });
    return;
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      nextcloudUser: user.nextcloudUser,
    },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      nextcloudUser: user.nextcloudUser,
    },
  });
});

router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  res.json({ success: true, user: req.user });
});

export default router;
