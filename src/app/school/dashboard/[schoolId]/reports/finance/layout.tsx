// src/app/school/dashboard/[schoolId]/reports/finance/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function SchoolFinanceReportsLayout({ children }: { children: ReactNode }) {
  
  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
