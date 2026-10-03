import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

// Whitelist of allowed system commands to prevent arbitrary execution
const ALLOWED_BINARIES: Record<string, string> = {
  lsblk: '/bin/lsblk',
  df: '/bin/df',
  findmnt: '/bin/findmnt',
  mount: '/bin/mount',
  umount: '/bin/umount',
  mergerfs: '/usr/bin/mergerfs',
  smartctl: '/usr/sbin/smartctl',
};

// Strict pattern for safe device paths and mount points
const SAFE_PATH_REGEX = /^\/([a-zA-Z0-9_\-\.\/]+)$/;
const SAFE_UUID_REGEX = /^[a-zA-Z0-9\-]+$/;

export function validateDevicePath(devicePath: string): boolean {
  return SAFE_PATH_REGEX.test(devicePath);
}

export function validateUuid(uuid: string): boolean {
  return SAFE_UUID_REGEX.test(uuid);
}

/**
 * Safely execute a system binary with array arguments.
 * NEVER uses shell=true, immune to shell injection vulnerabilities.
 */
export async function safeExec(binary: keyof typeof ALLOWED_BINARIES | string, args: string[]): Promise<string> {
  const binaryPath = ALLOWED_BINARIES[binary] || binary;

  logger.debug(`Executing safe command: ${binaryPath} ${args.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      timeout: 10000, // 10s max execution limit
      maxBuffer: 1024 * 1024 * 5, // 5MB buffer
    });

    if (stderr && stderr.trim().length > 0) {
      logger.warn(`Command produced stderr: ${stderr.trim()}`);
    }

    return stdout;
  } catch (err: any) {
    logger.error(`Error executing ${binaryPath}: ${err.message}`);
    throw new Error(`System command execution failed: ${err.message}`);
  }
}
