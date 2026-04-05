import { NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuth } from "@/lib/route-auth";

export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const pipelineStuck = db.prepare(`
    SELECT COUNT(*) as count
    FROM pipeline_runs
    WHERE status IN ('generating', 'publishing')
      AND started_at IS NOT NULL
      AND datetime(replace(replace(started_at, 'T', ' '), 'Z', '')) <= datetime('now', '-15 minutes')
  `).get() as { count: number };

  const pipelineFailed = db.prepare(`
    SELECT COUNT(*) as count
    FROM pipeline_runs
    WHERE status = 'failed'
  `).get() as { count: number };

  const postStuck = db.prepare(`
    SELECT COUNT(*) as count
    FROM posts
    WHERE status = 'publishing'
      AND datetime(replace(replace(updated_at, 'T', ' '), 'Z', '')) <= datetime('now', '-15 minutes')
  `).get() as { count: number };

  const postFailed = db.prepare(`
    SELECT COUNT(*) as count
    FROM posts
    WHERE status = 'failed'
  `).get() as { count: number };

  return NextResponse.json({
    data: {
      pipeline: {
        stuck: pipelineStuck.count,
        failed: pipelineFailed.count,
      },
      posts: {
        stuck: postStuck.count,
        failed: postFailed.count,
      },
    },
  });
}
