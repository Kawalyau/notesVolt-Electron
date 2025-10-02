
// src/app/school/dashboard/[schoolId]/finance/budgets/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function FinanceBudgetsRootPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;

  useEffect(() => {
    if (authLoading) return;
    // Redirect to the budget dashboard as the default page for this module
    router.replace(`/school/dashboard/${schoolId}/finance/budgets/dashboard`);
  }, [user, authLoading, router, schoolId]);

  return (
    <div className="flex flex-col items-center justify-center h-64 p-6 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <h1 className="text-xl font-semibold text-primary">Redirecting to Budget Dashboard...</h1>
    </div>
  );
}
