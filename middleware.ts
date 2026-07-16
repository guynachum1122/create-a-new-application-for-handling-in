import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/rate-limit';

const protectedPrefixes = [
  '/dashboard',
  '/customers',
  '/policies',
  '/accounting',
  '/claims',
  '/flow',
  '/admin',
  '/account',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === 'POST' && pathname.startsWith('/api/auth/')) {
    const rl = await applyRateLimit(request, 'auth', 5, 15 * 60_000);
    if (rl) return rl;
  }

  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!isProtected) return NextResponse.next();

  const session = await auth();
  if (!session?.user) {
    const signIn = new URL('/auth/sign-in', request.url);
    signIn.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signIn);
  }

  if (session.user.status !== 'ACTIVE') {
    return NextResponse.redirect(new URL('/auth/sign-in?error=inactive', request.url));
  }

  if (pathname.startsWith('/admin') && session.user.roleName !== 'ADMIN') {
    return NextResponse.redirect(new URL('/403', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/auth/:path*',
    '/dashboard/:path*',
    '/customers/:path*',
    '/policies/:path*',
    '/accounting/:path*',
    '/claims/:path*',
    '/flow/:path*',
    '/admin/:path*',
    '/account',
    '/account/:path*',
  ],
};
