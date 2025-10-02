
// src/app/school/dashboard/[schoolId]/settings/sms-gateway/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, updateSchoolData } from '@/services';
import type { School, SchoolSmsConfig } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Loader2, Save, MessageSquare, Info } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';

const egoSmsSettingsSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  password: z.string().trim().min(1, "Password is required."),
  sender: z.string().trim().min(1, "Sender ID is required.").max(11, "Sender ID cannot exceed 11 characters."),
});

type EgoSmsSettingsFormValues = z.infer<typeof egoSmsSettingsSchema>;

export default function SmsGatewaySettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EgoSmsSettingsFormValues>({
    resolver: zodResolver(egoSmsSettingsSchema),
    defaultValues: {
      username: "",
      password: "",
      sender: "",
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
            username: fetchedSchool.smsConfig?.egoSms?.username || "",
            password: fetchedSchool.smsConfig?.egoSms?.password || "",
            sender: fetchedSchool.smsConfig?.egoSms?.sender || "",
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" });
          router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data", description: err.message }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: EgoSmsSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const newSmsConfig: SchoolSmsConfig = {
        ...school.smsConfig,
        defaultProvider: 'EgoSMS',
        egoSms: {
          username: data.username,
          password: data.password,
          sender: data.sender,
        },
      };
      await updateSchoolData(schoolId, { smsConfig: newSmsConfig });
      toast({ title: "EgoSMS Settings Updated", description: "Your EgoSMS credentials have been saved." });
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
        <CardTitle className="text-2xl flex items-center">
          <MessageSquare className="mr-3 h-6 w-6 text-primary"/>EgoSMS Gateway Configuration
        </CardTitle>
        <CardDescription>
          Enter your EgoSMS Username, Password, and Sender ID to enable SMS notifications. 
          Ensure "Enable SMS Notifications" is turned on in the System Features settings.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-700">
                <Info className="h-4 w-4 !text-blue-600" />
                <AlertTitle className="font-semibold">EgoSMS Details</AlertTitle>
                <p className="text-xs">
                    You can obtain your credentials and register your Sender ID from your EgoSMS account dashboard.
                    Sender IDs are typically approved by EgoSMS.
                </p>
            </Alert>
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>EgoSMS Username*</FormLabel>
                  <FormControl><Input {...field} placeholder="Enter your EgoSMS Username" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>EgoSMS Password*</FormLabel>
                  <FormControl><Input type="password" {...field} placeholder="Enter your EgoSMS Password" /></FormControl>
                  <FormDescription className="text-xs">This password will be stored securely.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>EgoSMS Sender ID*</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g., YourSchool" /></FormControl>
                  <FormDescription className="text-xs">The approved Sender ID for your SMS messages (max 11 characters).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save EgoSMS Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
