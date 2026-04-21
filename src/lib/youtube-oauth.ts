import fs from "fs";
import path from "path";
import { google } from "googleapis";
import db from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import type { Platform } from "@/lib/types";

const GOOGLE_CREDENTIALS_PATH = path.join(
  process.env.HOME || "/root",
  ".openclaw",
  "credentials",
  "google-client.json"
);

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
];

export interface YouTubeAppCredentials {
  client_id: string;
  client_secret: string;
}

export interface YouTubeOAuthState {
  nonce: string;
  tenantId: string;
  returnTo: string;
}

export function resolveYouTubeAppCredentials(
  creds?: Partial<YouTubeAppCredentials> | null
): YouTubeAppCredentials {
  if (creds?.client_id && creds.client_secret) {
    return { client_id: creds.client_id, client_secret: creds.client_secret };
  }

  if (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET) {
    return {
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    };
  }

  try {
    const raw = fs.readFileSync(GOOGLE_CREDENTIALS_PATH, "utf-8");
    const file = JSON.parse(raw) as {
      installed?: Partial<YouTubeAppCredentials>;
      web?: Partial<YouTubeAppCredentials>;
    };
    const source = file.installed ?? file.web;
    if (source?.client_id && source.client_secret) {
      return { client_id: source.client_id, client_secret: source.client_secret };
    }
  } catch {
    // fall through
  }

  throw new Error(
    `YouTube client credentials not found in platform credentials, env, or ${GOOGLE_CREDENTIALS_PATH}`
  );
}

export function encodeYouTubeState(state: YouTubeOAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeYouTubeState(value?: string | null): YouTubeOAuthState | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as YouTubeOAuthState;
  } catch {
    return null;
  }
}

export function createYouTubeOAuthClient(credentials: YouTubeAppCredentials, redirectUri: string) {
  return new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
}

export function buildYouTubeAuthUrl(params: {
  credentials: YouTubeAppCredentials;
  redirectUri: string;
  state: string;
}) {
  const client = createYouTubeOAuthClient(params.credentials, params.redirectUri);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
    state: params.state,
    include_granted_scopes: true,
  });
}

export async function exchangeYouTubeCode(params: {
  credentials: YouTubeAppCredentials;
  redirectUri: string;
  code: string;
}) {
  const client = createYouTubeOAuthClient(params.credentials, params.redirectUri);
  const { tokens } = await client.getToken(params.code);
  if (!tokens.access_token) {
    throw new Error("YouTube authorization returned no access token");
  }
  if (!tokens.refresh_token) {
    throw new Error("YouTube authorization returned no refresh token. Reconnect again and grant consent.");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: typeof tokens.expiry_date === "number" ? tokens.expiry_date : null,
    scope: typeof tokens.scope === "string" ? tokens.scope : null,
    token_type: typeof tokens.token_type === "string" ? tokens.token_type : null,
  };
}

export async function fetchYouTubeChannelSummary(params: {
  credentials: YouTubeAppCredentials;
  accessToken: string;
  refreshToken: string;
}) {
  const client = createYouTubeOAuthClient(params.credentials, "postmessage");
  client.setCredentials({
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
  });

  const youtube = google.youtube({ version: "v3", auth: client });
  const response = await youtube.channels.list({ part: ["id", "snippet"], mine: true, maxResults: 1 });
  const channel = response.data.items?.[0];
  if (!channel?.id) {
    throw new Error("No YouTube channel was found for this Google account");
  }

  return {
    channel_id: channel.id,
    channel_title: channel.snippet?.title ?? null,
  };
}

export function upsertYouTubePlatform(params: {
  tenantId: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown> | null;
  tokenExpiresAt: string | null;
}) {
  const encryptedCreds = encrypt(JSON.stringify(params.credentials));
  const configJson = params.config ? JSON.stringify(params.config) : null;

  const existing = db
    .prepare("SELECT * FROM platforms WHERE tenant_id = ? AND type = 'youtube' ORDER BY id LIMIT 1")
    .get(params.tenantId) as Platform | undefined;

  if (existing) {
    db.prepare(
      "UPDATE platforms SET credentials = ?, config = COALESCE(?, config), token_expires_at = ?, enabled = 1 WHERE id = ?"
    ).run(encryptedCreds, configJson, params.tokenExpiresAt, existing.id);

    return db.prepare("SELECT * FROM platforms WHERE id = ?").get(existing.id) as Platform;
  }

  const result = db
    .prepare(
      "INSERT INTO platforms (tenant_id, type, credentials, config, token_expires_at, enabled) VALUES (?, 'youtube', ?, ?, ?, 1)"
    )
    .run(params.tenantId, encryptedCreds, configJson, params.tokenExpiresAt);

  return db.prepare("SELECT * FROM platforms WHERE id = ?").get(result.lastInsertRowid) as Platform;
}
