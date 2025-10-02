// src/app/school/dashboard/[schoolId]/people/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function PeopleRootPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    if (authLoading) return;
    // Default to the student directory when accessing the /people route
    router.replace(`/school/dashboard/${schoolId}/students/directory`);

  }, [user, authLoading, router, schoolId]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <h1 className="text-2xl font-semibold text-primary">Redirecting to People Module...</h1>
    </div>
  );
}
