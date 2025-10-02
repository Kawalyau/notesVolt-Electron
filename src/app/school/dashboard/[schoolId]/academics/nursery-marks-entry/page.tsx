// src/app/school/dashboard/[schoolId]/academics/nursery-marks-entry/page.tsx
"use client";
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// This page is deprecated and now redirects to the new nursery assessment entry page.
export default function DeprecatedNurseryMarksEntryPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    router.replace(`/school/dashboard/${schoolId}/nursery/assessment-entry`);
  }, [router, schoolId]);

  return (
    <div className="flex justify-center items-center h-64">
      <p>Redirecting to the new Nursery assessment entry page...</p>
    </div>
  );
}
