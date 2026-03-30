import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import db from '@/lib/db';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

const VALID_TYPES = ['logo', 'intro_frame', 'outro_frame', 'bgm', 'background'] as const;
type AssetType = (typeof VALID_TYPES)[number];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/tenants/[id]/branding/upload — upload branding asset */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  // Verify tenant exists
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const type = formData.get('type') as string | null;
  const category = formData.get('category') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (!type || !VALID_TYPES.includes(type as AssetType)) {
    return NextResponse.json(
      { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 50MB limit' }, { status: 413 });
  }

  // Sanitize filename
  const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(originalName) || '';

  let relativePath: string;
  let dirPath: string;

  if (type === 'background' && category) {
    // Save as data/branding/{tenant_id}/backgrounds/{category}.{ext}
    const safeCat = category.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeCat}${ext}`;
    relativePath = path.join('data', 'branding', id, 'backgrounds', filename);
    dirPath = path.join(process.cwd(), 'data', 'branding', id, 'backgrounds');
  } else {
    // Save as data/branding/{tenant_id}/{type}/{filename}
    relativePath = path.join('data', 'branding', id, type, originalName);
    dirPath = path.join(process.cwd(), 'data', 'branding', id, type);
  }

  // Create directories
  await mkdir(dirPath, { recursive: true });

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  const fullPath = path.join(process.cwd(), relativePath);
  await writeFile(fullPath, buffer);

  const result: { path: string; type: string; category?: string } = {
    path: relativePath,
    type,
  };
  if (type === 'background' && category) {
    result.category = category;
  }

  return NextResponse.json({ data: result });
}
