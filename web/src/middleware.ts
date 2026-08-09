import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// The landing page ("/"), auth pages, and the crawler-facing SEO/metadata routes are
// public. Everything else is private: unauthenticated visitors are redirected to
// /sign-in (pages) or get a 401 (API routes) by auth.protect(). The home route renders
// the marketing landing page for signed-out visitors and the workspace for signed-in
// users (see app/page.tsx).
//
// The SEO routes (robots.txt, sitemap.xml, opengraph-image, apple-icon) must stay public
// or crawlers/social scrapers would be redirected to sign-in and never see them.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/manifest.webmanifest",
  "/opengraph-image(.*)",
  "/icon(.*)",
  "/apple-icon(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
