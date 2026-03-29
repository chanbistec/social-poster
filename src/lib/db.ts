import Database from 'better-sqlite3';
import path from 'path';
import { runMigrations } from '../../scripts/migrate';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'social-poster.db');

// Singleton instance — auto-migrates on first import
const db: Database.Database = new Database(dbPath);
runMigrations(db);

export default db;
