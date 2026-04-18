import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import db from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { ensureFreshToken } from '@/lib/token-refresh';
import { publishPost, type PlatformConfig } from '@/lib/publishers/index';
import type { PipelineRun, Post, PostParsed, Platform, PlatformType } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

type PublishResultRow = {
  id: number;
  platform: PlatformType;
  status: 'pending' | 'success' | 'failed';
};

function parsePost(post: Post): PostParsed {
  return {
    ...post,
    hashtags: JSON.parse(post.hashtags) as string[],
    media_paths: JSON.parse(post.media_paths) as string[],
    platforms: JSON.parse(post.platforms) as PlatformType[],
  };
}

function getRetryPlatforms(postId: number, requestedPlatforms: PlatformType[]) {
  if (requestedPlatforms.length > 0) return requestedPlatforms;

  const latestRows = db
    .prepare(
      `SELECT pr.id, pr.platform, pr.status
       FROM publish_results pr
       WHERE pr.post_id = ?
         AND pr.id IN (
           SELECT MAX(inner_pr.id)
           FROM publish_results inner_pr
           WHERE inner_pr.post_id = ?
           GROUP BY inner_pr.platform
         )`
    )
    .all(postId, postId) as PublishResultRow[];

  const failedPlatforms = latestRows
    .filter((row) => row.status === 'failed')
    .map((row) => row.platform);

  return failedPlatforms;
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

  if (run.status !== 'approved' && run.status !== 'failed' && run.status !== 'published') {
    return NextResponse.json(
      { error: `Cannot publish run with status "${run.status}". Only approved, failed, or published runs can be republished.` },
      { status: 400 },
    );
  }

  if (!run.post_id) {
    return NextResponse.json(
      { error: 'Run has no associated post. Approve the run first.' },
      { status: 400 },
    );
  }

  const requestBody = await request.json().catch(() => ({}));
  const requestedPlatforms = Array.isArray(requestBody?.platforms)
    ? requestBody.platforms.filter((platform: unknown): platform is PlatformType =>
        platform === 'youtube' || platform === 'instagram' || platform === 'facebook'
      )
    : [];

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(run.post_id) as Post | undefined;
  if (!post) {
    return NextResponse.json({ error: 'Associated post not found' }, { status: 404 });
  }

  if (post.status === 'failed' || post.status === 'published') {
    db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?')
      .run('approved', new Date().toISOString(), post.id);
    post.status = 'approved' as never;
  }
  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return NextResponse.json(
      { error: `Post status is "${post.status}". Only approved or scheduled posts can be published.` },
      { status: 400 },
    );
  }

  const parsed = parsePost(post);
  const targetPlatforms = run.status === 'approved'
    ? parsed.platforms
    : getRetryPlatforms(post.id, requestedPlatforms);

  if (targetPlatforms.length === 0) {
    return NextResponse.json(
      { error: 'No failed platforms to retry for this run.' },
      { status: 400 },
    );
  }

  const placeholders = targetPlatforms.map(() => '?').join(', ');
  const platformRows = db.prepare(
    `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`,
  ).all(post.tenant_id, ...targetPlatforms) as Platform[];

  if (platformRows.length === 0) {
    return NextResponse.json(
      { error: 'No enabled platforms found for this tenant' },
      { status: 400 },
    );
  }

  for (const p of platformRows) {
    try {
      await ensureFreshToken(p, decrypt, encrypt);
    } catch (err) {
      console.error(`[Publish] Token refresh failed for ${p.type}:`, err);
    }
  }

  const freshPlatforms = db.prepare(
    `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`,
  ).all(post.tenant_id, ...targetPlatforms) as Platform[];

  const host = request.headers.get('host') ?? 'localhost:3000';
  const proto = request.headers.get('x-forwarded-proto') ?? 'http';
  const mediaBaseUrl = `${proto}://${host}/api/media`;

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
  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('publishing', now, post.id);
  db.prepare('UPDATE pipeline_runs SET status = ?, updated_at = ? WHERE id = ?').run('publishing', now, runId);

  const scopedPost: PostParsed = {
    ...parsed,
    platforms: targetPlatforms,
  };

  const results = await publishPost(scopedPost, platformConfigs);

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

  const latestRows = db
    .prepare(
      `SELECT pr.platform, pr.status
       FROM publish_results pr
       WHERE pr.post_id = ?
         AND pr.id IN (
           SELECT MAX(inner_pr.id)
           FROM publish_results inner_pr
           WHERE inner_pr.post_id = ?
           GROUP BY inner_pr.platform
         )`
    )
    .all(post.id, post.id) as Array<{ platform: PlatformType; status: 'success' | 'failed' }>;

  const allLatestFailed = latestRows.length > 0 && latestRows.every((row) => row.status === 'failed');
  const finalStatus = allLatestFailed ? 'failed' : 'published';

  db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run(finalStatus, new Date().toISOString(), post.id);
  db.prepare('UPDATE pipeline_runs SET status = ?, updated_at = ? WHERE id = ?').run(finalStatus, new Date().toISOString(), runId);

  const updatedRun = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId);
  const updatedPost = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);

  return NextResponse.json({
    data: {
      run: updatedRun,
      post: updatedPost,
      results,
      retried_platforms: targetPlatforms,
    },
  });
}
