// src/app/school/dashboard/[schoolId]/attendance/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// This page is now a redirect to the default attendance sub-page.
export default function AttendanceRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    // Redirect to the "Take Attendance" page by default
    router.replace(`/school/dashboard/${schoolId}/attendance/take`);
  }, [router, schoolId]);

  return (
    <div className="flex justify-center items-center h-64">
      <p>Redirecting to the Attendance module...</p>
    </div>
  );
}
