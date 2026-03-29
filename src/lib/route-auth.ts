import { cookies } from 'next/headers';
import { verifyToken, type TokenPayload } from './auth';

/**
 * Extract and verify auth from sp_token cookie in route handlers.
 * Middleware already blocks unauthenticated requests, but this gives us the payload.
 */
export async function getAuth(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}
