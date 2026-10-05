import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "calendario_admin";

// Paths that are PUBLIC — no auth required
const PUBLIC_PATHS = [
  "/book",
  "/cancel",
  "/signin",
  "/api/signin", // the auth endpoint itself
  "/api/bookings", // POST to create bookings
  "/api/availability/slots",
  "/api/event-types/by-slug",
  "/api/bookings/cancel",
  "/api/bookings/by-session", // invitees look up booking after Stripe redirect
  "/api/checkout/create", // Stripe Checkout session
  "/api/webhooks", // Stripe + other webhooks
  "/api/workflows/execute", // cron-callable
  "/api/google/callback", // OAuth redirect target
  "/embed.js",
  "/brand", // logo etc. used on public booking pages
];

// The /api/bookings/[id]/ics download is also public so invitees
// can re-download their calendar invite.
function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/_next") || pathname.startsWith("/favicon"))
    return false; // dashboard is private
  if (pathname.endsWith("/ics")) return true; // .ics downloads are public
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/embed.js"
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Private path — check auth cookie
  const cookie = request.cookies.get(AUTH_COOKIE);
  const expectedPassword = process.env.ADMIN_PASSWORD;

  // If no password is configured, allow access (local dev convenience)
  if (!expectedPassword) {
    return NextResponse.next();
  }

  if (cookie?.value === expectedPassword) {
    return NextResponse.next();
  }

  // Redirect to sign-in page with return URL
  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    // Match everything except Next internals & static files
    "/((?!_next/static|_next/image|favicon.ico|embed.js).*)",
  ],
};
