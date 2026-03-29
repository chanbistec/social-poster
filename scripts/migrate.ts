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

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_platforms_tenant ON platforms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_posts_tenant     ON posts(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_posts_status     ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_scheduled  ON posts(scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_publish_post     ON publish_results(post_id);
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
