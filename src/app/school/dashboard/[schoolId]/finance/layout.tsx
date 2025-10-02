// src/app/school/dashboard/[schoolId]/finance/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function SchoolFinanceLayout({ children }: { children: ReactNode }) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
