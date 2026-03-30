import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';
import { runMigrations } from '../../scripts/migrate';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'social-poster.db');

// Singleton instance — auto-migrates on first import
const db: Database.Database = new Database(dbPath);
runMigrations(db);

// Auto-seed admin user if users table is empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const hash = bcrypt.hashSync('admin', 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  console.log('[DB] Auto-seeded admin user (admin/admin)');
}

export default db;
