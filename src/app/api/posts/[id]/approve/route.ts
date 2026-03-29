import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/approve — pending_approval → approved
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Cannot approve post with status "${post.status}". Only posts pending approval can be approved.` },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE posts SET status = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?')
    .run('approved', auth.username, now, now, id);

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;

  return NextResponse.json({ data: updated });
}
