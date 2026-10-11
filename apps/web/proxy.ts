import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { resumeSameRoute } from './lib/resume-same-route';
const clerk = clerkMiddleware();
export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY)
    return NextResponse.next();
  const response = await clerk(req, event);
  return response ? resumeSameRoute(response, req.url) : response;
}
export const config = {
  matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)', '/__clerk/:path*'],
};
