// src/app/school/dashboard/[schoolId]/academics/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function AcademicsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <main className="p-4 sm:p-6 lg:p-8">
        {children}
    </main>
  );
}
