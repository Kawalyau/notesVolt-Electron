// src/app/school/dashboard/[schoolId]/calendar/page.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, updateSchoolSubcollectionItem, deleteSchoolSubcollectionItem } from '@/services/schoolService';
import type { School, Event, Task, TaskStatus } from '@/types/school';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Plus, Edit, Trash2, Loader2, CheckCircle, GripVertical, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const taskStatuses: TaskStatus[] = ['Todo', 'In Progress', 'Done'];

export default function SchoolCalendarPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { user, userProfile } = useAuth(); 
  const { toast } = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const fetchCalendarData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const [eventsData, tasksData] = await Promise.all([
        getSchoolSubcollectionItems<Event>(schoolId, 'events'),
        getSchoolSubcollectionItems<Task>(schoolId, 'tasks'),
      ]);
      setEvents(eventsData);
      setTasks(tasksData);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load calendar and task data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast]);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Event handlers
  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setEditingEvent(null); // Reset editing event
    setIsEventDialogOpen(true);
  };
  
  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setSelectedDate(new Date((event.date as any).seconds * 1000));
    setIsEventDialogOpen(true);
  }

  const handleSaveEvent = async (eventData: { title: string; description: string; location: string; date: Date; }) => {
    setIsSubmitting(true);
    try {
      const dataToSave: Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'imageUrl' | 'isPublished'> = {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        date: eventData.date,
      };
      if (editingEvent) {
        await updateSchoolSubcollectionItem(schoolId, 'events', editingEvent.id, dataToSave);
        toast({ title: "Event Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'events', dataToSave);
        toast({ title: "Event Added" });
      }
      setIsEventDialogOpen(false);
      fetchCalendarData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'events', eventId);
      toast({ title: "Event Deleted" });
      setIsEventDialogOpen(false);
      fetchCalendarData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };

  // Task handlers
  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsTaskDialogOpen(true);
  }

  const handleSaveTask = async (taskData: { title: string; description: string; dueDate?: Date | null; status: TaskStatus; priority: 'Low' | 'Medium' | 'High' }) => {
    if (!userProfile) {
        toast({ variant: "destructive", title: "Error", description: "Admin user profile not loaded. Please try again." });
        return;
    }
    setIsSubmitting(true);
    try {
      const dataToSave: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
        title: taskData.title,
        description: taskData.description,
        status: taskData.status,
        dueDate: taskData.dueDate || null,
        priority: taskData.priority,
        assignedToId: userProfile.uid,
        assignedToName: userProfile.displayName || "Admin",
      };
      if (editingTask) {
        await updateSchoolSubcollectionItem(schoolId, 'tasks', editingTask.id, dataToSave);
        toast({ title: "Task Updated" });
      } else {
        await addSchoolSubcollectionItem(schoolId, 'tasks', dataToSave);
        toast({ title: "Task Added" });
      }
      setIsTaskDialogOpen(false);
      fetchCalendarData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
     if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteSchoolSubcollectionItem(schoolId, 'tasks', taskId);
      toast({ title: "Task Deleted" });
      setIsTaskDialogOpen(false);
      fetchCalendarData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center"><CalendarIcon className="mr-2 h-6 w-6 text-primary"/>School Calendar & Tasks</CardTitle>
          <CardDescription>Manage school-wide events, holidays, and administrative tasks.</CardDescription>
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              onDayClick={handleDayClick}
              className="w-full"
              components={{
                DayContent: ({ date, ...props }) => {
                  const dayEvents = events.filter(event => format(new Date((event.date as any).seconds * 1000), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'));
                  return (
                    <div className="relative h-full w-full">
                      <time dateTime={format(date, 'yyyy-MM-dd')} className="relative z-10">{format(date, 'd')}</time>
                      {dayEvents.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {dayEvents.slice(0, 3).map(e => <div key={e.id} className="h-1.5 w-1.5 rounded-full bg-primary"/>)}
                        </div>
                      )}
                    </div>
                  );
                },
              }}
            />
          </CardContent>
        </Card>
        <div className="space-y-4">
            <Card>
                <CardHeader><CardTitle className="text-lg">Events for {format(selectedDate || new Date(), 'PPP')}</CardTitle></CardHeader>
                <CardContent>
                    {events.filter(event => format(new Date((event.date as any).seconds * 1000), 'yyyy-MM-dd') === format(selectedDate || new Date(), 'yyyy-MM-dd')).length > 0 ? (
                        <ul className="space-y-2">
                            {events.filter(event => format(new Date((event.date as any).seconds * 1000), 'yyyy-MM-dd') === format(selectedDate || new Date(), 'yyyy-MM-dd')).map(e => (
                                <li key={e.id} className="text-sm p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEditEvent(e)}>{e.title}</li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">No events for this day.</p>}
                </CardContent>
                 <CardFooter>
                    <Button size="sm" onClick={() => { setEditingEvent(null); setIsEventDialogOpen(true); }}><Plus className="mr-2 h-4 w-4"/>Add Event</Button>
                </CardFooter>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">Tasks</CardTitle>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingTask(null); setIsTaskDialogOpen(true); }}><Plus className="h-4 w-4"/></Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {tasks.length > 0 ? (
                         <ul className="space-y-2">
                            {tasks.filter(t => t.status !== 'Done').slice(0, 5).map(t => (
                                <li key={t.id} className="text-sm p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => handleEditTask(t)}>{t.title}</li>
                            ))}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">No tasks created yet.</p>}
                </CardContent>
            </Card>
        </div>
      </div>
      
      {/* Event Dialog */}
      <EventDialog 
        isOpen={isEventDialogOpen} 
        onOpenChange={setIsEventDialogOpen}
        event={editingEvent}
        selectedDate={selectedDate}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        isSubmitting={isSubmitting}
      />
      
      {/* Task Dialog */}
      <TaskDialog
        isOpen={isTaskDialogOpen}
        onOpenChange={setIsTaskDialogOpen}
        task={editingTask}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

// Event Dialog Component
const EventDialog = ({ isOpen, onOpenChange, event, selectedDate, onSave, onDelete, isSubmitting }: any) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<Date | undefined>();

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
      setDate(new Date((event.date as any).seconds * 1000));
    } else {
      setTitle('');
      setDescription('');
      setLocation('');
      setDate(selectedDate);
    }
  }, [event, selectedDate]);

  const handleSaveClick = () => {
    if (title && date) onSave({ title, description, location, date });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Edit Event" : "Add New Event"}</DialogTitle>
          <DialogDescription>
            {event ? `Editing event for ${format(date || new Date(), 'PPP')}` : `Add a new event for ${format(selectedDate || new Date(), 'PPP')}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event Title*" />
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." />
          <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" />
          <DatePicker date={date} onDateChange={setDate} />
        </div>
        <DialogFooter>
          {event && <Button variant="destructive" onClick={() => onDelete(event.id)} disabled={isSubmitting}><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>}
          <Button onClick={handleSaveClick} disabled={isSubmitting || !title || !date}>
            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
            {event ? 'Save Changes' : 'Add Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Task Dialog Component
const TaskDialog = ({ isOpen, onOpenChange, task, onSave, onDelete, isSubmitting }: any) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined | null>();
  const [status, setStatus] = useState<TaskStatus>('Todo');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setDueDate(task.dueDate ? new Date((task.dueDate as any).seconds * 1000) : null);
      setStatus(task.status);
      setPriority(task.priority || 'Medium');
    } else {
      setTitle('');
      setDescription('');
      setDueDate(null);
      setStatus('Todo');
      setPriority('Medium');
    }
  }, [task]);

  const handleSaveClick = () => {
    if(title) onSave({ title, description, dueDate, status, priority });
  }

  return (
     <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "Add New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task Title*" />
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description..." />
          <div className="grid grid-cols-2 gap-4">
            <DatePicker date={dueDate || undefined} onDateChange={setDueDate} />
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Medium">Medium</SelectItem><SelectItem value="High">High</SelectItem></SelectContent></Select>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{taskStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <DialogFooter>
          {task && <Button variant="destructive" onClick={() => onDelete(task.id)} disabled={isSubmitting}><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>}
          <Button onClick={handleSaveClick} disabled={isSubmitting || !title}>
            {isSubmitting ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 h-4 w-4"/>}
            {task ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
