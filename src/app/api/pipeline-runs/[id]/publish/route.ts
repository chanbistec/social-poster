import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import db from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { ensureFreshToken } from '@/lib/token-refresh';
import { publishPost, type PlatformConfig } from '@/lib/publishers/index';
import type { PipelineRun, Post, PostParsed, Platform, PlatformType } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

function parsePost(post: Post): PostParsed {
  return {
    ...post,
    hashtags: JSON.parse(post.hashtags) as string[],
    media_paths: JSON.parse(post.media_paths) as string[],
    platforms: JSON.parse(post.platforms) as PlatformType[],
  };
}

/** POST /api/pipeline-runs/:id/publish — Publish approved pipeline content */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const runId = Number(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const run = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as PipelineRun | undefined;
  if (!run) {
    return NextResponse.json({ error: 'Pipeline run not found' }, { status: 404 });
  }

  if (run.status !== 'approved') {
    return NextResponse.json(
      { error: `Cannot publish run with status "${run.status}". Only approved runs can be published.` },
      { status: 400 },
    );
  }

  if (!run.post_id) {
    return NextResponse.json(
      { error: 'Run has no associated post. Approve the run first.' },
      { status: 400 },
    );
  }

  // Load the post
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(run.post_id) as Post | undefined;
  if (!post) {
    return NextResponse.json({ error: 'Associated post not found' }, { status: 404 });
  }

  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return NextResponse.json(
      { error: `Post status is "${post.status}". Only approved or scheduled posts can be published.` },
      { status: 400 },
    );
  }

  const parsed = parsePost(post);

  // Fetch enabled platform configs for this tenant
  const platforms = parsed.platforms;
  const placeholders = platforms.map(() => '?').join(', ');
  const platformRows = db.prepare(
    `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`,
  ).all(post.tenant_id, ...platforms) as Platform[];

  if (platformRows.length === 0) {
    return NextResponse.json(
      { error: 'No enabled platforms found for this tenant' },
      { status: 400 },
    );
  }

  // Refresh tokens if needed
  for (const p of platformRows) {
    try {
      await ensureFreshToken(p, decrypt, encrypt);
    } catch (err) {
      console.error(`[Publish] Token refresh failed for ${p.type}:`, err);
      // Continue anyway — publish will fail with auth error if token is truly expired
    }
  }

  // Re-load platforms after potential refresh
  const freshPlatforms = db.prepare(
    `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`,
  ).all(post.tenant_id, ...platforms) as Platform[];

  // Build media base URL
  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const mediaBaseUrl = `${proto}://${host}/api/media`;

  // Decrypt credentials and build platform configs
  const platformConfigs: PlatformConfig[] = freshPlatforms.map((p) => {
    const credentials = JSON.parse(decrypt(p.credentials)) as PlatformConfig['credentials'];
    const config = p.config ? JSON.parse(p.config) : {};
    return {
      platform: p.type,
      credentials,
      privacy: config.privacy,
      media_base_url: mediaBaseUrl,
    };
  });

  const now = new Date().toISOString();

  // Mark as publishing
  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('publishing', now, post.id);
  db.prepare('UPDATE pipeline_runs SET status = ? WHERE id = ?').run('publishing', runId);

  // Publish to all platforms
  const results = await publishPost(parsed, platformConfigs);

  // Save publish results
  const insertResult = db.prepare(`
    INSERT INTO publish_results (post_id, platform, status, external_id, external_url, error, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const saveResults = db.transaction(() => {
    for (const r of results) {
      insertResult.run(
        post.id,
        r.platform,
        r.success ? 'success' : 'failed',
        r.external_id ?? null,
        r.external_url ?? null,
        r.error ?? null,
        r.success ? new Date().toISOString() : null,
      );
    }
  });
  saveResults();

  // Determine overall status
  const allFailed = results.every((r) => !r.success);
  const finalStatus = allFailed ? 'failed' : 'published';

  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run(finalStatus, new Date().toISOString(), post.id);
  db.prepare('UPDATE pipeline_runs SET status = ? WHERE id = ?').run(finalStatus, runId);

  const updatedRun = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId);
  const updatedPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);

  return NextResponse.json({
    data: {
      run: updatedRun,
      post: updatedPost,
      results,
    },
  });
}
