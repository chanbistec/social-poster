import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { TenantBranding } from '@/lib/types';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tenants/[id]/branding — get branding for tenant */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  // Verify tenant exists
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const row = db.prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?').get(id) as TenantBranding | undefined;

  if (!row) {
    // Return default empty branding
    return NextResponse.json({
      data: {
        tenant_id: id,
        logo_path: null,
        colors: {},
        fonts: {},
        intro_frame: null,
        outro_frame: null,
        watermark: null,
        bgm_path: null,
        backgrounds: {},
      },
    });
  }

  // Parse JSON fields
  return NextResponse.json({
    data: {
      ...row,
      colors: JSON.parse(row.colors || '{}'),
      fonts: JSON.parse(row.fonts || '{}'),
      backgrounds: JSON.parse(row.backgrounds || '{}'),
    },
  });
}

/** PUT /api/tenants/[id]/branding — upsert branding */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  // Verify tenant exists
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const {
    logo_path,
    colors,
    fonts,
    intro_frame,
    outro_frame,
    watermark,
    bgm_path,
    backgrounds,
  } = body as {
    logo_path?: string;
    colors?: Record<string, unknown>;
    fonts?: Record<string, unknown>;
    intro_frame?: string;
    outro_frame?: string;
    watermark?: string;
    bgm_path?: string;
    backgrounds?: Record<string, unknown>;
  };

  const now = new Date().toISOString();

  // Get existing row for merge defaults
  const existing = db.prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?').get(id) as TenantBranding | undefined;

  const finalLogoPath = logo_path !== undefined ? logo_path : (existing?.logo_path ?? null);
  const finalColors = colors !== undefined ? JSON.stringify(colors) : (existing?.colors ?? '{}');
  const finalFonts = fonts !== undefined ? JSON.stringify(fonts) : (existing?.fonts ?? '{}');
  const finalIntroFrame = intro_frame !== undefined ? intro_frame : (existing?.intro_frame ?? null);
  const finalOutroFrame = outro_frame !== undefined ? outro_frame : (existing?.outro_frame ?? null);
  const finalWatermark = watermark !== undefined ? watermark : (existing?.watermark ?? null);
  const finalBgmPath = bgm_path !== undefined ? bgm_path : (existing?.bgm_path ?? null);
  const finalBackgrounds = backgrounds !== undefined ? JSON.stringify(backgrounds) : (existing?.backgrounds ?? '{}');

  db.prepare(`
    INSERT INTO tenant_branding (tenant_id, logo_path, colors, fonts, intro_frame, outro_frame, watermark, bgm_path, backgrounds, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET
      logo_path   = excluded.logo_path,
      colors      = excluded.colors,
      fonts       = excluded.fonts,
      intro_frame = excluded.intro_frame,
      outro_frame = excluded.outro_frame,
      watermark   = excluded.watermark,
      bgm_path    = excluded.bgm_path,
      backgrounds = excluded.backgrounds,
      updated_at  = excluded.updated_at
  `).run(
    id,
    finalLogoPath,
    finalColors,
    finalFonts,
    finalIntroFrame,
    finalOutroFrame,
    finalWatermark,
    finalBgmPath,
    finalBackgrounds,
    existing?.created_at ?? now,
    now,
  );

  const updated = db.prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?').get(id) as TenantBranding;

  return NextResponse.json({
    data: {
      ...updated,
      colors: JSON.parse(updated.colors || '{}'),
      fonts: JSON.parse(updated.fonts || '{}'),
      backgrounds: JSON.parse(updated.backgrounds || '{}'),
    },
  });
}
