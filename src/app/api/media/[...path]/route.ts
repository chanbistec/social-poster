import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { getMediaPath, getMimeType } from '@/lib/media';

type Params = { params: Promise<{ path: string[] }> };

// GET /api/media/[...path] — serve media files publicly (no auth required)
export async function GET(_request: NextRequest, { params }: Params) {
  const { path: segments } = await params;
  const relativePath = segments.join('/');

  let fullPath: string;
  try {
    fullPath = getMediaPath(relativePath);
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const buffer = await fs.readFile(fullPath);
    const mimeType = getMimeType(fullPath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(stat.size),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
