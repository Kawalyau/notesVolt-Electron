// src/app/school/create/page.tsx
"use client";

import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { addDoc, collection, serverTimestamp, arrayUnion, writeBatch, doc } from "firebase/firestore";
import { firestore } from "@/config/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Building, PlusCircle } from "lucide-react";

const schoolFormSchema = z.object({
  name: z.string().min(3, "School name must be at least 3 characters").max(100),
  schoolType: z.string().min(1, "School type is required"),
  ownership: z.string().min(1, "Ownership is required"),
  level: z.string().min(1, "School level is required"),
  district: z.string().min(1, "District is required"),
  subcounty: z.string().min(1, "Subcounty is required"),
  address: z.string().min(1, "Address is required"),
  contactFullName: z.string().min(2, "Contact person's name is required"),
  contactPosition: z.string().min(1, "Position is required"),
  contactPhoneNumber: z.string().min(10, "Valid phone number required"),
  contactEmailAddress: z.string().email("Invalid email address"),
});

type SchoolFormValues = z.infer<typeof schoolFormSchema>;

export default function CreateSchoolPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(schoolFormSchema),
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/school/create');
    }
  }, [user, authLoading, router]);

  const onSubmit = async (data: SchoolFormValues) => {
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "You must be logged in to create a school." });
      return;
    }
    setIsSubmitting(true);

    try {
      const batch = writeBatch(firestore);
      const schoolCollectionRef = collection(firestore, "schools");
      const newSchoolRef = doc(schoolCollectionRef);

      batch.set(newSchoolRef, {
        name: data.name,
        schoolType: data.schoolType,
        ownership: data.ownership,
        level: data.level,
        district: data.district,
        subcounty: data.subcounty,
        address: data.address,
        primaryContact: {
          fullName: data.contactFullName,
          position: data.contactPosition,
          phoneNumber: data.contactPhoneNumber,
          emailAddress: data.contactEmailAddress,
        },
        adminUids: [user.uid],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Also add the admin UID to the user's document if needed, though this is often handled by school's adminUids array
      // const userDocRef = doc(firestore, "users", user.uid);
      // batch.update(userDocRef, { managedSchoolIds: arrayUnion(newSchoolRef.id) });
      
      await batch.commit();

      toast({ title: "School Created Successfully!", description: `You can now manage ${data.name}.` });
      router.push(`/school/dashboard/${newSchoolRef.id}`);

    } catch (error: any) {
      console.error("Error creating school:", error);
      toast({ variant: "destructive", title: "Creation Failed", description: error.message || "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="flex items-center justify-center min-h-screen-minus-navbar bg-muted/30 p-4">
        <Card className="w-full max-w-2xl shadow-xl">
            <CardHeader>
                <CardTitle className="text-2xl flex items-center text-primary"><Building className="mr-3"/>Register a New School</CardTitle>
                <CardDescription>Fill out the form below to create a new school profile in the system.</CardDescription>
            </CardHeader>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>School Name*</FormLabel><FormControl><Input {...field} placeholder="e.g., Kampala Parents School"/></FormControl><FormMessage/></FormItem>)}/>
                            <FormField control={form.control} name="level" render={({ field }) => (<FormItem><FormLabel>School Level*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Level"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Primary">Primary</SelectItem><SelectItem value="Secondary">Secondary</SelectItem><SelectItem value="Tertiary">Tertiary/Vocational</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                            <FormField control={form.control} name="schoolType" render={({ field }) => (<FormItem><FormLabel>School Type*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Type"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Day">Day</SelectItem><SelectItem value="Boarding">Boarding</SelectItem><SelectItem value="Day and Boarding">Day and Boarding</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                            <FormField control={form.control} name="ownership" render={({ field }) => (<FormItem><FormLabel>Ownership*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Ownership"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Private">Private</SelectItem><SelectItem value="Government">Government</SelectItem><SelectItem value="Community">Community</SelectItem><SelectItem value="Faith-Based">Faith-Based</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormField control={form.control} name="district" render={({ field }) => (<FormItem><FormLabel>District*</FormLabel><FormControl><Input {...field} placeholder="e.g., Wakiso"/></FormControl><FormMessage/></FormItem>)}/>
                            <FormField control={form.control} name="subcounty" render={({ field }) => (<FormItem><FormLabel>Subcounty*</FormLabel><FormControl><Input {...field} placeholder="e.g., Kira"/></FormControl><FormMessage/></FormItem>)}/>
                            <FormField control={form.control} name="address" render={({ field }) => (<FormItem><FormLabel>Address/Plot*</FormLabel><FormControl><Input {...field} placeholder="e.g., Plot 123, Namugongo Rd"/></FormControl><FormMessage/></FormItem>)}/>
                        </div>
                        <h4 className="font-semibold pt-4 border-t">Primary Contact Person</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <FormField control={form.control} name="contactFullName" render={({ field }) => (<FormItem><FormLabel>Full Name*</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>)}/>
                             <FormField control={form.control} name="contactPosition" render={({ field }) => (<FormItem><FormLabel>Position*</FormLabel><Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select Position"/></SelectTrigger></FormControl><SelectContent><SelectItem value="Head Teacher">Head Teacher</SelectItem><SelectItem value="Director">Director</SelectItem><SelectItem value="ICT Admin">ICT Admin</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select><FormMessage/></FormItem>)}/>
                             <FormField control={form.control} name="contactPhoneNumber" render={({ field }) => (<FormItem><FormLabel>Phone Number*</FormLabel><FormControl><Input {...field} type="tel"/></FormControl><FormMessage/></FormItem>)}/>
                             <FormField control={form.control} name="contactEmailAddress" render={({ field }) => (<FormItem><FormLabel>Email*</FormLabel><FormControl><Input {...field} type="email"/></FormControl><FormMessage/></FormItem>)}/>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <PlusCircle className="mr-2"/>}
                            Create School
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    </div>
  );
}
