
// src/app/school/dashboard/[schoolId]/settings/features/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, updateSchoolData } from '@/services';
import type { School } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';

const featureSettingsSchema = z.object({
  enableStudentPortal: z.boolean().optional(),
  enableParentPortal: z.boolean().optional(),
  enableTeacherPortal: z.boolean().optional(),
  enableSmsNotifications: z.boolean().optional(),
  // smsGatewayConfig string input removed, specific config is on its own page
  enableAttendanceTracking: z.boolean().optional(),
  enableExamsModule: z.boolean().optional(),
  enableTimetableModule: z.boolean().optional(),
  enableHostelModule: z.boolean().optional(),
  enableTransportModule: z.boolean().optional(),
  enableLibraryModule: z.boolean().optional(),
  enableReportsModule: z.boolean().optional(),
  enableInventoryAssetsModule: z.boolean().optional(),
});

type FeatureSettingsFormValues = z.infer<typeof featureSettingsSchema>;

const featureFields: Array<{name: keyof FeatureSettingsFormValues, label: string, description?: string}> = [
    { name: "enableStudentPortal", label: "Student Portal", description: "Allow students to log in and access resources, grades, etc." },
    { name: "enableParentPortal", label: "Parent Portal", description: "Allow parents to view student progress, attendance, and communicate." },
    { name: "enableTeacherPortal", label: "Teacher Portal", description: "Allow teachers to manage classes, grades, and student information." },
    { name: "enableSmsNotifications", label: "SMS Notifications", description: "Send SMS for attendance, reminders, and announcements. (Configure credentials on SMS Gateway page)" },
    { name: "enableAttendanceTracking", label: "Attendance Tracking", description: "Enable daily student and staff attendance tracking features." },
    { name: "enableExamsModule", label: "Exams Module", description: "Manage exam schedules, grading, and result publication." },
    { name: "enableTimetableModule", label: "Timetable Module", description: "Create and manage class and teacher timetables." },
    { name: "enableHostelModule", label: "Hostel Module", description: "Manage hostel allocation and student boarding (for boarding schools)." },
    { name: "enableTransportModule", label: "Transport Module", description: "Manage school transport routes, vehicles, and student tracking." },
    { name: "enableLibraryModule", label: "Library Module", description: "Catalog books, manage lending, and track library usage." },
    { name: "enableReportsModule", label: "Reports Module", description: "Generate report cards, academic analytics, and administrative reports." },
    { name: "enableInventoryAssetsModule", label: "Inventory/Assets Module", description: "Track and manage school assets and inventory." },
];


export default function FeatureSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FeatureSettingsFormValues>({
    resolver: zodResolver(featureSettingsSchema),
    defaultValues: {
      enableStudentPortal: false, enableParentPortal: false, enableTeacherPortal: false,
      enableSmsNotifications: false, 
      enableAttendanceTracking: false,
      enableExamsModule: true, // Enable by default
      enableTimetableModule: false, enableHostelModule: false,
      enableTransportModule: false, enableLibraryModule: false, enableReportsModule: true, // Enable by default
      enableInventoryAssetsModule: false,
    },
  });

  useEffect(() => {
    if (authLoading || !schoolId || !user) return;
    getSchoolById(schoolId)
      .then(fetchedSchool => {
        if (fetchedSchool) {
          if (!fetchedSchool.adminUids.includes(user.uid)) {
            toast({ variant: "destructive", title: "Access Denied" }); router.push('/school/auth'); return;
          }
          setSchool(fetchedSchool);
          form.reset({
            enableStudentPortal: fetchedSchool.enableStudentPortal ?? false,
            enableParentPortal: fetchedSchool.enableParentPortal ?? false,
            enableTeacherPortal: fetchedSchool.enableTeacherPortal ?? false,
            enableSmsNotifications: fetchedSchool.enableSmsNotifications ?? false,
            // smsGatewayConfig is no longer a string input here
            enableAttendanceTracking: fetchedSchool.enableAttendanceTracking ?? false,
            enableExamsModule: fetchedSchool.enableExamsModule ?? true,
            enableTimetableModule: fetchedSchool.enableTimetableModule ?? false,
            enableHostelModule: fetchedSchool.enableHostelModule ?? false,
            enableTransportModule: fetchedSchool.enableTransportModule ?? false,
            enableLibraryModule: fetchedSchool.enableLibraryModule ?? false,
            enableReportsModule: fetchedSchool.enableReportsModule ?? true,
            enableInventoryAssetsModule: fetchedSchool.enableInventoryAssetsModule ?? false,
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: FeatureSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        enableStudentPortal: data.enableStudentPortal,
        enableParentPortal: data.enableParentPortal,
        enableTeacherPortal: data.enableTeacherPortal,
        enableSmsNotifications: data.enableSmsNotifications,
        // smsGatewayConfig string is no longer updated from this form
        enableAttendanceTracking: data.enableAttendanceTracking,
        enableExamsModule: data.enableExamsModule,
        enableTimetableModule: data.enableTimetableModule,
        enableHostelModule: data.enableHostelModule,
        enableTransportModule: data.enableTransportModule,
        enableLibraryModule: data.enableLibraryModule,
        enableReportsModule: data.enableReportsModule,
        enableInventoryAssetsModule: data.enableInventoryAssetsModule,
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Feature Settings Updated" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  if (!school) return null;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center"><SlidersHorizontal className="mr-3 h-6 w-6 text-primary"/>System Features</CardTitle>
        <CardDescription>Enable or disable various modules and features for your school management system.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                {featureFields.map(feat => (
                    <FormField key={feat.name} control={form.control} name={feat.name as keyof FeatureSettingsFormValues} render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-muted/20">
                            <div className="space-y-0.5">
                                <FormLabel>{feat.label}</FormLabel>
                                {feat.description && <FormDescription className="text-xs">{feat.description}</FormDescription>}
                            </div>
                            <FormControl><Switch checked={field.value as boolean | undefined ?? false} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                    )}/>
                ))}
                {/* Removed smsGatewayConfig text input */}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save Feature Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
