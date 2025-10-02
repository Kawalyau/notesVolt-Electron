// src/app/school/dashboard/[schoolId]/communications/bulk-sms/page.tsx
"use client";

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School, SchoolClass, Student } from '@/types/school';
import { searchStudents } from './actions';
import { httpsCallable } from 'firebase/functions';
import { functions, firestore } from '@/config/firebase';
import { collection, query, where, getDocs, QueryConstraint } from 'firebase/firestore';


import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, MessageSquare, AlertTriangle, Users, RefreshCcw, UserPlus, X, Search as SearchIcon } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';


interface SendResult {
  totalRecipients: number;
  successfulSends: number;
  failedSends: number;
  errors: string[];
}

/**
 * Fetches unique guardian phone numbers for given class IDs.
 * This function is now moved inside the component to be used by the client-side logic.
 */
async function getGuardianPhoneNumbersForClasses(schoolId: string, classIds: string[]): Promise<string[]> {
  if (!schoolId || classIds.length === 0) return [];
  
  const studentsRef = collection(firestore, `schools/${schoolId}/students`);
  const qConstraints: QueryConstraint[] = [
    where('classId', 'in', classIds),
    where('status', '==', 'Active'),
  ];
  
  const q = query(studentsRef, ...qConstraints);
  const querySnapshot = await getDocs(q);
  
  const phoneNumbers = new Set<string>();
  querySnapshot.forEach(doc => {
    const student = doc.data() as Student;
    if (student.guardianPhone) {
      const normalizedPhone = student.guardianPhone.replace(/\s+/g, '');
      if (normalizedPhone.length >= 9) {
        phoneNumbers.add(normalizedPhone);
      }
    }
  });
  
  return Array.from(phoneNumbers);
}


