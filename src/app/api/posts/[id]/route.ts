import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post, PublishResult } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// GET /api/posts/[id] — get post with publish results
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const publishResults = db.prepare(
    'SELECT * FROM publish_results WHERE post_id = ? ORDER BY published_at DESC'
  ).all(post.id) as PublishResult[];

  return NextResponse.json({ data: { ...post, publish_results: publishResults } });
}

// PUT /api/posts/[id] — update a draft post
export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot edit post with status "${post.status}". Only drafts can be edited.` },
      { status: 400 },
    );
  }

  let body: {
    caption?: string;
    hashtags?: string[];
    media_paths?: string[];
    platforms?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE posts
    SET caption = COALESCE(?, caption),
        hashtags = COALESCE(?, hashtags),
        media_paths = COALESCE(?, media_paths),
        platforms = COALESCE(?, platforms),
        updated_at = ?
    WHERE id = ?
  `).run(
    body.caption !== undefined ? body.caption : null,
    body.hashtags !== undefined ? JSON.stringify(body.hashtags) : null,
    body.media_paths !== undefined ? JSON.stringify(body.media_paths) : null,
    body.platforms !== undefined ? JSON.stringify(body.platforms) : null,
    now,
    id,
  );

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;

  return NextResponse.json({ data: updated });
}

// DELETE /api/posts/[id]
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status === 'publishing') {
    return NextResponse.json(
      { error: 'Cannot delete a post that is currently publishing' },
      { status: 400 },
    );
  }

  // Delete related publish results first
  db.prepare('DELETE FROM publish_results WHERE post_id = ?').run(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);

  return NextResponse.json({ data: { deleted: true } });
}
