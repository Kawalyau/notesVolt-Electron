// src/app/school/dashboard/[schoolId]/students/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

// This page is now a redirect to the default student directory page.
export default function StudentsRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    // Redirect to the "directory" sub-page by default
    router.replace(`/school/dashboard/${schoolId}/students/directory`);
  }, [router, schoolId]);

  return (
    <div className="flex justify-center items-center h-64">
      <p>Redirecting to student directory...</p>
    </div>
  );
}
