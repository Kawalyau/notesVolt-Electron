
// src/app/school/dashboard/[schoolId]/settings/contact/page.tsx
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Contact as ContactIcon, ShieldCheck } from 'lucide-react';

const contactPositionOptions = ["Head Teacher", "Principal", "Director", "ICT Admin", "Proprietor", "School Bursar", "Dean of Studies", "Registrar", "Other"];

const contactSettingsSchema = z.object({
  // School Contact
  phoneNumber: z.string().min(10, "Valid phone number required").max(15).optional().or(z.literal("")),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  // Primary Contact Person (Admin Info)
  primaryContact_fullName: z.string().min(2, "Contact person's name is required").max(100),
  primaryContact_position: z.string().min(1, "Position is required"),
  primaryContact_positionOther: z.string().optional(),
  primaryContact_phoneNumber: z.string().min(10, "Valid phone number required").max(15),
  primaryContact_emailAddress: z.string().email("Invalid email address"),
  primaryContact_nin: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.primaryContact_position === "Other" && !data.primaryContact_positionOther?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify position", path: ["primaryContact_positionOther"] });
  }
});

type ContactSettingsFormValues = z.infer<typeof contactSettingsSchema>;

export default function ContactSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ContactSettingsFormValues>({
    resolver: zodResolver(contactSettingsSchema),
    defaultValues: {
      phoneNumber: "", email: "", website: "",
      primaryContact_fullName: "", primaryContact_position: undefined, primaryContact_positionOther: "",
      primaryContact_phoneNumber: "", primaryContact_emailAddress: "", primaryContact_nin: "",
    },
  });
  
  const watchedContactPosition = form.watch("primaryContact_position");

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
            phoneNumber: fetchedSchool.phoneNumber || "",
            email: fetchedSchool.email || "",
            website: fetchedSchool.website || "",
            primaryContact_fullName: fetchedSchool.primaryContact?.fullName || "",
            primaryContact_position: fetchedSchool.primaryContact?.position || undefined,
            primaryContact_positionOther: contactPositionOptions.includes(fetchedSchool.primaryContact?.position || "") ? "" : fetchedSchool.primaryContact?.position || "",
            primaryContact_phoneNumber: fetchedSchool.primaryContact?.phoneNumber || "",
            primaryContact_emailAddress: fetchedSchool.primaryContact?.emailAddress || "",
            primaryContact_nin: fetchedSchool.primaryContact?.nin || "",
          });
        } else {
          toast({ variant: "destructive", title: "Not Found" });
          router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error loading data" }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: ContactSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        phoneNumber: data.phoneNumber || null,
        email: data.email || null,
        website: data.website || null,
        primaryContact: {
          fullName: data.primaryContact_fullName,
          position: data.primaryContact_position === "Other" ? (data.primaryContact_positionOther || data.primaryContact_position) : data.primaryContact_position,
          phoneNumber: data.primaryContact_phoneNumber,
          emailAddress: data.primaryContact_emailAddress,
          nin: data.primaryContact_nin || null,
        },
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Contact Settings Updated" });
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
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><ContactIcon className="mr-3 h-6 w-6 text-primary"/>School Contact Information</CardTitle>
          <CardDescription>Official contact details for the school.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                  <FormItem><FormLabel>School Phone Number</FormLabel><FormControl><Input type="tel" {...field} placeholder="+256 7XX XXX XXX" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>School Email Address</FormLabel><FormControl><Input type="email" {...field} placeholder="info@schoolname.org" /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="website" render={({ field }) => (
                  <FormItem className="md:col-span-2"><FormLabel>School Website (if any)</FormLabel><FormControl><Input type="url" {...field} placeholder="https://www.schoolname.org" /></FormControl><FormMessage /></FormItem> )}/>
              </div>
            </CardContent>
            {/* Separator or new card for Admin Info */}
            <CardHeader className="pt-6 border-t mt-6">
                <CardTitle className="text-xl flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary"/>Administrator Info (Primary Contact)</CardTitle>
                <CardDescription>Details of the main contact person for administrative purposes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField control={form.control} name="primaryContact_fullName" render={({ field }) => (
                        <FormItem><FormLabel>Admin Full Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="primaryContact_position" render={({ field }) => (
                        <FormItem><FormLabel>Admin Position*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger></FormControl>
                            <SelectContent>{contactPositionOptions.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select><FormMessage /></FormItem> )}/>
                    {watchedContactPosition === "Other" && <FormField control={form.control} name="primaryContact_positionOther" render={({ field }) => (
                        <FormItem><FormLabel>Specify Position*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>}
                    <FormField control={form.control} name="primaryContact_emailAddress" render={({ field }) => (
                        <FormItem><FormLabel>Admin Email*</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="primaryContact_phoneNumber" render={({ field }) => (
                        <FormItem><FormLabel>Admin Phone*</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                    <FormField control={form.control} name="primaryContact_nin" render={({ field }) => (
                        <FormItem className="md:col-span-2"><FormLabel>Admin NIN</FormLabel><FormControl><Input {...field} placeholder="National Identification Number" /></FormControl><FormMessage /></FormItem> )}/>
                </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
                Save Contact Settings
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
    