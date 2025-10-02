
// src/app/school/dashboard/[schoolId]/payroll/settings/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, updateSchoolData } from '@/services';
import type { School } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Settings, Save } from 'lucide-react';
import { FormDescription } from '@/components/ui/form';

const payrollSettingsSchema = z.object({
  paymentDayOfMonth: z.preprocess(
    (val) => parseInt(String(val), 10),
    z.number().int().min(1, "Day must be between 1 and 28").max(28, "Day must be between 1 and 28")
  ),
});

type PayrollSettingsFormValues = z.infer<typeof payrollSettingsSchema>;

export default function PayrollSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PayrollSettingsFormValues>({
    resolver: zodResolver(payrollSettingsSchema),
    defaultValues: { paymentDayOfMonth: 28 },
  });
  
  useEffect(() => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    getSchoolById(schoolId)
      .then(fetchedSchool => {
        if (fetchedSchool) {
          form.reset({
            paymentDayOfMonth: fetchedSchool.paymentDayOfMonth || 28,
          });
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading settings" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, form, toast]);

  const onSubmit = async (data: PayrollSettingsFormValues) => {
    setIsSubmitting(true);
    try {
      await updateSchoolData(schoolId, { paymentDayOfMonth: data.paymentDayOfMonth });
      toast({ title: "Payroll Settings Updated" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Settings className="mr-3 h-6 w-6 text-primary"/>
          Default Payroll Settings
        </CardTitle>
        <CardDescription>
          Configure school-wide settings for payroll processing. Individual staff settings can be managed in their profiles.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent>
            <div className="max-w-sm">
                <FormField
                  control={form.control}
                  name="paymentDayOfMonth"
                  render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Payment Day of Month</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} value={field.value ?? ""} placeholder="e.g., 28" min="1" max="28" />
                    </FormControl>
                    <FormDescription>The default day of the month staff salaries are paid. Can be overridden per staff member.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
              Save Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
