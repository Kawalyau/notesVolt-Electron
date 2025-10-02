
// src/app/school/auth/page.tsx
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolsByAdmin } from '@/services/schoolService';
import type { School } from '@/types/school';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Building, PlusCircle, LogIn, UserPlus, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function SchoolAuthPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [managedSchools, setManagedSchools] = useState<School[] | null>(null);
  const [loadingSchools, setLoadingSchools] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setLoadingSchools(true); 
      return;
    }

    if (user) {
      setLoadingSchools(true);
      getSchoolsByAdmin(user.uid)
        .then(schools => {
          setManagedSchools(schools);
          // No automatic redirect from here; selection or creation is done on this page.
        })
        .catch(error => {
          console.error("Failed to fetch managed schools:", error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Could not retrieve your school list."
          });
          setManagedSchools([]); 
        })
        .finally(() => setLoadingSchools(false));
    } else {
      setManagedSchools(null);
      setLoadingSchools(false);
    }
  }, [user, authLoading, router, toast]);

  if (authLoading || (loadingSchools && user)) { // Show loader if auth is loading OR if user exists and schools are loading
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-xl text-primary">Loading School Portal...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen-minus-navbar bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-lg shadow-xl rounded-xl">
        <CardHeader className="text-center">
          <Building className="mx-auto h-12 w-12 text-primary mb-4" />
          <CardTitle className="text-3xl font-bold text-primary">School Management Portal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!user ? (
            <div className="text-center space-y-4">
              <CardDescription className="text-md">
                Please log in or create an account to manage your school or set up a new one.
              </CardDescription>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/login?redirect=/school/auth" passHref className="w-full sm:w-auto">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    <LogIn className="mr-2 h-5 w-5" /> Log In
                  </Button>
                </Link>
                <Link href="/signup?redirect=/school/auth" passHref className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full">
                    <UserPlus className="mr-2 h-5 w-5" /> Sign Up
                  </Button>
                </Link>
              </div>
            </div>
          ) : managedSchools && managedSchools.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-center text-foreground">Your Schools</h2>
              <p className="text-sm text-muted-foreground text-center">Select a school to manage its dashboard.</p>
              <div className="space-y-3 max-h-60 overflow-y-auto p-1">
                {managedSchools.map(school => (
                  <Link key={school.id} href={`/school/dashboard/${school.id}`} passHref>
                    <Button variant="outline" className="w-full justify-between py-6 text-left h-auto">
                      <div className="flex flex-col">
                        <span className="font-medium">{school.name}</span>
                        <span className="text-xs text-muted-foreground">{school.address || 'Address not set'}</span>
                      </div>
                      <ArrowRight className="h-5 w-5 text-primary" />
                    </Button>
                  </Link>
                ))}
              </div>
              <CardDescription className="text-center pt-2">Or, you can set up a new school.</CardDescription>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <CardDescription className="text-md">
                You are not currently managing any schools. Get started by creating one!
              </CardDescription>
            </div>
          )}

          {user && (
            <div className="pt-4 border-t">
              <Link href="/school/create" passHref>
                <Button className="w-full bg-accent hover:bg-accent/90 text-accent-foreground">
                  <PlusCircle className="mr-2 h-5 w-5" /> Create New School
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
         <CardFooter className="text-center text-xs text-muted-foreground pb-6 bg-muted/30 pt-4 rounded-b-xl">
           Access academic resources on <Link href="/browse" className="text-primary hover:underline font-medium">NotesVault</Link>.
        </CardFooter>
      </Card>
    </div>
  );
}
