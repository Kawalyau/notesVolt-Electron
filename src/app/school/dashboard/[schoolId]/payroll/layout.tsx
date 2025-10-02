// src/app/school/dashboard/[schoolId]/payroll/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
