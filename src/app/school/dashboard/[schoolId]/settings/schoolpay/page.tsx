
// src/app/school/dashboard/[schoolId]/settings/schoolpay/page.tsx
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
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, Save, KeyRound } from 'lucide-react';

const schoolPaySettingsSchema = z.object({
  schoolPay_schoolCode: z.string().optional(),
  schoolPay_password: z.string().optional(),
});

type SchoolPaySettingsFormValues = z.infer<typeof schoolPaySettingsSchema>;

export default function SchoolPaySettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SchoolPaySettingsFormValues>({
    resolver: zodResolver(schoolPaySettingsSchema),
    defaultValues: {
      schoolPay_schoolCode: "", schoolPay_password: "",
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
            schoolPay_schoolCode: fetchedSchool.schoolPayConfig?.schoolCode || "",
            schoolPay_password: fetchedSchool.schoolPayConfig?.password || "",
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: SchoolPaySettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        schoolPayConfig: {
          schoolCode: data.schoolPay_schoolCode || null,
          password: data.schoolPay_password || null,
        },
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "SchoolPay Settings Updated" });
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
        <CardTitle className="text-2xl flex items-center"><KeyRound className="mr-3 h-6 w-6 text-primary"/>SchoolPay Configuration</CardTitle>
        <CardDescription>Manage your SchoolPay API credentials for payment integration.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField control={form.control} name="schoolPay_schoolCode" render={({ field }) => (
              <FormItem><FormLabel>SchoolPay School Code</FormLabel><FormControl><Input {...field} placeholder="School Code from SchoolPay" /></FormControl><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="schoolPay_password" render={({ field }) => (
              <FormItem><FormLabel>SchoolPay API Password</FormLabel><FormControl><Input type="password" {...field} placeholder="SchoolPay API Password" /></FormControl>
              <FormDescription>This password will be stored. Ensure it is managed securely.</FormDescription><FormMessage /></FormItem> )}/>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save SchoolPay Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
    