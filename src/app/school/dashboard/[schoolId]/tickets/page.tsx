
// src/app/school/dashboard/[schoolId]/tickets/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById, getSchoolSubcollectionItems, addSchoolSubcollectionItem, updateSchoolSubcollectionItem } from '@/services/schoolService';
import type { School, Ticket, TicketStatus, TicketCategory, TicketPriority, TicketMessage, Student, SchoolClass } from '@/types/school';
import { Timestamp, serverTimestamp, orderBy } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, TicketIcon, PlusCircle, Filter, MessageSquare, ArrowRight, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const ticketCategories: TicketCategory[] = ['Billing', 'Academic', 'Technical', 'General Inquiry'];
const ticketStatuses: TicketStatus[] = ['Open', 'Pending', 'Resolved', 'Closed'];
const ticketPriorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

export default function TicketsPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user: adminUser, userProfile } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // New ticket form state
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketDescription, setNewTicketDescription] = useState("");
  const [newTicketCategory, setNewTicketCategory] = useState<TicketCategory>("General Inquiry");
  const [newTicketPriority, setNewTicketPriority] = useState<TicketPriority>("Medium");
  const [newTicketStudentId, setNewTicketStudentId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const ticketsData = await getSchoolSubcollectionItems<Ticket>(schoolId, 'tickets', [orderBy('createdAt', 'desc')]);
      setTickets(ticketsData);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load tickets." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    fetchTickets();
    const fetchStudentsAndClasses = async () => {
        if (!schoolId) return;
        const [studentData, classData] = await Promise.all([
             getSchoolSubcollectionItems<Student>(schoolId, 'students'),
             getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses')
        ]);
        setStudents(studentData);
        setSchoolClasses(classData);
    };
    fetchStudentsAndClasses();
  }, [fetchTickets, schoolId]);

  const handleCreateTicket = async () => {
    if (!newTicketSubject || !newTicketDescription || !adminUser || !userProfile) {
      toast({ variant: "destructive", title: "Missing Information", description: "Subject, description, and admin profile are required." });
      return;
    }
    setIsSubmitting(true);
    
    const selectedStudent = newTicketStudentId ? students.find(s => s.id === newTicketStudentId) : null;
    const studentClass = selectedStudent ? schoolClasses.find(c => c.id === selectedStudent.classId) : null;
    const className = studentClass?.class || null;

    try {
        const ticketNumber = `T${Date.now()}`;
        const newTicketData: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'> = {
            ticketNumber,
            subject: newTicketSubject,
            description: newTicketDescription,
            category: newTicketCategory,
            priority: newTicketPriority,
            status: 'Open',
            submittedBy: { name: userProfile.displayName || "Admin", phone: "", email: userProfile.email },
            studentId: selectedStudent?.id || null,
            studentName: selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : null,
            studentRegNo: selectedStudent?.studentRegistrationNumber || null,
            className: className,
        };
        await addSchoolSubcollectionItem(schoolId, 'tickets', newTicketData);
        toast({ title: "Ticket Created Successfully" });
        setIsCreateDialogOpen(false);
        fetchTickets();
        // Reset form
        setNewTicketSubject(""); setNewTicketDescription(""); setNewTicketCategory("General Inquiry");
        setNewTicketPriority("Medium"); setNewTicketStudentId(null);
    } catch (error: any) {
        toast({ variant: "destructive", title: "Failed to Create Ticket", description: error.message });
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleViewTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setMessages([]); // Clear previous messages
    try {
        const messagesData = await getSchoolSubcollectionItems<TicketMessage>(schoolId, `tickets/${ticket.id}/messages`, [orderBy('createdAt', 'asc')]);
        setMessages(messagesData);
    } catch(e) {
        toast({variant: "destructive", title: "Error", description: "Could not load ticket conversation."})
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedTicket || !adminUser || !userProfile) return;
    setIsSendingMessage(true);
    try {
        const messageData: Omit<TicketMessage, 'id' | 'createdAt'> = {
            content: newMessage,
            senderId: adminUser.uid,
            senderName: userProfile.displayName || "Admin"
        };
        await addSchoolSubcollectionItem(schoolId, `tickets/${selectedTicket.id}/messages`, messageData);
        setNewMessage("");
        const newMessages = await getSchoolSubcollectionItems<TicketMessage>(schoolId, `tickets/${selectedTicket.id}/messages`, [orderBy('createdAt', 'asc')]);
        setMessages(newMessages);
    } catch (error: any) {
        toast({variant: "destructive", title: "Send Failed", description: error.message});
    } finally {
        setIsSendingMessage(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: TicketStatus, priority: TicketPriority) => {
    try {
        await updateSchoolSubcollectionItem(schoolId, 'tickets', ticketId, { status, priority });
        toast({title: "Ticket Updated"});
        setSelectedTicket(prev => prev ? {...prev, status, priority} : null);
        fetchTickets(); // Refresh main list
    } catch(e:any) {
        toast({variant: "destructive", title: "Update Failed", description: e.message});
    }
  };

  const getBadgeColor = (status: TicketStatus) => {
    switch(status) {
        case 'Open': return 'bg-blue-500';
        case 'Pending': return 'bg-yellow-500';
        case 'Resolved': return 'bg-green-500';
        case 'Closed': return 'bg-gray-500';
        default: return 'bg-gray-400';
    }
  }


  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle className="text-2xl flex items-center">
                <TicketIcon className="mr-3 h-6 w-6 text-primary"/>
                Support Tickets
              </CardTitle>
              <CardDescription>Manage inquiries and support requests from parents and staff.</CardDescription>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                    <Button size="sm"><PlusCircle className="mr-2 h-4 w-4"/>Create New Ticket</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Create New Ticket</DialogTitle>
                        <DialogDescription>Manually log a new inquiry or issue.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="subject" className="text-right">Subject*</Label>
                            <Input id="subject" value={newTicketSubject} onChange={(e)=>setNewTicketSubject(e.target.value)} className="col-span-3"/>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="studentId" className="text-right">Link to Student (Optional)</Label>
                            <Select value={newTicketStudentId || ""} onValueChange={(val) => setNewTicketStudentId(val === "none" ? null : val)}>
                                <SelectTrigger className="col-span-3"><SelectValue placeholder="Select a student..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No specific student</SelectItem>
                                    {students.map(s => <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.studentRegistrationNumber})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="description" className="text-right">Description*</Label>
                            <Textarea id="description" value={newTicketDescription} onChange={(e)=>setNewTicketDescription(e.target.value)} className="col-span-3" rows={4}/>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Category*</Label>
                            <Select value={newTicketCategory} onValueChange={(val) => setNewTicketCategory(val as TicketCategory)}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>{ticketCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                         <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Priority*</Label>
                            <Select value={newTicketPriority} onValueChange={(val) => setNewTicketPriority(val as TicketPriority)}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>{ticketPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateTicket} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin mr-2"/> : null}Create Ticket</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4">
                     <ScrollArea className="h-[60vh] border rounded-lg">
                        {tickets.length === 0 ? <p className="text-center p-4 text-muted-foreground">No tickets found.</p> :
                        tickets.map(ticket => (
                            <div key={ticket.id} onClick={() => handleViewTicket(ticket)} className={`p-3 border-b cursor-pointer hover:bg-muted/50 ${selectedTicket?.id === ticket.id ? 'bg-primary/10' : ''}`}>
                                <div className="flex justify-between items-start">
                                    <span className="font-semibold text-sm line-clamp-1 pr-2">{ticket.subject}</span>
                                    <Badge className={`${getBadgeColor(ticket.status)} text-white text-[10px]`}>{ticket.status}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    #{ticket.ticketNumber} &bull; {ticket.studentName || ticket.submittedBy?.name || 'Unknown Submitter'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Opened: {ticket.createdAt ? formatDistanceToNow(new Date((ticket.createdAt as Timestamp).toDate()), { addSuffix: true }) : 'N/A'}
                                </p>
                            </div>
                        ))}
                    </ScrollArea>
                </div>
                <div className="md:col-span-8">
                    {selectedTicket ? (
                        <Card className="h-full flex flex-col">
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-lg">{selectedTicket.subject}</CardTitle>
                                        <CardDescription>#{selectedTicket.ticketNumber} &bull; Category: {selectedTicket.category}</CardDescription>
                                    </div>
                                     <div className="flex gap-2">
                                        <Select value={selectedTicket.status} onValueChange={(val) => handleUpdateTicketStatus(selectedTicket.id, val as TicketStatus, selectedTicket.priority)}>
                                            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue/></SelectTrigger>
                                            <SelectContent>{ticketStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Select value={selectedTicket.priority} onValueChange={(val) => handleUpdateTicketStatus(selectedTicket.id, selectedTicket.status, val as TicketPriority)}>
                                            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue/></SelectTrigger>
                                            <SelectContent>{ticketPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                        </Select>
                                     </div>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-grow overflow-y-auto space-y-4">
                                <div className="text-xs space-y-1 p-2 rounded-md bg-muted/50">
                                    <p><strong>Submitter:</strong> {selectedTicket.submittedBy?.name || 'N/A'} ({selectedTicket.submittedBy?.phone || 'N/A'})</p>
                                    {selectedTicket.studentName && <p><strong>Linked Student:</strong> {selectedTicket.studentName} ({selectedTicket.studentRegNo})</p>}
                                </div>
                                 <p className="text-sm border p-2 rounded-md">{selectedTicket.description}</p>
                                <Separator/>
                                <div className="space-y-4">
                                    {messages.map(msg => (
                                        <div key={msg.id} className={`flex gap-2.5 ${adminUser && msg.senderId === adminUser.uid ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`flex flex-col w-full max-w-[320px] leading-1.5 p-3 border-gray-200 rounded-xl ${adminUser && msg.senderId === adminUser.uid ? 'bg-primary text-primary-foreground rounded-tr-none' : 'bg-muted rounded-tl-none'}`}>
                                                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                                                    <span className="text-sm font-semibold">{msg.senderName}</span>
                                                    <span className="text-xs font-normal opacity-70">{msg.createdAt ? formatDistanceToNow(new Date((msg.createdAt as Timestamp).toDate()), { addSuffix: true }) : 'sending...'}</span>
                                                </div>
                                                <p className="text-sm font-normal py-1.5">{msg.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                             <CardFooter className="pt-4 border-t">
                                <div className="flex w-full items-start gap-2">
                                    <Textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your reply..." rows={2} disabled={isSendingMessage} />
                                    <Button onClick={handleSendMessage} disabled={isSendingMessage || !newMessage.trim()}>{isSendingMessage ? <Loader2 className="animate-spin"/> : <MessageSquare className="h-5 w-5"/>}</Button>
                                </div>
                            </CardFooter>
                        </Card>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full border rounded-lg bg-muted/50 p-8 text-center">
                            <TicketIcon className="h-16 w-16 text-muted-foreground mb-4"/>
                            <p className="text-muted-foreground">Select a ticket to view its details and conversation.</p>
                        </div>
                    )}
                </div>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
