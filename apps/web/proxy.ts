import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
const clerk = clerkMiddleware();
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
    ? clerk(req, event)
    : NextResponse.next();
}
export const config = { matcher: ['/((?!_next|.*\\..*).*)'] };
