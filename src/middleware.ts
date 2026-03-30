import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Using jose instead of jsonwebtoken because Next.js middleware runs in Edge Runtime
// which doesn't support Node.js crypto module

function getSecret(): Uint8Array {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    throw new Error("SERVER_SECRET environment variable is required");
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth routes through
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow public media access (Instagram needs public URLs)
  if (pathname.startsWith("/api/media/") && request.method === "GET") {
    return NextResponse.next();
  }

  // Allow public assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("sp_token")?.value;

  if (!token) {
    // API routes return 401, pages redirect to login
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    // Invalid/expired token
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
    // Clear bad cookie and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set("sp_token", "", { maxAge: 0, path: "/" });
    return response;
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/tenants/:path*",
    "/posts/:path*",
    "/calendar/:path*",
    "/api/:path*",
  ],
};
