import { db } from "./db";
import { hashPassword } from "./auth";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";

export async function ensureAdminUser(): Promise<void> {
  const row = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
    count: number;
  };

  if (row.count === 0) {
    const hash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(DEFAULT_ADMIN_USERNAME, hash, "admin", now, now);

    console.warn(
      "\n⚠️  Created default admin user (admin/admin). CHANGE THIS PASSWORD IMMEDIATELY!\n"
    );
  }
}
