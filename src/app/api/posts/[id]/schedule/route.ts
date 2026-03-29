import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

// POST /api/posts/[id]/schedule — approved → scheduled
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'approved') {
    return NextResponse.json(
      { error: `Cannot schedule post with status "${post.status}". Only approved posts can be scheduled.` },
      { status: 400 },
    );
  }

  let body: { scheduled_at: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.scheduled_at) {
    return NextResponse.json({ error: 'scheduled_at is required' }, { status: 400 });
  }

  // Validate the date
  const scheduledDate = new Date(body.scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled_at date format' }, { status: 400 });
  }

  if (scheduledDate.getTime() < Date.now()) {
    return NextResponse.json({ error: 'scheduled_at must be in the future' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE posts SET status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?')
    .run('scheduled', scheduledDate.toISOString(), now, id);

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;

  return NextResponse.json({ data: updated });
}
