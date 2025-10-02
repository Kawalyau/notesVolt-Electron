// src/app/school/dashboard/[schoolId]/reports/academics/nursery-report/page.tsx
"use client";
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// This page is deprecated and now redirects to the new nursery reports page.
export default function DeprecatedNurseryReportPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    router.replace(`/school/dashboard/${schoolId}/nursery/reports`);
  }, [router, schoolId]);

  return (
    <div className="flex justify-center items-center h-64">
      <p>Redirecting to the new Nursery reports page...</p>
    </div>
  );
}
