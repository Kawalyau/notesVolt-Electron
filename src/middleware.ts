// src/middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This middleware function is currently empty and will not alter any requests.
// It exists to resolve the build error and can be used for future middleware needs.
export function middleware(request: NextRequest) {
  return NextResponse.next()
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    // Add paths here if you need middleware to run on them.
    // For now, it runs on no paths.
  ],
}
