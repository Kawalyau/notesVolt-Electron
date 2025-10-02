// src/app/school/dashboard/[schoolId]/settings/platform/page.tsx
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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, Save, Globe, Server } from 'lucide-react';

const platformSettingsSchema = z.object({
  customDomain: z.string().optional(),
  multiTenantCode: z.string().optional(),
  dataRetentionPolicyYears: z.preprocess(
    (val) => (String(val).trim() === "" ? null : parseInt(String(val), 10)),
    z.number().int().min(0, "Cannot be negative.").optional().nullable()
  ),
  autoBackupEnabled: z.boolean().optional(),
});

type PlatformSettingsFormValues = z.infer<typeof platformSettingsSchema>;

export default function PlatformSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PlatformSettingsFormValues>({
    resolver: zodResolver(platformSettingsSchema),
    defaultValues: {
      customDomain: "", multiTenantCode: "", dataRetentionPolicyYears: null, autoBackupEnabled: false,
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
            customDomain: fetchedSchool.customDomain || "",
            multiTenantCode: fetchedSchool.multiTenantCode || "",
            dataRetentionPolicyYears: fetchedSchool.dataRetentionPolicyYears ?? null,
            autoBackupEnabled: fetchedSchool.autoBackupEnabled ?? false,
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" }); router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: PlatformSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        customDomain: data.customDomain || null,
        multiTenantCode: data.multiTenantCode || null,
        dataRetentionPolicyYears: data.dataRetentionPolicyYears ?? null,
        autoBackupEnabled: data.autoBackupEnabled ?? false,
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Platform Settings Updated" });
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
        <CardTitle className="text-2xl flex items-center"><Globe className="mr-3 h-6 w-6 text-primary"/>Platform & Tenant Settings</CardTitle>
        <CardDescription>Configure custom domain, multi-tenancy, and data policies for your school's instance.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="customDomain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custom Domain</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g., www.myschool.com" /></FormControl>
                  <FormDescription>
                    Point your domain to our servers. See documentation for DNS setup.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="multiTenantCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Multi-Tenant Code (Optional)</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormDescription>
                    Internal code for distinguishing tenants in a shared environment, if applicable.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             <Separator />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                    control={form.control}
                    name="dataRetentionPolicyYears"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Data Retention (Years)</FormLabel>
                        <FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)} value={field.value ?? ""} placeholder="e.g., 7" /></FormControl>
                        <FormDescription>
                            Number of years to retain data. Leave blank for indefinite.
                        </FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="autoBackupEnabled"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm h-full">
                            <div className="space-y-0.5">
                                <FormLabel>Automatic Backups</FormLabel>
                                <FormDescription className="text-xs">Enable or disable automatic data backups.</FormDescription>
                            </div>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        </FormItem>
                    )}
                    />
             </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save Platform Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

