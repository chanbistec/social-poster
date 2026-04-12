import fs from "fs";
import path from "path";
import db from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Platform, PlatformType } from "@/lib/types";

const META_GRAPH_API = "https://graph.facebook.com/v21.0";
const META_CREDENTIALS_PATH = path.join(
  process.env.HOME || "/root",
  ".openclaw",
  "credentials",
  "meta-credentials.json"
);

export interface MetaAppCredentials {
  app_id: string;
  app_secret: string;
}

export interface MetaOAuthState {
  nonce: string;
  tenantId: string;
  platformType: Extract<PlatformType, "facebook" | "instagram">;
  returnTo: string;
}

export interface MetaPageAccount {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  } | null;
}

export function resolveMetaAppCredentials(
  creds?: Partial<MetaAppCredentials> | null
): MetaAppCredentials {
  if (creds?.app_id && creds.app_secret) {
    return { app_id: creds.app_id, app_secret: creds.app_secret };
  }

  try {
    const raw = fs.readFileSync(META_CREDENTIALS_PATH, "utf-8");
    const file = JSON.parse(raw) as Partial<MetaAppCredentials>;
    if (file.app_id && file.app_secret) {
      return { app_id: file.app_id, app_secret: file.app_secret };
    }
  } catch {
    // fall through
  }

  throw new Error(
    `Meta app_id/app_secret not found in platform credentials or ${META_CREDENTIALS_PATH}`
  );
}

export function encodeMetaState(state: MetaOAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeMetaState(value?: string | null): MetaOAuthState | null {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as MetaOAuthState;
  } catch {
    return null;
  }
}

export async function exchangeMetaCodeForShortLivedToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string
): Promise<{ access_token: string; expires_in?: number }> {
  const url = new URL(`${META_GRAPH_API}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Meta code exchange failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Meta code exchange returned no access token");
  }

  return data;
}

export async function fetchMetaPages(userToken: string): Promise<MetaPageAccount[]> {
  const url = new URL(`${META_GRAPH_API}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}"
  );
  url.searchParams.set("access_token", userToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Meta pages lookup failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { data?: MetaPageAccount[] };
  return Array.isArray(data.data) ? data.data : [];
}

export function pickMetaAccount(
  pages: MetaPageAccount[],
  platformType: Extract<PlatformType, "facebook" | "instagram">
): MetaPageAccount {
  if (platformType === "instagram") {
    const igPage = pages.find((page) => page.instagram_business_account?.id);
    if (!igPage) {
      throw new Error(
        "No Facebook page with a connected Instagram business account was found for this Meta login"
      );
    }
    return igPage;
  }

  const firstPage = pages[0];
  if (!firstPage) {
    throw new Error("No Facebook pages were found for this Meta login");
  }
  return firstPage;
}

export function buildMetaPlatformCredentials(params: {
  platformType: Extract<PlatformType, "facebook" | "instagram">;
  page: MetaPageAccount;
  appCredentials: MetaAppCredentials;
  longLivedUserToken: string;
}): Record<string, unknown> {
  const base = {
    page_token: params.page.access_token,
    page_id: params.page.id,
    page_name: params.page.name,
    app_id: params.appCredentials.app_id,
    app_secret: params.appCredentials.app_secret,
    user_token: params.longLivedUserToken,
  } as Record<string, unknown>;

  if (params.platformType === "instagram") {
    return {
      ...base,
      ig_account_id: params.page.instagram_business_account?.id,
      instagram_business_account_id: params.page.instagram_business_account?.id,
      instagram_username: params.page.instagram_business_account?.username,
    };
  }

  return base;
}

export function upsertMetaPlatform(params: {
  tenantId: string;
  platformType: Extract<PlatformType, "facebook" | "instagram">;
  credentials: Record<string, unknown>;
  tokenExpiresAt: string | null;
}) {
  const now = new Date().toISOString();
  const encryptedCreds = encrypt(JSON.stringify(params.credentials));

  const existing = db
    .prepare("SELECT * FROM platforms WHERE tenant_id = ? AND type = ? ORDER BY id LIMIT 1")
    .get(params.tenantId, params.platformType) as Platform | undefined;

  if (existing) {
    db.prepare(
      "UPDATE platforms SET credentials = ?, token_expires_at = ?, enabled = 1 WHERE id = ?"
    ).run(encryptedCreds, params.tokenExpiresAt, existing.id);

    return db.prepare("SELECT * FROM platforms WHERE id = ?").get(existing.id) as Platform;
  }

  const result = db
    .prepare(
      "INSERT INTO platforms (tenant_id, type, credentials, config, token_expires_at, enabled) VALUES (?, ?, ?, ?, ?, 1)"
    )
    .run(params.tenantId, params.platformType, encryptedCreds, null, params.tokenExpiresAt);

  return db.prepare("SELECT * FROM platforms WHERE id = ?").get(result.lastInsertRowid) as Platform;
}

export function readPlatformCredentials(platform: Platform): Record<string, unknown> {
  return JSON.parse(decrypt(platform.credentials)) as Record<string, unknown>;
}
