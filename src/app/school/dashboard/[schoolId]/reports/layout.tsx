// src/app/school/dashboard/[schoolId]/reports/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function SchoolReportsLayout({ children }: { children: ReactNode }) {

  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
