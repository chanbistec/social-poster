import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

function toSqliteDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function buildScheduledAt(post: Post, targetDate: string): Date {
  const source = post.scheduled_at ? new Date(post.scheduled_at) : null;
  const base = new Date(`${targetDate}T09:00:00.000Z`);

  if (Number.isNaN(base.getTime())) {
    throw new Error('Invalid target_date format. Expected yyyy-MM-dd.');
  }

  if (source && !Number.isNaN(source.getTime())) {
    base.setUTCHours(
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    );
  }

  const now = new Date();
  const sameUtcDay =
    base.getUTCFullYear() === now.getUTCFullYear() &&
    base.getUTCMonth() === now.getUTCMonth() &&
    base.getUTCDate() === now.getUTCDate();

  if (sameUtcDay && base.getTime() <= now.getTime()) {
    base.setTime(now.getTime() + 15 * 60 * 1000);
  }

  return base;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  if (post.status !== 'approved' && post.status !== 'scheduled') {
    return NextResponse.json(
      {
        error: `Cannot reschedule post with status "${post.status}". Only approved or scheduled posts can be moved.`,
      },
      { status: 400 },
    );
  }

  let body: { target_date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.target_date) {
    return NextResponse.json({ error: 'target_date is required' }, { status: 400 });
  }

  let scheduledDate: Date;
  try {
    scheduledDate = buildScheduledAt(post, body.target_date);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid target date' },
      { status: 400 },
    );
  }

  if (scheduledDate.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Posts can only be moved to a future date/time.' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE posts SET status = ?, scheduled_at = ?, updated_at = ? WHERE id = ?').run(
    'scheduled',
    toSqliteDateTime(scheduledDate),
    now,
    id,
  );

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post;
  return NextResponse.json({ data: updated });
}
