// src/app/school/dashboard/[schoolId]/students/[studentId]/page.tsx
"use client";
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function StudentRootRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const studentId = params.studentId as string;

  useEffect(() => {
    // Redirect to the student's fee management page by default
    router.replace(`/school/dashboard/${schoolId}/students/${studentId}/manage-fees`);
  }, [router, schoolId, studentId]);

  return (
    <div className="flex justify-center items-center h-64">
      <p>Redirecting to the student's profile...</p>
    </div>
  );
}
