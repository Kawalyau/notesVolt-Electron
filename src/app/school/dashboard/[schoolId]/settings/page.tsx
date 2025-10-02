
// src/app/school/dashboard/[schoolId]/settings/page.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, DatabaseZap, Loader2, AlertTriangle, Building, MapPin, Contact, BookOpen, Hash, FileText, SlidersHorizontal, KeyRound, MessageSquare, Globe, PenSquare, Baby } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, useCallback } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getSchoolById } from '@/services/schoolService';
import { runClientSideMigration } from '@/services/migrationService';
import type { School } from "@/types/school";

export default function SchoolSettingsOverviewPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [schoolData, setSchoolData] = useState<School | null>(null);

  const fetchSchoolData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsPageLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (fetchedSchool && fetchedSchool.adminUids.includes(user.uid)) {
        setSchoolData(fetchedSchool);
      } else {
        toast({ variant: "destructive", title: "Error", description: "School not found or access denied." });
        router.push('/school/auth');
      }
    } catch (error) {
      console.error("Error fetching school data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load school data." });
    } finally {
      setIsPageLoading(false);
    }
  }, [user, schoolId, toast, router]);


  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.replace(`/login?redirect=/school/dashboard/${schoolId}/settings`);
      } else {
        fetchSchoolData();
      }
    }
  }, [user, authLoading, router, schoolId, fetchSchoolData]);


  const handleRunMigration = async () => {
    if (!userProfile || !schoolId || !schoolData) {
      toast({ variant: "destructive", title: "Error", description: "User profile or school data is missing." });
      return;
    }
    setIsMigrating(true);
    setShowMigrationConfirm(false);
    toast({ title: "Migration Started", description: "Processing historical financial data. This may take some time..." });

    try {
      const result = await runClientSideMigration(schoolId, userProfile, schoolData);
      
      toast({ 
        title: "Migration Complete", 
        description: result.message || "Historical data migration process finished.",
        duration: 10000 
      });
      if(result.errors && result.errors.length > 0) {
        console.error("Migration errors:", result.errors);
        toast({
            variant: "destructive",
            title: `Migration Had Issues (${result.errors.length} errors)`,
            description: `Some errors occurred. Check console for details or re-run if partial. First error: ${result.errors[0].substring(0,100)}...`,
            duration: 15000
        });
      }

    } catch (error: any) {
      console.error("Error running client-side migration:", error);
      toast({
        variant: "destructive",
        title: "Migration Error",
        description: error.message || "Failed to run data migration.",
        duration: 10000
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (isPageLoading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  if (!user || !schoolData) return null;

  const migrationPrerequisitesMet = 
    schoolData.defaultCashAccountId && 
    schoolData.defaultAccountsReceivableAccountId &&
    schoolData.defaultBursaryExpenseAccountId;
  
  const settingsSections = [
    { title: "Website Admin", description: "Manage content on your public-facing school website.", href: `/school/dashboard/${schoolId}/settings/website`, icon: Globe },
    { title: "Basic Info", description: "Update name, type, ownership, motto, logo, etc.", href: `/school/dashboard/${schoolId}/settings/basic-info`, icon: Building },
    { title: "Location", description: "Set your school's physical address and district.", href: `/school/dashboard/${schoolId}/settings/location`, icon: MapPin },
    { title: "Contact Info", description: "Update phone numbers, email, and admin contact.", href: `/school/dashboard/${schoolId}/settings/contact`, icon: Contact },
    { title: "Academic Config", description: "Manage classes, subjects, years, and terms.", href: `/school/dashboard/${schoolId}/settings/academic`, icon: BookOpen },
    { title: "Exams & Grading", description: "Manage exam series and grading scales.", href: `/school/dashboard/${schoolId}/academics/exams`, icon: PenSquare },
    { title: "Nursery Settings", description: "Configure competences and assessments for nursery.", href: `/school/dashboard/${schoolId}/nursery/settings`, icon: Baby },
    { title: "Registration Numbers", description: "Set the auto-generation format for student IDs.", href: `/school/dashboard/${schoolId}/settings/registration-numbers`, icon: Hash },
    { title: "SchoolPay Config", description: "Manage your SchoolPay API credentials.", href: `/school/dashboard/${schoolId}/settings/schoolpay`, icon: KeyRound },
    { title: "SMS Gateway", description: "Configure your EgoSMS credentials for notifications.", href: `/school/dashboard/${schoolId}/settings/sms-gateway`, icon: MessageSquare },
    { title: "Document Uploads", description: "Upload official school documents.", href: `/school/dashboard/${schoolId}/settings/documents`, icon: FileText },
    { title: "System Features", description: "Enable or disable different platform modules.", href: `/school/dashboard/${schoolId}/settings/features`, icon: SlidersHorizontal },
    { title: "Platform & Tenant", description: "Advanced settings for custom domains and data.", href: `/school/dashboard/${schoolId}/settings/platform`, icon: Globe },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-3 h-6 w-6 text-primary"/>
            School Settings
          </CardTitle>
          <CardDescription>
            Manage and configure all aspects of your school's information and system features from one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {settingsSections.map((section) => (
            <Link key={section.title} href={section.href} passHref>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
                <CardHeader className="flex-grow">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg">
                      <section.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg font-medium text-primary">{section.title}</CardTitle>
                      <CardDescription className="text-xs mt-1">{section.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="text-xl flex items-center">
                <DatabaseZap className="mr-3 h-5 w-5 text-amber-600"/>Data Migration & Utilities
            </CardTitle>
            <CardDescription>
                Run one-time operations or utilities for data management. Use with caution.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-3">
                <div>
                    <h4 className="font-medium">Historical Financial Data Migration</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                        This will process existing student fee transactions, school income, and expenses to create corresponding journal entries in the new accounting system. 
                        It also sets students in any class named "Demo Class" to inactive. This should only be run once.
                    </p>
                    <Button onClick={() => setShowMigrationConfirm(true)} disabled={isMigrating || !migrationPrerequisitesMet} variant="destructive" size="sm">
                        {isMigrating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <DatabaseZap className="mr-2 h-4 w-4"/>}
                        {isMigrating ? "Migrating Data..." : "Run Historical Data Migration"}
                    </Button>
                     {!migrationPrerequisitesMet && !isMigrating && (
                        <p className="text-xs text-destructive mt-1">
                            Migration requires default Cash, Accounts Receivable, and Bursary Expense accounts to be set in Finance Settings.
                        </p>
                    )}
                </div>
            </div>
        </CardContent>
      </Card>

      <AlertDialog open={showMigrationConfirm} onOpenChange={setShowMigrationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-destructive"/>Are you absolutely sure?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action will process historical financial data and attempt to create journal entries for transactions that haven&apos;t been journalized yet. 
              It will also set students in any class named "Demo Class" to inactive. 
              <strong className="block mt-2">This operation should only be run once and cannot be easily undone.</strong> 
              Ensure your Chart of Accounts and default finance accounts are correctly set up before proceeding. This will run in your browser and may take a while for large datasets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowMigrationConfirm(false)} disabled={isMigrating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunMigration} disabled={isMigrating} className="bg-destructive hover:bg-destructive/90">
              {isMigrating ? <Loader2 className="animate-spin mr-2"/> : null}
              Yes, Run Migration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
