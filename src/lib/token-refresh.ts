/**
 * Token Refresh Service
 *
 * Handles automatic token refresh for all supported platforms:
 * - YouTube: OAuth2 refresh_token → new access_token (hourly)
 * - Instagram/Facebook: Meta token exchange (short→long-lived, 60-day refresh)
 */

import { google } from 'googleapis';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

// ── Types ──

interface YouTubeCredentials {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
  [key: string]: unknown;
}

interface MetaCredentials {
  page_token: string;
  page_id?: string;
  app_id?: string;
  app_secret?: string;
  [key: string]: unknown;
}

interface MetaAppCredentials {
  app_id: string;
  app_secret: string;
}

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in: number;
}

interface PlatformRow {
  id: number;
  type: string;
  tenant_id: string;
  credentials: string;
  token_expires_at: string | null;
}

// ── YouTube Token Refresh ──

/**
 * Refresh a YouTube OAuth2 access_token using the stored refresh_token.
 * Returns a new access_token and its expiry time (~1 hour from now).
 */
export async function refreshYouTubeToken(credentials: {
  access_token: string;
  refresh_token: string;
  client_id: string;
  client_secret: string;
}): Promise<{ access_token: string; expires_at: string }> {
  const oauth2 = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
  );
  oauth2.setCredentials({ refresh_token: credentials.refresh_token });

  const { token } = await oauth2.getAccessToken();
  if (!token) {
    throw new Error('YouTube token refresh failed — no token returned');
  }

  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return { access_token: token, expires_at: expiresAt };
}

// ── Meta Token Exchange (Short → Long-lived) ──

/**
 * Exchange a short-lived Meta token (~1h) for a long-lived one (~60 days).
 */
export async function exchangeMetaToken(
  shortToken: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as MetaTokenResponse;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

// ── Meta Long-lived Token Refresh ──

/**
 * Refresh a long-lived Meta token for another ~60 days.
 * The token must not have expired yet.
 */
export async function refreshMetaLongLivedToken(
  token: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  // Same endpoint works for refreshing existing long-lived tokens
  return exchangeMetaToken(token, appId, appSecret);
}

// ── Helpers ──

const META_CREDENTIALS_PATH = path.join(
  process.env.HOME || '/root',
  '.openclaw',
  'credentials',
  'meta-credentials.json',
);

/**
 * Resolve Meta app credentials from platform credentials or fallback file.
 */
function resolveMetaAppCredentials(
  creds: MetaCredentials,
): MetaAppCredentials {
  if (creds.app_id && creds.app_secret) {
    return { app_id: creds.app_id, app_secret: creds.app_secret };
  }

  // Fallback: load from credentials file
  try {
    const raw = fs.readFileSync(META_CREDENTIALS_PATH, 'utf-8');
    const file = JSON.parse(raw) as MetaAppCredentials;
    if (file.app_id && file.app_secret) {
      return file;
    }
  } catch {
    // File missing or invalid — fall through
  }

  throw new Error(
    'Meta app_id/app_secret not found in platform credentials or ' +
      META_CREDENTIALS_PATH,
  );
}

function isTokenExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return true; // No expiry recorded → assume stale
  const margin = 10 * 60 * 1000; // 10 minutes
  return new Date(expiresAt).getTime() - Date.now() < margin;
}

// ── Master Refresh Function ──

/**
 * Ensure a platform has a fresh (non-expired) token.
 *
 * 1. Decrypts stored credentials
 * 2. Checks if token_expires_at is within 10 min of now (or expired)
 * 3. If stale, calls the appropriate refresh function
 * 4. Updates the platforms row with new encrypted credentials + expiry
 * 5. Returns the fresh (decrypted) credentials object
 */
export async function ensureFreshToken(
  platform: PlatformRow,
  decrypt: (s: string) => string,
  encrypt: (s: string) => string,
): Promise<Record<string, unknown>> {
  const creds = JSON.parse(decrypt(platform.credentials)) as Record<string, unknown>;

  // If token is still fresh, return as-is
  if (!isTokenExpiringSoon(platform.token_expires_at)) {
    return creds;
  }

  let updatedCreds: Record<string, unknown> = creds;
  let newExpiresAt: string;

  switch (platform.type) {
    case 'youtube': {
      const ytCreds = creds as unknown as YouTubeCredentials;
      if (!ytCreds.refresh_token) {
        throw new Error('YouTube platform missing refresh_token — manual re-auth required');
      }
      const refreshed = await refreshYouTubeToken(ytCreds);
      updatedCreds = {
        ...creds,
        access_token: refreshed.access_token,
      };
      newExpiresAt = refreshed.expires_at;
      break;
    }

    case 'instagram':
    case 'facebook': {
      const metaCreds = creds as unknown as MetaCredentials;
      const appCreds = resolveMetaAppCredentials(metaCreds);

      if (!metaCreds.page_token) {
        throw new Error(`${platform.type} platform missing page_token — manual re-auth required`);
      }

      try {
        const refreshed = await refreshMetaLongLivedToken(
          metaCreds.page_token,
          appCreds.app_id,
          appCreds.app_secret,
        );
        updatedCreds = {
          ...creds,
          page_token: refreshed.access_token,
          app_id: appCreds.app_id,
          app_secret: appCreds.app_secret,
        };
        newExpiresAt = new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString();
      } catch (err) {
        throw new Error(
          `${platform.type} token refresh failed — token may have expired, manual re-auth required: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      break;
    }

    default:
      throw new Error(`Unsupported platform type for token refresh: ${platform.type}`);
  }

  // Persist updated credentials + new expiry
  const encryptedCreds = encrypt(JSON.stringify(updatedCreds));
  db.prepare(
    'UPDATE platforms SET credentials = ?, token_expires_at = ?, updated_at = ? WHERE id = ?',
  ).run(encryptedCreds, newExpiresAt!, new Date().toISOString(), platform.id);

  return updatedCreds;
}
