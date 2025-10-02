
// src/app/school/dashboard/[schoolId]/library/layout.tsx
"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function SchoolModuleLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const schoolId = params.schoolId as string;

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <div className="mb-6">
        <Button variant="outline" asChild>
          <Link href={`/school/dashboard/${schoolId}`}>
            <ArrowLeft className="mr-2 h-4 w-4"/> Back to School Dashboard
          </Link>
        </Button>
      </div>
      <main>{children}</main>
    </div>
  );
}
