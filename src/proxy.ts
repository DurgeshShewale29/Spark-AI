import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Make the home page and API routes public so Guest mode works
const isPublicRoute = createRouteMatcher(["/", "/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};