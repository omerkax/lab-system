import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Özel alan / tarayıcıda eski index.html önbelleği → eski app.js?v=... ve eski API davranışı.
 * Sayfa navigasyonlarında Cache-Control: no-store (statik _next/static ve uzantılı public dosyalar hariç).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/_next/static') || pathname.startsWith('/_next/image')) {
    return NextResponse.next();
  }
  if (/\.[a-z0-9]{1,8}$/i.test(pathname)) {
    return NextResponse.next();
  }
  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  return res;
}

export const config = {
  matcher: '/:path*',
};
