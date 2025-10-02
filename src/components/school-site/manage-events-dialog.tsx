
// src/components/school-site/manage-events-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Event } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trash2, Edit, Plus, CheckCircle, XCircle, Calendar, MapPin } from 'lucide-react';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem, uploadFile, deleteFileFromUrl } from '@/services/schoolService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/use-auth';
import { DatePicker } from '@/components/ui/date-picker';
import { Progress } from '../ui/progress';

interface ManageEventsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  onUpdate: () => void;
}

export function ManageEventsDialog({ isOpen, onOpenChange, schoolId, onUpdate }: ManageEventsDialogProps) {
  const { toast } = useToast();
  const { userProfile } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPublished, setIsPublished] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const data = await getSchoolSubcollectionItems<Event>(schoolId, 'events', [{ field: 'date', direction: 'desc' }]);
      setEvents(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load events." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchEvents();
      resetForm();
    }
  }, [isOpen, fetchEvents]);

  const resetForm = () => {
    setEditingEvent(null);
    setTitle('');
    setDescription('');
    setLocation('');
    setDate(new Date());
    setEventImageFile(null);
    setUploadProgress(null);
    setIsPublished(true);
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description);
    setLocation(event.location || '');
    setDate(event.date ? new Date((event.date as any).seconds * 1000) : new Date());
    setIsPublished(event.isPublished);
    setEventImageFile(null);
  };

  const handleSave = async () => {
    if (!title || !description || !date) {
      toast({ variant: "destructive", title: "Missing Info", description: "Title, description, and date are required." });
      return;
    }
    setIsSubmitting(true);
    try {
      let imageUrl = editingEvent?.imageUrl;
      if (eventImageFile) {
        if (imageUrl) { await deleteFileFromUrl(imageUrl); }
        const filePath = `schools/${schoolId}/events/${Date.now()}_${eventImageFile.name}`;
        imageUrl = await uploadFile(filePath, eventImageFile, setUploadProgress);
      } else if (!editingEvent?.imageUrl) {
        imageUrl = null;
      }

      if (editingEvent) {
        const updatedData: Partial<Event> = { title, description, location, date, imageUrl, isPublished };
        await updateSchoolSubcollectionItem(schoolId, 'events', editingEvent.id, updatedData);
        toast({ title: "Event Updated" });
      } else {
        const newEventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = { title, description, location, date, imageUrl, isPublished };
        await addSchoolSubcollectionItem(schoolId, 'events', newEventData);
        toast({ title: "Event Added" });
      }
      resetForm();
      fetchEvents();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = async (eventId: string, imageUrl?: string | null) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      if (imageUrl) { await deleteFileFromUrl(imageUrl); }
      await deleteSchoolSubcollectionItem(schoolId, 'events', eventId);
      toast({ title: "Event Deleted" });
      fetchEvents();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };

  const handleTogglePublish = async (event: Event) => {
    try {
      await updateSchoolSubcollectionItem(schoolId, 'events', event.id, { isPublished: !event.isPublished });
      toast({ title: `Event ${!event.isPublished ? "Published" : "Unpublished"}` });
      fetchEvents();
      onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Events</DialogTitle>
          <DialogDescription>Add, edit, or remove events for your school's website.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 flex-grow overflow-hidden">
          <div className="space-y-4 p-1">
            <h3 className="font-semibold text-lg">{editingEvent ? "Edit Event" : "Add New Event"}</h3>
            <div><Label htmlFor="event-title">Title*</Label><Input id="event-title" value={title} onChange={e => setTitle(e.target.value)} disabled={isSubmitting} /></div>
            <div><Label htmlFor="event-date">Date*</Label><DatePicker date={date} onDateChange={setDate} /></div>
            <div><Label htmlFor="event-location">Location</Label><Input id="event-location" value={location} onChange={e => setLocation(e.target.value)} disabled={isSubmitting} /></div>
            <div><Label htmlFor="event-content">Description*</Label><Textarea id="event-content" value={description} onChange={e => setDescription(e.target.value)} disabled={isSubmitting} rows={6} /></div>
            <div><Label htmlFor="event-image">Image</Label><Input id="event-image" type="file" accept="image/*" onChange={e => setEventImageFile(e.target.files?.[0] || null)} disabled={isSubmitting} /></div>
            {uploadProgress !== null && <Progress value={uploadProgress} className="w-full" />}
            <div className="flex items-center space-x-2">
                <Input type="checkbox" id="event-published" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} disabled={isSubmitting} className="h-4 w-4"/>
                <Label htmlFor="event-published">Published</Label>
            </div>
            <div className="flex gap-2">
                <Button onClick={handleSave} disabled={isSubmitting || !title || !description || !date}>
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : (editingEvent ? <Edit className="mr-2 h-4 w-4"/> : <Plus className="mr-2 h-4 w-4"/>)}
                {editingEvent ? 'Update Event' : 'Add Event'}
                </Button>
                {editingEvent && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Existing Events</h3>
            <ScrollArea className="h-96 border rounded-lg p-2">
              {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin"/></div> : (
                events.length > 0 ? (
                  <div className="space-y-3">
                    {events.map(event => (
                      <div key={event.id} className="flex items-start gap-4 p-2 border-b">
                        <div className="flex-grow">
                          <p className="font-semibold">{event.title}</p>
                          <p className="text-xs text-muted-foreground"><Calendar className="inline h-3 w-3 mr-1"/>{format(new Date((event.date as any).seconds * 1000), 'PPP')}</p>
                          <p className="text-xs text-muted-foreground"><MapPin className="inline h-3 w-3 mr-1"/>{event.location || "Not specified"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" title={event.isPublished ? "Unpublish" : "Publish"} onClick={() => handleTogglePublish(event)}>
                                {event.isPublished ? <CheckCircle className="h-5 w-5 text-green-600"/> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                            </Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEdit(event)}><Edit className="h-4 w-4"/></Button>
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(event.id, event.imageUrl)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-center p-4">No events created yet.</p>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
