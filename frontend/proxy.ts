import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that do NOT require authentication
const isPublicRoute = createRouteMatcher([
  "/",           // landing page — auth-gating is handled client-side via useUser()
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Protect all non-public routes at the edge
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
