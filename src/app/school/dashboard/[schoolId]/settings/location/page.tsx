
// src/app/school/dashboard/[schoolId]/settings/location/page.tsx
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
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, MapPin } from 'lucide-react';

const districtOptions = ["Kampala", "Wakiso", "Mukono", "Jinja", "Mbarara", "Gulu", "Arua", "Lira", "Masaka", "Fort Portal", "Mbale", "Soroti", "Other"]; // Example

const locationSettingsSchema = z.object({
  district: z.string().min(1, "District is required"),
  districtOther: z.string().optional(),
  subcounty: z.string().min(1, "Subcounty is required"),
  parish: z.string().optional(),
  village: z.string().optional(),
  address: z.string().min(5, "Address is required").max(200),
  gpsCoordinatesLat: z.preprocess(v => v === "" ? undefined : parseFloat(String(v)), z.number().min(-90).max(90).optional().nullable()),
  gpsCoordinatesLng: z.preprocess(v => v === "" ? undefined : parseFloat(String(v)), z.number().min(-180).max(180).optional().nullable()),
}).superRefine((data, ctx) => {
  if (data.district === "Other" && !data.districtOther?.trim()) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Specify district", path: ["districtOther"] }); }
});

type LocationSettingsFormValues = z.infer<typeof locationSettingsSchema>;

export default function LocationSettingsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LocationSettingsFormValues>({
    resolver: zodResolver(locationSettingsSchema),
    defaultValues: {
      district: undefined, districtOther: "", subcounty: "", parish: "", village: "", address: "",
      gpsCoordinatesLat: undefined, gpsCoordinatesLng: undefined,
    },
  });

  const watchedDistrict = form.watch("district");

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
            district: fetchedSchool.district || undefined,
            districtOther: districtOptions.includes(fetchedSchool.district || "") ? "" : fetchedSchool.district || "",
            subcounty: fetchedSchool.subcounty || "",
            parish: fetchedSchool.parish || "",
            village: fetchedSchool.village || "",
            address: fetchedSchool.address || "",
            gpsCoordinatesLat: fetchedSchool.gpsCoordinates?.lat ?? undefined,
            gpsCoordinatesLng: fetchedSchool.gpsCoordinates?.lng ?? undefined,
          });
        } else {
          toast({ variant: "destructive", title: "Not Found", description: "School data not found." });
          router.push('/school/auth');
        }
      })
      .catch(err => toast({ variant: "destructive", title: "Error", description: "Could not load school details." }))
      .finally(() => setIsLoading(false));
  }, [schoolId, user, authLoading, router, toast, form]);

  const onSubmit = async (data: LocationSettingsFormValues) => {
    if (!user || !school) return;
    setIsSubmitting(true);
    try {
      const schoolDataToUpdate: Partial<School> = {
        district: data.district === "Other" ? (data.districtOther || data.district) : data.district,
        subcounty: data.subcounty,
        parish: data.parish || null,
        village: data.village || null,
        address: data.address,
        gpsCoordinates: (data.gpsCoordinatesLat != null && data.gpsCoordinatesLng != null) ? { lat: data.gpsCoordinatesLat, lng: data.gpsCoordinatesLng } : null,
      };
      await updateSchoolData(schoolId, schoolDataToUpdate);
      toast({ title: "Location Settings Updated", description: "School location details saved." });
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
        <CardTitle className="text-2xl flex items-center"><MapPin className="mr-3 h-6 w-6 text-primary"/>Location Details</CardTitle>
        <CardDescription>Manage the physical location information for your school.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField control={form.control} name="district" render={({ field }) => (
                <FormItem><FormLabel>District*</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger></FormControl>
                    <SelectContent>{districtOptions.map(o=><SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select><FormMessage />
                </FormItem> )}/>
              {watchedDistrict === "Other" && <FormField control={form.control} name="districtOther" render={({ field }) => (
                <FormItem><FormLabel>Specify District*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>}
              <FormField control={form.control} name="subcounty" render={({ field }) => (
                <FormItem><FormLabel>Subcounty*</FormLabel><FormControl><Input {...field} placeholder="e.g., Central Division" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="parish" render={({ field }) => (
                <FormItem><FormLabel>Parish</FormLabel><FormControl><Input {...field} placeholder="e.g., Nakasero" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="village" render={({ field }) => (
                <FormItem><FormLabel>Village</FormLabel><FormControl><Input {...field} placeholder="e.g., Kololo" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="md:col-span-2"><FormLabel>School Address / Plot Details*</FormLabel><FormControl><Textarea {...field} placeholder="e.g., Plot 123, Makerere Hill Road, Kampala" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="gpsCoordinatesLat" render={({ field }) => (
                <FormItem><FormLabel>GPS Latitude</FormLabel><FormControl><Input type="number" step="any" {...field} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ""} placeholder="e.g., 0.3136" /></FormControl><FormMessage /></FormItem> )}/>
              <FormField control={form.control} name="gpsCoordinatesLng" render={({ field }) => (
                <FormItem><FormLabel>GPS Longitude</FormLabel><FormControl><Input type="number" step="any" {...field} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)} value={field.value ?? ""} placeholder="e.g., 32.5811" /></FormControl><FormMessage /></FormItem> )}/>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
              {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2"/>}
              Save Location Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
    