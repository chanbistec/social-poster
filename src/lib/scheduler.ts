import * as cron from 'node-cron';
import db from './db';
import { decrypt } from './crypto';
import { publishPost, type PlatformConfig } from './publishers/index';
import type { Post, PostParsed, Platform, PlatformType } from './types';

const MAX_RETRIES = 3;
const CRON_EXPRESSION = '* * * * *'; // every minute

/**
 * Singleton post scheduler.
 * Runs a cron job every minute to find and publish due posts.
 */
export class PostScheduler {
  private task: cron.ScheduledTask | null = null;
  private processing = new Set<number>();
  private retryMap = new Map<number, { count: number; nextAttempt: number }>();
  private _running = false;

  get running(): boolean {
    return this._running;
  }

  start(): void {
    if (this.task) return;

    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.processDuePosts().catch((err) => {
        console.error('[Scheduler] Unhandled error in processDuePosts:', err);
      });
    });

    this._running = true;
    console.log('[Scheduler] Started — checking every minute');
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this._running = false;
    console.log('[Scheduler] Stopped');
  }

  /** Count of posts currently being published */
  get processingCount(): number {
    return this.processing.size;
  }

  /** Number of pending scheduled posts (due now or in future) */
  getPendingCount(): number {
    try {
      const row = db
        .prepare(`SELECT COUNT(*) as cnt FROM posts WHERE status = 'scheduled'`)
        .get() as { cnt: number } | undefined;
      return row?.cnt ?? 0;
    } catch (err) {
      console.error('[Scheduler] Error counting pending posts:', err);
      return 0;
    }
  }

  // ── Core loop ──

  async processDuePosts(): Promise<void> {
    let duePosts: Post[];
    try {
      duePosts = db
        .prepare(
          `SELECT * FROM posts
           WHERE status = 'scheduled'
             AND scheduled_at <= datetime('now')
           ORDER BY scheduled_at ASC`
        )
        .all() as Post[];
    } catch (err) {
      console.error('[Scheduler] Error querying due posts:', err);
      return;
    }

    if (duePosts.length === 0) return;

    console.log(`[Scheduler] Found ${duePosts.length} due post(s)`);

    for (const post of duePosts) {
      // Skip if already being processed
      if (this.processing.has(post.id)) {
        console.log(`[Scheduler] Post ${post.id} already processing, skipping`);
        continue;
      }

      // Check retry backoff
      const retry = this.retryMap.get(post.id);
      if (retry && Date.now() < retry.nextAttempt) {
        continue; // not time yet
      }

      // Fire-and-forget per post (but tracked via processing set)
      this.processPost(post).catch((err) => {
        console.error(`[Scheduler] Unhandled error processing post ${post.id}:`, err);
        this.processing.delete(post.id);
      });
    }
  }

  private async processPost(post: Post): Promise<void> {
    this.processing.add(post.id);

    try {
      // Mark as publishing
      db.prepare(`UPDATE posts SET status = 'publishing', updated_at = datetime('now') WHERE id = ?`).run(
        post.id
      );

      // Parse the post
      const parsed: PostParsed = {
        ...post,
        hashtags: safeJsonParse<string[]>(post.hashtags, []),
        media_paths: safeJsonParse<string[]>(post.media_paths, []),
        platforms: safeJsonParse<PlatformType[]>(post.platforms, []),
      };

      // Get platform configs for this tenant
      const platformConfigs = this.getPlatformConfigs(parsed.tenant_id, parsed.platforms);
      if (platformConfigs.length === 0) {
        console.warn(`[Scheduler] Post ${post.id}: no enabled platform configs found`);
        db.prepare(`UPDATE posts SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
          post.id
        );
        this.retryMap.delete(post.id);
        return;
      }

      // Publish
      console.log(
        `[Scheduler] Publishing post ${post.id} to ${platformConfigs.map((p) => p.platform).join(', ')}`
      );
      const results = await publishPost(parsed, platformConfigs);

      // Save publish_results
      const insertResult = db.prepare(
        `INSERT INTO publish_results (post_id, platform, status, external_id, external_url, error, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      const saveResults = db.transaction(() => {
        for (const r of results) {
          insertResult.run(
            post.id,
            r.platform,
            r.success ? 'success' : 'failed',
            r.external_id ?? null,
            r.external_url ?? null,
            r.error ?? null,
            r.success ? new Date().toISOString() : null
          );
        }
      });
      saveResults();

      // Determine outcome
      const allSuccess = results.every((r) => r.success);
      const anySuccess = results.some((r) => r.success);
      const allFailed = results.every((r) => !r.success);

      if (allSuccess) {
        db.prepare(`UPDATE posts SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(
          post.id
        );
        console.log(`[Scheduler] Post ${post.id} published successfully`);
        this.retryMap.delete(post.id);
      } else if (anySuccess) {
        // Partial success — mark as published, failures are tracked in publish_results
        db.prepare(`UPDATE posts SET status = 'published', updated_at = datetime('now') WHERE id = ?`).run(
          post.id
        );
        const failed = results.filter((r) => !r.success).map((r) => r.platform);
        console.log(
          `[Scheduler] Post ${post.id} partially published. Failed platforms: ${failed.join(', ')}`
        );
        this.retryMap.delete(post.id);
      } else if (allFailed) {
        // All failed — retry logic
        const retryCount = this.getRetryCount(post.id);
        const newCount = retryCount + 1;

        if (newCount >= MAX_RETRIES) {
          db.prepare(`UPDATE posts SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
            post.id
          );
          console.error(
            `[Scheduler] Post ${post.id} failed after ${MAX_RETRIES} retries. Errors: ${results.map((r) => r.error).join('; ')}`
          );
          this.retryMap.delete(post.id);
        } else {
          // Exponential backoff: 1min, 2min, 4min...
          const backoffMs = Math.pow(2, newCount - 1) * 60_000;
          this.retryMap.set(post.id, {
            count: newCount,
            nextAttempt: Date.now() + backoffMs,
          });

          // Set back to scheduled so it gets picked up again
          db.prepare(
            `UPDATE posts SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?`
          ).run(post.id);

          console.warn(
            `[Scheduler] Post ${post.id} failed (attempt ${newCount}/${MAX_RETRIES}), retrying in ${backoffMs / 1000}s`
          );
        }
      }
    } catch (err) {
      console.error(`[Scheduler] Error processing post ${post.id}:`, err);
      try {
        // On unexpected error, apply retry logic too
        const retryCount = this.getRetryCount(post.id);
        const newCount = retryCount + 1;

        if (newCount >= MAX_RETRIES) {
          db.prepare(`UPDATE posts SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(
            post.id
          );
          this.retryMap.delete(post.id);
        } else {
          const backoffMs = Math.pow(2, newCount - 1) * 60_000;
          this.retryMap.set(post.id, { count: newCount, nextAttempt: Date.now() + backoffMs });
          db.prepare(
            `UPDATE posts SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?`
          ).run(post.id);
        }
      } catch {
        // Last resort — don't crash
      }
    } finally {
      this.processing.delete(post.id);
    }
  }

  // ── Helpers ──

  private getRetryCount(postId: number): number {
    // Check in-memory retry map first
    const memRetry = this.retryMap.get(postId);
    if (memRetry) return memRetry.count;

    // Fall back to checking post metadata in DB (if stored as JSON)
    try {
      const row = db
        .prepare(`SELECT metadata FROM posts WHERE id = ?`)
        .get(postId) as { metadata?: string } | undefined;
      if (row?.metadata) {
        const meta = JSON.parse(row.metadata);
        if (typeof meta.retry_count === 'number') return meta.retry_count;
      }
    } catch {
      // metadata column may not exist — that's fine
    }

    return 0;
  }

  private getPlatformConfigs(tenantId: string, platformTypes: PlatformType[]): PlatformConfig[] {
    const configs: PlatformConfig[] = [];

    for (const pType of platformTypes) {
      try {
        const platform = db
          .prepare(
            `SELECT * FROM platforms WHERE tenant_id = ? AND type = ? AND enabled = 1`
          )
          .get(tenantId, pType) as Platform | undefined;

        if (!platform) {
          console.warn(`[Scheduler] No enabled ${pType} platform for tenant ${tenantId}`);
          continue;
        }

        const credentials = JSON.parse(decrypt(platform.credentials));
        const config = platform.config ? JSON.parse(platform.config) : {};

        configs.push({
          platform: pType,
          credentials,
          privacy: config.privacy,
          media_base_url: config.media_base_url,
        });
      } catch (err) {
        console.error(
          `[Scheduler] Error loading ${pType} config for tenant ${tenantId}:`,
          err
        );
      }
    }

    return configs;
  }
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Export singleton — auto-starts
export const scheduler = new PostScheduler();
scheduler.start();
