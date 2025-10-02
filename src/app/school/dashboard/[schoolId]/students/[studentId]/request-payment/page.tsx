// src/app/school/dashboard/[schoolId]/students/[studentId]/request-payment/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { firestore } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { Student, School } from '@/types/school';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ShieldAlert, CreditCard, Send } from 'lucide-react';

export const dynamic = 'force-dynamic';

const paymentSchema = z.object({
  channelCode: z.enum(["MTN_UG", "AIRTEL_UG"], { required_error: "Payment channel is required."}),
  phoneNumber: z.string().min(10, "Valid phone number required (e.g., 07XXXXXXXX)").max(12), // Assuming 07XXXXXXXX or 2567XXXXXXXX
  amount: z.preprocess(
    (val) => parseFloat(String(val)),
    z.number().positive("Amount must be a positive number.")
  ),
  studentReference: z.string(), // This will be pre-filled
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function RequestSchoolPayPaymentPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const studentId = params.studentId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      channelCode: "MTN_UG",
      phoneNumber: "",
      amount: 0,
      studentReference: "",
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/students/${studentId}/request-payment`);
      return;
    }

    if (schoolId && studentId && user) {
      setIsLoadingData(true);
      const schoolDocRef = doc(firestore, 'schools', schoolId);
      const studentDocRef = doc(firestore, `schools/${schoolId}/students`, studentId);

      Promise.all([getDoc(schoolDocRef), getDoc(studentDocRef)])
        .then(([schoolSnap, studentSnap]) => {
          if (schoolSnap.exists()) {
            const schoolData = { id: schoolSnap.id, ...schoolSnap.data() } as School;
            setSchool(schoolData);
            if (schoolData.adminUids.includes(user.uid)) {
              setIsAdminForSchool(true);
              if (studentSnap.exists()) {
                const studentData = { id: studentSnap.id, ...studentSnap.data() } as Student;
                setStudent(studentData);
                form.setValue("studentReference", studentData.studentRegistrationNumber);
              } else {
                toast({ variant: "destructive", title: "Error", description: "Student not found." });
                setStudent(null);
              }
            } else {
              setIsAdminForSchool(false);
            }
          } else {
            toast({ variant: "destructive", title: "Error", description: "School not found." });
            setSchool(null);
          }
        })
        .catch(error => {
          console.error("Error fetching school/student data:", error);
          toast({ variant: "destructive", title: "Error", description: "Could not load required data." });
        })
        .finally(() => setIsLoadingData(false));
    }
  }, [schoolId, studentId, user, authLoading, router, toast, form]);

  const onSubmit = async (values: PaymentFormValues) => {
    setIsSubmitting(true);
    toast({ title: "Initiating Payment", description: "Sending request to SchoolPay..." });

    const SCHOOLPAY_API_URL = "https://schoolpaytest.servicecops.com/uatpaymentapi/AndroidRS/RequestSchoolpayPaymentForChannel";
    
    const formBody = new URLSearchParams({
      channelCode: values.channelCode,
      phoneNumber: values.phoneNumber,
      studentReference: values.studentReference,
      amount: values.amount.toString(),
    }).toString();

    try {
      const response = await fetch(SCHOOLPAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody,
      });

      const responseText = await response.text();
      console.log("Raw SchoolPay API Response Text (RequestSchoolpayPaymentForChannel):", responseText);
      
      if (!response.ok) {
        console.error("SchoolPay API Error (RequestSchoolpayPaymentForChannel):", {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          headers: Array.from(response.headers.entries()),
          body: responseText,
        });
        toast({
          variant: "destructive",
          title: "SchoolPay API Error",
          description: `Failed with status ${response.status}. Response: ${responseText.substring(0, 100)}... Check console for details.`,
          duration: 7000,
        });
        setIsSubmitting(false);
        return;
      }

      try {
        const responseData = JSON.parse(responseText);
        console.log("Parsed SchoolPay API Response (RequestSchoolpayPaymentForChannel):", responseData);
        if (responseData.returnCode === "0" || responseData.returnCode === 0) {
          toast({
            title: "Payment Request Successful",
            description: responseData.returnMessage || "SchoolPay request sent. Check phone for USSD prompt.",
            duration: 7000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Payment Request Failed by SchoolPay",
            description: responseData.returnMessage || "SchoolPay returned an error.",
            duration: 7000,
          });
        }
      } catch (parseError) {
        console.warn("SchoolPay API response was not JSON, but HTTP status was OK (RequestSchoolpayPaymentForChannel):", parseError);
        toast({
          title: "Payment Request Sent (Check Phone)",
          description: `Request processed (HTTP ${response.status}). Check payer's phone for prompt. Raw response: ${responseText.substring(0,100)}...`,
          duration: 9000,
        });
      }

    } catch (error: any) {
      console.error("Client-side fetch error for SchoolPay (RequestSchoolpayPaymentForChannel):", error);
      let description = error.message || "An unexpected network error occurred.";
      if (error.name === 'TypeError' && error.message.toLowerCase().includes('failed to fetch')) {
        description = "A network error occurred. This could be due to CORS policy, the API server being unreachable, or no internet connection. Please check browser console (Network tab) for more details. If this is a CORS issue, this API call needs to be proxied through a backend.";
      }
      toast({
        variant: "destructive",
        title: "Network Request Error",
        description: description,
        duration: 10000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoadingData || authLoading) {
    return <div className="flex justify-center items-center min-h-screen-minus-navbar"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!user || !isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to perform this action.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }
  
  if (!student) {
     return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Student Not Found</h1>
        <p className="text-muted-foreground mb-6">The student details could not be loaded.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} variant="outline">Back to Student List</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <div className="mb-6">
        <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Student List
        </Button>
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <CreditCard className="mr-3 h-8 w-8" /> Request SchoolPay Payment
        </h1>
        <p className="text-muted-foreground">
          For student: <span className="font-semibold">{student.firstName} {student.lastName}</span> (Reg No: {student.studentRegistrationNumber})
        </p>
         <p className="text-muted-foreground">
          School: <span className="font-semibold">{school?.name}</span>
        </p>
      </div>

      <Card className="max-w-lg mx-auto shadow-lg">
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
          <CardDescription>Enter the payer's phone number and the amount to request via SchoolPay.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
               <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md">
                  <p className="text-sm">
                    <ShieldAlert className="inline h-4 w-4 mr-1" /> 
                    **Security Notice:** This form makes a client-side API call. If SchoolPay's `RequestSchoolpayPaymentForChannel` endpoint requires any secrets not entered by the user here, this call should be proxied via a secure backend (e.g., Firebase Cloud Function) to protect those secrets. Please confirm with SchoolPay if this endpoint is designed for direct client-side invocation.
                  </p>
              </div>
              <FormField
                control={form.control}
                name="studentReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Student Reference (Registration No.)</FormLabel>
                    <FormControl><Input {...field} readOnly disabled className="bg-muted/50"/></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channelCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Channel*</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="MTN_UG">MTN Uganda</SelectItem>
                        <SelectItem value="AIRTEL_UG">Airtel Uganda</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payer's Phone Number*</FormLabel>
                    <FormControl><Input type="tel" {...field} placeholder="e.g., 0774008833" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (UGX)*</FormLabel>
                    <FormControl><Input type="number" step="1" {...field} placeholder="e.g., 9000" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90">
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 h-5 w-5" />}
                {isSubmitting ? "Processing..." : "Request Payment"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
