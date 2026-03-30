import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { decrypt, encrypt } from '@/lib/crypto';
import { ensureFreshToken } from '@/lib/token-refresh';
import type { Platform } from '@/lib/types';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

type Params = { params: Promise<{ id: string }> };

/** POST /api/platforms/:id/refresh — Force token refresh */
export async function POST(_req: NextRequest, { params }: Params) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(id) as Platform | undefined;

  if (!platform) {
    return NextResponse.json({ error: 'Platform not found' }, { status: 404 });
  }

  try {
    const freshCreds = await ensureFreshToken(platform, decrypt, encrypt);
    
    // Re-read to get updated token_expires_at
    const updated = db.prepare('SELECT id, type, token_expires_at, enabled FROM platforms WHERE id = ?').get(id) as any;

    return NextResponse.json({
      data: {
        id: updated.id,
        type: updated.type,
        token_expires_at: updated.token_expires_at,
        refreshed: true,
        message: `${platform.type} token refreshed successfully`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Token refresh failed: ${message}` },
      { status: 400 },
    );
  }
}
