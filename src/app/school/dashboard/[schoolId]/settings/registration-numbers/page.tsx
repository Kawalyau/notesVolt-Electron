
// src/app/school/dashboard/[schoolId]/settings/registration-numbers/page.tsx
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
import { Loader2, Save, Hash } from 'lucide-react';

const regNumSettingsSchema = z.object({
  regNum_prefix: z.string().optional(),
  regNum_nextSuffix: z.preprocess(
    (val) => (String(val).trim() === "" ? undefined : parseInt(String(val), 10)),
    z.number().int().min(0, "Next number cannot be negative.").optional().nullable()
  ),
  regNum_suffixPadding: z.preprocess(
    (val) => (String(val).trim() === "" ? undefined : parseInt(String(val), 10)),
    z.number().int().min(1, "Padding must be at least 1.").max(10, "Padding too large.").optional().nullable()
  ),
});

type RegNumSettingsFormValues = z.infer<typeof regNumSettingsSchema>;

export default function RegistrationNumberSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegNumSettingsFormValues>({
    resolver: zodResolver(regNumSettingsSchema),
    defaultValues: {
      regNum_prefix: "", regNum_nextSuffix: null, regNum_suffixPadding: null,
    },
  });

  useEffect(() => {
    if (authLoading || !schoolId || !user) return;
    getSchoolById(schoolId)
      .then(fetchedSchool => {
        if (fetchedSchool) {
          if (!fetchedSchool.adminUids.includes(user.uid)) {
            toast({ variant: "destructive", title: "Access Denied" });
            router.push('/school/auth'); return;
          }
          setSchool(fetchedSchool);
          form.reset({
            regNum_prefix: fetchedSchool.registrationNumberConfig?.prefix || "",
            regNum_nextSuffix: fetchedSchool.registrationNumberConfig?.nextSuffix ?? null,
            regNum_suffixPadding: fetchedSchool.registrationNumberConfig?.suffixPadding ?? null,
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" });
          router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: RegNumSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        registrationNumberConfig: {
          prefix: data.regNum_prefix || null,
          nextSuffix: data.regNum_nextSuffix ?? null,
          suffixPadding: data.regNum_suffixPadding ?? null,
        },
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Registration Number Settings Updated" });
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
        <CardTitle className="text-2xl flex items-center"><Hash className="mr-3 h-6 w-6 text-primary"/>Student Registration Number Configuration</CardTitle>
        <CardDescription>Define the format and sequence for auto-generating student registration IDs.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <FormField control={form.control} name="regNum_prefix" render={({ field }) => (
              <FormItem><FormLabel>Prefix</FormLabel><FormControl><Input {...field} placeholder="e.g., STU-" /></FormControl>
              <FormDescription>Text that appears before the number part (e.g., SCH/2024/).</FormDescription><FormMessage /></FormItem> )}/>
            <FormField control={form.control} name="regNum_nextSuffix" render={({ field }) => (
              <FormItem><FormLabel>Next Number Suffix</FormLabel>
                <FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)} value={field.value ?? ""} placeholder="e.g., 101" /></FormControl>
                <FormDescription>The next number to be used in the sequence.</FormDescription><FormMessage />
              </FormItem> )}/>
            <FormField control={form.control} name="regNum_suffixPadding" render={({ field }) => (
              <FormItem><FormLabel>Suffix Padding Digits</FormLabel>
                <FormControl><Input type="number" {...field} onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)} value={field.value ?? ""} placeholder="e.g., 4 (for 0001)" /></FormControl>
                <FormDescription>Total digits for the number part (e.g., 3 for 001, 4 for 0001).</FormDescription><FormMessage />
              </FormItem> )}/>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save Registration Number Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
    