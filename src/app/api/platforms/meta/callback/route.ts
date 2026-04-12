import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { verifyToken } from "@/lib/auth";
import { exchangeMetaToken } from "@/lib/token-refresh";
import {
  buildMetaPlatformCredentials,
  decodeMetaState,
  exchangeMetaCodeForShortLivedToken,
  fetchMetaPages,
  pickMetaAccount,
  resolveMetaAppCredentials,
  upsertMetaPlatform,
} from "@/lib/meta-oauth";

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_token")?.value;
  if (!token) return null;
  return verifyToken(token);
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
  const storedState = decodeMetaState(cookieStore.get("sp_meta_oauth")?.value);

  const fallbackUrl = new URL("/tenants", req.nextUrl.origin).toString();
  const returnTo = storedState?.returnTo ?? fallbackUrl;

  const clearCookie = (response: NextResponse) => {
    response.cookies.set("sp_meta_oauth", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (!user) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Please sign in again before connecting Meta."));
  }

  if (!storedState) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Meta login session expired. Please try again."));
  }

  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const errorReason = req.nextUrl.searchParams.get("error_reason");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (errorReason || errorDescription) {
    return clearCookie(
      redirectWithStatus(
        returnTo,
        "error",
        errorDescription || errorReason || "Meta authorization was cancelled."
      )
    );
  }

  if (!state || state !== storedState.nonce || !code) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Meta login validation failed. Please try again."));
  }

  const tenant = db.prepare("SELECT id FROM tenants WHERE id = ?").get(storedState.tenantId);
  if (!tenant) {
    return clearCookie(redirectWithStatus(returnTo, "error", "Tenant not found for Meta connection."));
  }

  try {
    const appCredentials = resolveMetaAppCredentials();
    const redirectUri = new URL("/api/platforms/meta/callback", req.nextUrl.origin).toString();
    const shortLived = await exchangeMetaCodeForShortLivedToken(
      code,
      redirectUri,
      appCredentials.app_id,
      appCredentials.app_secret
    );
    const longLived = await exchangeMetaToken(
      shortLived.access_token,
      appCredentials.app_id,
      appCredentials.app_secret
    );
    const pages = await fetchMetaPages(longLived.access_token);
    const page = pickMetaAccount(pages, storedState.platformType);
    const credentials = buildMetaPlatformCredentials({
      platformType: storedState.platformType,
      page,
      appCredentials,
      longLivedUserToken: longLived.access_token,
    });
    upsertMetaPlatform({
      tenantId: storedState.tenantId,
      platformType: storedState.platformType,
      credentials,
      tokenExpiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
        : null,
    });

    const targetLabel =
      storedState.platformType === "instagram"
        ? page.instagram_business_account?.username || page.name
        : page.name;

    return clearCookie(
      redirectWithStatus(
        returnTo,
        "success",
        `${storedState.platformType === "instagram" ? "Instagram" : "Facebook"} connected for ${targetLabel}.`
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta connection failed.";
    return clearCookie(redirectWithStatus(returnTo, "error", message));
  }
}
