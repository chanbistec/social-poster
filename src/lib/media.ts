import fs from 'fs/promises';
import path from 'path';

const MEDIA_ROOT = path.join(process.cwd(), 'data', 'media');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.mov', '.webm',
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export interface UploadResult {
  path: string;      // relative path: {tenant_id}/{filename}
  filename: string;
  size: number;
}

function sanitizeFilename(name: string): string {
  // Remove path traversal, keep only safe characters
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '.');
}

function getExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext;
}

/**
 * Save an uploaded file to data/media/{tenantId}/{filename}
 */
export async function saveUploadedFile(file: File, tenantId: string): Promise<UploadResult> {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is 100MB, got ${(file.size / 1024 / 1024).toFixed(1)}MB`);
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Allowed: jpg, png, gif, webp, mp4, mov, webm`);
  }

  // Validate extension
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file extension: ${ext}`);
  }

  // Sanitize and create unique filename
  const safeName = sanitizeFilename(file.name);
  const timestamp = Date.now();
  const filename = `${timestamp}-${safeName}`;

  // Ensure directory exists
  const dir = path.join(MEDIA_ROOT, tenantId);
  await fs.mkdir(dir, { recursive: true });

  // Write file
  const filePath = path.join(dir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  const relativePath = `${tenantId}/${filename}`;
  return { path: relativePath, filename, size: file.size };
}

/**
 * Get the absolute filesystem path for a media file.
 * Validates that the resolved path stays within MEDIA_ROOT to prevent traversal.
 */
export function getMediaPath(relativePath: string): string {
  const resolved = path.resolve(MEDIA_ROOT, relativePath);
  if (!resolved.startsWith(MEDIA_ROOT)) {
    throw new Error('Invalid media path');
  }
  return resolved;
}

/**
 * Delete a media file by its relative path.
 */
export async function deleteMedia(relativePath: string): Promise<void> {
  const fullPath = getMediaPath(relativePath);
  try {
    await fs.unlink(fullPath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // File already gone — that's fine
  }
}

/**
 * Get MIME type from file extension.
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return types[ext] ?? 'application/octet-stream';
}
