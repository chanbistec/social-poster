/**
 * Database migration runner.
 * Called by db.ts on first import, or directly via `npm run migrate`.
 */
import Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'viewer',
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      logo_path   TEXT,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS platforms (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id        TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type             TEXT    NOT NULL CHECK (type IN ('youtube', 'instagram', 'facebook')),
      credentials      TEXT    NOT NULL,
      config           TEXT,
      token_expires_at TEXT,
      enabled          INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id    TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'draft',
      caption      TEXT,
      hashtags     TEXT    NOT NULL DEFAULT '[]',
      media_paths  TEXT    NOT NULL DEFAULT '[]',
      platforms    TEXT    NOT NULL DEFAULT '[]',
      scheduled_at TEXT,
      approved_at  TEXT,
      approved_by  TEXT,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS publish_results (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      platform     TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending',
      external_id  TEXT,
      external_url TEXT,
      error        TEXT,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pipeline_templates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id     TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      description   TEXT,
      type          TEXT    NOT NULL CHECK (type IN ('reel', 'short', 'social_image', 'custom')),
      platforms     TEXT    NOT NULL DEFAULT '[]',
      steps         TEXT    NOT NULL DEFAULT '[]',
      branding      TEXT    NOT NULL DEFAULT '{}',
      tts_config    TEXT,
      imagen_config TEXT,
      video_config  TEXT,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id   INTEGER NOT NULL REFERENCES pipeline_templates(id) ON DELETE CASCADE,
      post_id       INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      input_params  TEXT    NOT NULL DEFAULT '{}',
      step_results  TEXT,
      output_paths  TEXT,
      error         TEXT,
      started_at    TEXT,
      completed_at  TEXT,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_branding (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id   TEXT    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
      logo_path   TEXT,
      colors      TEXT    NOT NULL DEFAULT '{}',
      fonts       TEXT    NOT NULL DEFAULT '{}',
      intro_frame TEXT,
      outro_frame TEXT,
      watermark   TEXT,
      bgm_path    TEXT,
      backgrounds TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_platforms_tenant ON platforms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_posts_tenant     ON posts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled  ON posts(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_publish_post     ON publish_results(post_id);

    -- Pipeline indexes
    CREATE INDEX IF NOT EXISTS idx_pipeline_templates_tenant ON pipeline_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_template    ON pipeline_runs(template_id);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status      ON pipeline_runs(status);
    CREATE INDEX IF NOT EXISTS idx_tenant_branding_tenant    ON tenant_branding(tenant_id);
  `);
}

// Allow running directly: npx tsx scripts/migrate.ts
if (require.main === module) {
  const path = require('path');
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'social-poster.db');
  const db = new Database(dbPath);
  runMigrations(db);
  console.log(`✅ Migrations applied to ${dbPath}`);
  db.close();
}
