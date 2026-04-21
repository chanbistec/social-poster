import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import {
  decodeYouTubeState,
  exchangeYouTubeCode,
  fetchYouTubeChannelSummary,
  resolveYouTubeAppCredentials,
  upsertYouTubePlatform,
} from "@/lib/youtube-oauth";

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

function resolveOrigin(req: NextRequest): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "");
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return req.nextUrl.origin;
}

function redirectWithStatus(baseUrl: string, status: string, message: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("platform_connect", status);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const user = await auth();
  const cookieStore = await cookies();
  const storedState = decodeYouTubeState(cookieStore.get("sp_youtube_oauth")?.value);

  const fallbackUrl = new URL("/tenants", resolveOrigin(req)).toString();
  const returnTo = storedState?.returnTo ?? fallbackUrl;

  const clearCookie = (response: NextResponse) => {
    response.cookies.set("sp_youtube_oauth", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (!user) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Please sign in again before connecting YouTube."));
  }

  if (!storedState) {
    return clearCookie(redirectWithStatus(returnTo, "error", "YouTube login session expired. Please try again."));
  }

  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return clearCookie(redirectWithStatus(returnTo, "error", `YouTube authorization failed: ${error}`));
  }

  if (!state || state !== storedState.nonce || !code) {
    return clearCookie(redirectWithStatus(returnTo, "error", "YouTube login validation failed. Please try again."));
  }

  const tenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get(storedState.tenantId);
  if (!tenant) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Tenant not found for YouTube connection."));
  }

  try {
    const credentials = resolveYouTubeAppCredentials();
    const redirectUri = new URL("/api/platforms/youtube/callback", resolveOrigin(req)).toString();
    const tokenData = await exchangeYouTubeCode({ credentials, redirectUri, code });
    const channel = await fetchYouTubeChannelSummary({
      credentials,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    });

    upsertYouTubePlatform({
      tenantId: storedState.tenantId,
      credentials: {
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
      },
      config: {
        channel_id: channel.channel_id,
        channel_title: channel.channel_title,
      },
      tokenExpiresAt: tokenData.expiry_date ? new Date(tokenData.expiry_date).toISOString() : null,
    });

    return clearCookie(
      redirectWithStatus(
        returnTo,
        "success",
        `YouTube connected for ${channel.channel_title || channel.channel_id}.`
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube connection failed.";
    return clearCookie(redirectWithStatus(returnTo, "error", message));
  }
}
