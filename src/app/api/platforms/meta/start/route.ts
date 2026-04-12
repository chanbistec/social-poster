import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { encodeMetaState, resolveMetaAppCredentials } from "@/lib/meta-oauth";
import type { PlatformType } from "@/lib/types";

const META_TYPES: Extract<PlatformType, "facebook" | "instagram">[] = [
  "facebook",
  "instagram",
];

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const user = await auth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const type = req.nextUrl.searchParams.get("type") as PlatformType | null;

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  if (!type || !META_TYPES.includes(type as Extract<PlatformType, "facebook" | "instagram">)) {
    return NextResponse.json(
      { error: "type must be facebook or instagram" },
      { status: 400 }
    );
  }

  const tenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { app_id } = resolveMetaAppCredentials();
  const redirectUri = new URL("/api/platforms/meta/callback", req.nextUrl.origin).toString();
  const returnTo = new URL(`/tenants/${tenantId}`, req.nextUrl.origin).toString();
  const nonce = randomUUID();
  const encodedState = encodeMetaState({
    nonce,
    tenantId,
    platformType: type as Extract<PlatformType, "facebook" | "instagram">,
    returnTo,
  });

  const scopes = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
  ];

  const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authUrl.searchParams.set("client_id", app_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", nonce);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(","));

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("sp_meta_oauth", encodedState, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
