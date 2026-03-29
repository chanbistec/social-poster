import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/reject — pending_approval → draft (with optional feedback)
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Cannot reject post with status "${post.status}". Only posts pending approval can be rejected.` },
      { status: 400 },
    );
  }

  let feedback: string | null = null;
  try {
    const body = await request.json();
    feedback = body.feedback ?? null;
  } catch {
    // No body is fine — feedback is optional
  }

  const now = new Date().toISOString();

  // Reset to draft; clear approval fields
  db.prepare(`
    UPDATE posts
    SET status = 'draft', approved_by = NULL, approved_at = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, id);

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;

  return NextResponse.json({ data: { ...updated, rejection_feedback: feedback } });
}
