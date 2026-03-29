import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SALT_ROUNDS = 10;

function getSecret(): string {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    throw new Error(
      "SERVER_SECRET environment variable is required. Set it in .env.local"
    );
  }
  return secret;
}

export interface TokenPayload {
  userId: number;
  username: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(
  userId: number,
  username: string,
  role: string
): string {
  const payload: TokenPayload = { userId, username, role };
  return jwt.sign(payload, getSecret(), { expiresIn: "24h" });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}
