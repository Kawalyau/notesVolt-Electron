// src/app/school/dashboard/[schoolId]/fees/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function SchoolFeesLayout({ children }: { children: ReactNode }) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
      {children}
    </main>
  );
}
