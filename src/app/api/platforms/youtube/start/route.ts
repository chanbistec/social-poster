import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import {
  buildYouTubeAuthUrl,
  encodeYouTubeState,
  resolveYouTubeAppCredentials,
} from "@/lib/youtube-oauth";

function resolveOrigin(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "");
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return req.nextUrl.origin;
}

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
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  const tenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get(tenantId);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const credentials = resolveYouTubeAppCredentials();
  const origin = resolveOrigin(req);
  const redirectUri = new URL("/api/platforms/youtube/callback", origin).toString();
  const returnTo = new URL(`/tenants/${tenantId}`, origin).toString();
  const nonce = randomUUID();
  const encodedState = encodeYouTubeState({ nonce, tenantId, returnTo });
  const authUrl = buildYouTubeAuthUrl({ credentials, redirectUri, state: nonce });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("sp_youtube_oauth", encodedState, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
