import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { getAuth } from "@/lib/route-auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { ensureFreshToken } from "@/lib/token-refresh";
import { publishPost, type PlatformConfig } from "@/lib/publishers/index";
import type { Platform, PlatformType, Post, PostParsed } from "@/lib/types";

type RetryCandidate = {
  id: number;
  tenant_id: string;
  hashtags: string;
  media_paths: string;
  platforms: string;
};

type LatestFailedPlatformRow = { platform: PlatformType };

function parsePost(post: Post): PostParsed {
  return {
    ...post,
    hashtags: JSON.parse(post.hashtags) as string[],
    media_paths: JSON.parse(post.media_paths) as string[],
    platforms: JSON.parse(post.platforms) as PlatformType[],
  };
}

function getLatestFailedPlatforms(postId: number) {
  return db.prepare(`
    SELECT latest.platform
    FROM publish_results latest
    WHERE latest.post_id = ?
      AND latest.id IN (
        SELECT MAX(inner_pr.id)
        FROM publish_results inner_pr
        WHERE inner_pr.post_id = ?
        GROUP BY inner_pr.platform
      )
      AND latest.status = 'failed'
  `).all(postId, postId) as LatestFailedPlatformRow[];
}

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const tenantId = typeof body?.tenant_id === "string" && body.tenant_id ? body.tenant_id : null;

  const candidates = db.prepare(`
    SELECT p.*
    FROM posts p
    WHERE p.status IN ('failed', 'published')
      ${tenantId ? "AND p.tenant_id = ?" : ""}
      AND EXISTS (
        SELECT 1
        FROM publish_results latest
        WHERE latest.post_id = p.id
          AND latest.id IN (
            SELECT MAX(inner_pr.id)
            FROM publish_results inner_pr
            WHERE inner_pr.post_id = p.id
            GROUP BY inner_pr.platform
          )
          AND latest.status = 'failed'
      )
    ORDER BY p.updated_at DESC
  `).all(...(tenantId ? [tenantId] : [])) as RetryCandidate[];

  if (candidates.length === 0) {
    return NextResponse.json({ data: { processed: 0, skipped: 0 } });
  }

  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const mediaBaseUrl = `${proto}://${host}/api/media`;

  let processed = 0;
  let skipped = 0;

  for (const row of candidates) {
    const post = row as unknown as Post;
    const parsed = parsePost(post);
    const targetPlatforms = getLatestFailedPlatforms(post.id).map((item) => item.platform);
    if (targetPlatforms.length === 0) {
      skipped += 1;
      continue;
    }

    const placeholders = targetPlatforms.map(() => "?").join(", ");
    const platformRows = db.prepare(
      `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`
    ).all(post.tenant_id, ...targetPlatforms) as Platform[];

    if (platformRows.length === 0) {
      skipped += 1;
      continue;
    }

    for (const platform of platformRows) {
      try {
        await ensureFreshToken(platform, decrypt, encrypt);
      } catch (error) {
        console.error(`[Bulk Post Retry] Token refresh failed for ${platform.type}:`, error);
      }
    }

    const freshPlatforms = db.prepare(
      `SELECT * FROM platforms WHERE tenant_id = ? AND type IN (${placeholders}) AND enabled = 1`
    ).all(post.tenant_id, ...targetPlatforms) as Platform[];

    const platformConfigs: PlatformConfig[] = freshPlatforms.map((platform) => {
      const credentials = JSON.parse(decrypt(platform.credentials)) as PlatformConfig["credentials"];
      const config = platform.config ? JSON.parse(platform.config) : {};
      return {
        platform: platform.type,
        credentials,
        privacy: config.privacy,
        media_base_url: mediaBaseUrl,
      };
    });

    db.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?").run("publishing", new Date().toISOString(), post.id);

    const results = await publishPost(
      {
        ...parsed,
        platforms: targetPlatforms,
      },
      platformConfigs
    );

    const insertResult = db.prepare(`
      INSERT INTO publish_results (post_id, platform, status, external_id, external_url, error, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const saveResults = db.transaction(() => {
      for (const result of results) {
        insertResult.run(
          post.id,
          result.platform,
          result.success ? "success" : "failed",
          result.external_id ?? null,
          result.external_url ?? null,
          result.error ?? null,
          result.success ? new Date().toISOString() : null
        );
      }
    });
    saveResults();

    const latestStatuses = db.prepare(`
      SELECT latest.status
      FROM publish_results latest
      WHERE latest.post_id = ?
        AND latest.id IN (
          SELECT MAX(inner_pr.id)
          FROM publish_results inner_pr
          WHERE inner_pr.post_id = ?
          GROUP BY inner_pr.platform
        )
    `).all(post.id, post.id) as Array<{ status: "success" | "failed" }>;

    const finalStatus = latestStatuses.length > 0 && latestStatuses.every((item) => item.status === "failed")
      ? "failed"
      : "published";

    db.prepare("UPDATE posts SET status = ?, updated_at = ? WHERE id = ?").run(finalStatus, new Date().toISOString(), post.id);
    processed += 1;
  }

  return NextResponse.json({ data: { processed, skipped } });
}
