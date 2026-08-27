import { NextRequest, NextResponse } from 'next/server';

const PRODUCTION_HOST = 'portal.hwf.zeekayeditz.com';

export function proxy(request: NextRequest) {
  const forwardedProtocol = request.headers.get('x-forwarded-proto');
  const isProductionHost = request.nextUrl.hostname === PRODUCTION_HOST;
  const isPlainHttp = request.nextUrl.protocol === 'http:' || forwardedProtocol === 'http';

  if (isProductionHost && isPlainHttp) {
    const secureUrl = request.nextUrl.clone();
    secureUrl.protocol = 'https:';
    secureUrl.host = PRODUCTION_HOST;
    return NextResponse.redirect(secureUrl, 308);
  }

  const response = NextResponse.next();
  if (isProductionHost) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  }
  return response;
}

export const config = {
  matcher: '/:path*',
};
