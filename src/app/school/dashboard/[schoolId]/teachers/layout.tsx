// src/app/school/dashboard/[schoolId]/teachers/layout.tsx
"use client";

import type { ReactNode } from 'react';

export default function TeachersLayout({
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
