// src/app/school/dashboard/[schoolId]/reports/academics/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function SchoolAcademicsReportsLayout({ children }: { children: ReactNode }) {
  
  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
