// src/app/school/page.tsx
"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';

export default function SchoolRootPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) {
      return; 
    }
    // Redirect all users, logged in or not, to the /school/auth page
    // where they can select a school or log in.
    router.replace(`/school/auth`);

  }, [user, authLoading, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <h1 className="text-2xl font-semibold text-primary">Redirecting to School Portal...</h1>
    </div>
  );
}