export default function BulkSmsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSending, setIsSending] = useState(false);
  
  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [message, setMessage] = useState('');
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  // States for class selection
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());

  // States for individual student selection
  const [individualRecipients, setIndividualRecipients] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const fetchInitialData = useCallback(async (showLoadingToast = false) => {
    if (!user || !schoolId) return;
    if (showLoadingToast) {
        toast({ title: "Refreshing...", description: "Fetching latest school configuration." });
    }
    setIsLoadingData(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push(`/school/dashboard/${schoolId}`);
        return;
      }
      setSchool(fetchedSchool);

      if (schoolClasses.length === 0) { 
        const classes = await getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses');
        setSchoolClasses(classes.sort((a, b) => (a.class || "").localeCompare(b.class || "")));
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load school data." });
    } finally {
      setIsLoadingData(false);
    }
  }, [schoolId, user, toast, router, schoolClasses.length]);

  useEffect(() => {
    if (!authLoading) {
      fetchInitialData(false); 
    }
  }, [authLoading, fetchInitialData]);

  const handleSelectAllClasses = (checked: boolean | 'indeterminate') => {
    setSelectedClassIds(checked ? new Set(schoolClasses.map(c => c.id)) : new Set());
  };

  const handleClassSelectionChange = (classId: string, checked: boolean | 'indeterminate') => {
    const newSelection = new Set(selectedClassIds);
    if (checked) {
      newSelection.add(classId);
    } else {
      newSelection.delete(classId);
    }
    setSelectedClassIds(newSelection);
  };
  
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      setIsPopoverOpen(false);
      return;
    }
    setIsSearching(true);
    const results = await searchStudents(schoolId, query);
    setSearchResults(results.filter(s => !individualRecipients.some(r => r.id === s.id))); // Exclude already added
    setIsPopoverOpen(results.length > 0);
    setIsSearching(false);
  };

  const addRecipient = (student: Student) => {
    if (!individualRecipients.some(r => r.id === student.id)) {
      setIndividualRecipients(prev => [...prev, student]);
    }
    setSearchQuery('');
    setSearchResults([]);
    setIsPopoverOpen(false);
  };

  const removeRecipient = (studentId: string) => {
    setIndividualRecipients(prev => prev.filter(r => r.id !== studentId));
  };

  const { smsParts, characterCount, remainingChars } = useMemo(() => {
    const count = message.length;
    let parts = 0;
    let remaining = 0;

    if (count > 0) {
      const isGsm7 = /^[\u0000-\u007F]*$/.test(message);
      const singlePartLimit = isGsm7 ? 160 : 70;
      const multiPartLimit = isGsm7 ? 153 : 67;

      if (count <= singlePartLimit) {
        parts = 1;
        remaining = singlePartLimit - count;
      } else {
        parts = Math.ceil(count / multiPartLimit);
        remaining = (multiPartLimit * parts) - count;
      }
    }
    
    return { smsParts: parts, characterCount: count, remainingChars: remaining };
  }, [message]);

  const handleSendSms = async (activeTab: 'classes' | 'individuals') => {
    if (!message.trim()) {
      toast({ variant: "destructive", title: "Missing Message", description: "Please enter a message to send." });
      return;
    }
    
    setIsSending(true);
    setSendResult(null);

    let phoneNumbers: string[] = [];

    if (activeTab === 'classes') {
      if (selectedClassIds.size === 0) {
        toast({ variant: "destructive", title: "No Recipients", description: "Please select at least one class." });
        setIsSending(false);
        return;
      }
      phoneNumbers = await getGuardianPhoneNumbersForClasses(schoolId, Array.from(selectedClassIds));
    } else { // 'individuals'
      if (individualRecipients.length === 0) {
        toast({ variant: "destructive", title: "No Recipients", description: "Please select at least one student." });
        setIsSending(false);
        return;
      }
      phoneNumbers = Array.from(new Set(individualRecipients.map(r => r.guardianPhone).filter((p): p is string => !!p && p.length >= 9)));
    }
    
    if (phoneNumbers.length === 0) {
      toast({ variant: "destructive", title: "No Valid Phone Numbers", description: "No guardians with valid phone numbers found for the selected recipients." });
      setIsSending(false);
      return;
    }

    toast({ title: "Sending SMS...", description: `Preparing to send to ${phoneNumbers.length} recipients.` });
    
    const sendSmsFunction = httpsCallable(functions, 'sendSms');
    let successfulSends = 0;
    let failedSends = 0;
    const errors: string[] = [];

    const sendPromises = phoneNumbers.map(async (number) => {
      try {
        const result = await sendSmsFunction({
          schoolId: schoolId,
          recipient: number,
          message: message,
        });
        const data = result.data as { success: boolean, message: string }; 
        if (data.success) {
          successfulSends++;
        } else {
          failedSends++;
          errors.push(`Failed for ${number}: ${data.message}`);
        }
      } catch (error: any) {
        failedSends++;
        const errorMessage = error.message || "An unknown error occurred.";
        errors.push(`Failed for ${number}: ${errorMessage}`);
        console.error(`Error calling sendSms for ${number}:`, error);
      }
    });

    await Promise.all(sendPromises);

    setSendResult({
        totalRecipients: phoneNumbers.length,
        successfulSends,
        failedSends,
        errors,
    });
    
    toast({
        title: "SMS Process Completed",
        description: `Sent: ${successfulSends}, Failed: ${failedSends}.`,
    });

    setIsSending(false);
  };

  if (authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const smsEnabled = school?.enableSmsNotifications && school?.smsConfig?.egoSms?.username && school?.smsConfig?.egoSms?.password && school?.smsConfig?.egoSms?.sender;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
             <CardTitle className="text-2xl flex items-center"><Send className="mr-3 h-6 w-6 text-primary"/>Send Bulk SMS</CardTitle>
             <Button variant="outline" size="sm" onClick={() => fetchInitialData(true)} disabled={isLoadingData}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`}/>
                Refresh Config
             </Button>
          </div>
          <CardDescription>Compose and send SMS messages to parents of students.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoadingData ? (
             <div className="flex justify-center items-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : !smsEnabled ? (
            <div className="p-3 bg-destructive/10 border-l-4 border-destructive text-destructive-foreground rounded-md">
              <AlertTriangle className="inline h-5 w-5 mr-2" />
              SMS sending is not configured. Please enable it and provide EgoSMS API credentials in the School Settings.
            </div>
          ) : (
            <Tabs defaultValue="classes">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="classes">Send to Classes</TabsTrigger>
                <TabsTrigger value="individuals">Send to Individuals</TabsTrigger>
              </TabsList>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                <div className="md:col-span-2">
                  <h4 className="font-semibold mb-2">2. Compose Message</h4>
                  <Textarea
                    placeholder="Type your message here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={9}
                    className="text-base"
                    disabled={!smsEnabled || isSending}
                  />
                  <div className="text-xs text-muted-foreground mt-2 flex justify-end gap-4">
                    <span>Characters: {characterCount}</span>
                    <span>Parts: {smsParts}</span>
                    <span>Remaining: {remainingChars}</span>
                  </div>
                </div>
                <div className="md:col-span-1">
                  <h4 className="font-semibold mb-2">1. Select Recipients</h4>
                  <TabsContent value="classes">
                    <ScrollArea className="h-64 border rounded-md p-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 pb-2 border-b">
                          <Checkbox id="select-all-classes-bulk-sms" checked={selectedClassIds.size === schoolClasses.length && schoolClasses.length > 0} onCheckedChange={handleSelectAllClasses} />
                          <Label htmlFor="select-all-classes-bulk-sms" className="font-semibold">Select All Classes</Label>
                        </div>
                        {schoolClasses.map((cls) => (
                          <div key={cls.id} className="flex items-center space-x-2">
                            <Checkbox id={`class-select-sms-${cls.id}`} checked={selectedClassIds.has(cls.id)} onCheckedChange={(checked) => handleClassSelectionChange(cls.id, checked)} />
                            <Label htmlFor={`class-select-sms-${cls.id}`} className="font-normal text-sm">{cls.code ? `${cls.class} (${cls.code})` : cls.class}</Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button onClick={() => handleSendSms('classes')} disabled={isSending || selectedClassIds.size === 0 || !message.trim()} className="w-full mt-4">
                      {isSending ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2" />}
                      Send to Parents of {selectedClassIds.size} Class(es)
                    </Button>
                  </TabsContent>
                  <TabsContent value="individuals">
                    <div className="space-y-3">
                      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                        <PopoverTrigger asChild>
                          <div className="relative">
                            <Input placeholder="Search student name/reg..." value={searchQuery} onChange={handleSearchChange} className="pl-8" />
                            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-1">
                          {isSearching ? <div className="p-2 text-sm text-center">Searching...</div> :
                            searchResults.length > 0 ? (
                              <ScrollArea className="max-h-48">
                                {searchResults.map(student => (
                                  <div key={student.id} onClick={() => addRecipient(student)} className="flex justify-between items-center p-2 hover:bg-muted cursor-pointer rounded-md">
                                    <span className="text-sm">{student.firstName} {student.lastName}</span>
                                    <span className="text-xs text-muted-foreground">{student.studentRegistrationNumber}</span>
                                  </div>
                                ))}
                              </ScrollArea>
                            ) : <div className="p-2 text-sm text-center text-muted-foreground">No results</div>
                          }
                        </PopoverContent>
                      </Popover>
                      <ScrollArea className="h-48 border rounded-md p-2">
                        {individualRecipients.length === 0 ? <p className="text-xs text-center text-muted-foreground p-4">No individual recipients selected.</p> : (
                          <div className="space-y-1">
                            {individualRecipients.map(rec => (
                              <Badge key={rec.id} variant="secondary" className="flex justify-between items-center py-1">
                                {rec.firstName} {rec.lastName}
                                <button onClick={() => removeRecipient(rec.id)} className="ml-2 rounded-full hover:bg-background"><X className="h-3 w-3"/></button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                       <Button onClick={() => handleSendSms('individuals')} disabled={isSending || individualRecipients.length === 0 || !message.trim()} className="w-full mt-4">
                          {isSending ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2" />}
                          Send to {individualRecipients.length} Student(s)
                        </Button>
                    </div>
                  </TabsContent>
                </div>
              </div>
            </Tabs>
          )}
        </CardContent>
        {!isLoadingData && smsEnabled && sendResult && (
          <CardFooter>
            <div className="p-4 border rounded-md bg-muted/50 w-full">
              <h4 className="font-semibold mb-2">Sending Results</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <p><strong>Total Recipients:</strong> {sendResult.totalRecipients}</p>
                <p className="text-green-600"><strong>Successful:</strong> {sendResult.successfulSends}</p>
                <p className="text-destructive"><strong>Failed:</strong> {sendResult.failedSends}</p>
              </div>
              {sendResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Error details:</p>
                  <ScrollArea className="h-20 text-xs text-destructive mt-1">
                    <ul>{sendResult.errors.map((err, i) => <li key={i}>{err}</li>)}</ul>
                  </ScrollArea>
                </div>
              )}
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
