// src/components/school-site/manage-publications-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Publication } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trash2, FileUp, CheckCircle, XCircle, FileText } from 'lucide-react';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem, uploadFile, deleteFileFromUrl } from '@/services/schoolService';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ManagePublicationsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  onUpdate: () => void;
}

export function ManagePublicationsDialog({ isOpen, onOpenChange, schoolId, onUpdate }: ManagePublicationsDialogProps) {
  const { toast } = useToast();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const fetchPublications = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const data = await getSchoolSubcollectionItems<Publication>(schoolId, 'publications');
      setPublications(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load publications." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchPublications();
    }
  }, [isOpen, fetchPublications]);

  const handleAddPublication = async () => {
    if (!newFile || !newTitle) {
      toast({ variant: "destructive", title: "Missing Info", description: "Please provide a title and select a file." });
      return;
    }
    setIsUploading(true);
    try {
      const filePath = `schools/${schoolId}/publications/${Date.now()}_${newFile.name}`;
      const fileUrl = await uploadFile(filePath, newFile, setUploadProgress);
      
      const fileType = newFile.type.includes('pdf') ? 'pdf' : (newFile.type.includes('word') ? 'docx' : 'other');

      const newPublicationData: Omit<Publication, 'id' | 'createdAt' | 'updatedAt'> = {
        title: newTitle,
        description: newDescription || null,
        fileUrl,
        fileName: newFile.name,
        fileType,
        isPublished: true,
      };
      await addSchoolSubcollectionItem(schoolId, 'publications', newPublicationData);
      
      toast({ title: "Publication Added" });
      setNewFile(null); setNewTitle(''); setNewDescription('');
      fetchPublications(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeletePublication = async (publication: Publication) => {
    if (!window.confirm(`Are you sure you want to delete "${publication.title}"?`)) return;
    try {
      await deleteFileFromUrl(publication.fileUrl);
      await deleteSchoolSubcollectionItem(schoolId, 'publications', publication.id);
      toast({ title: "Publication Deleted" });
      fetchPublications(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };

  const handleTogglePublish = async (publication: Publication) => {
    try {
      await updateSchoolSubcollectionItem(schoolId, 'publications', publication.id, { isPublished: !publication.isPublished });
      toast({ title: "Status Updated" });
      fetchPublications(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Publications & Circulars</DialogTitle>
          <DialogDescription>Upload and manage documents like newsletters, circulars, and forms.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 flex-grow overflow-hidden">
          {/* Add New Publication Form */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-lg">Add New Publication</h3>
            <div>
              <Label htmlFor="new-pub-title">Title*</Label>
              <Input id="new-pub-title" value={newTitle} onChange={e => setNewTitle(e.target.value)} disabled={isUploading} />
            </div>
            <div>
              <Label htmlFor="new-pub-desc">Description</Label>
              <Textarea id="new-pub-desc" value={newDescription} onChange={e => setNewDescription(e.target.value)} disabled={isUploading} />
            </div>
            <div>
              <Label htmlFor="new-pub-file">File (PDF, DOCX)*</Label>
              <Input id="new-pub-file" type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setNewFile(e.target.files?.[0] || null)} disabled={isUploading} />
            </div>
            {uploadProgress !== null && <Progress value={uploadProgress} className="w-full" />}
            <Button onClick={handleAddPublication} disabled={isUploading || !newFile || !newTitle}>
              {isUploading ? <Loader2 className="animate-spin mr-2" /> : <FileUp className="mr-2" />}
              Upload & Add Publication
            </Button>
          </div>

          {/* Existing Publications List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Existing Publications</h3>
            <ScrollArea className="h-96 border rounded-lg p-2">
              {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin"/></div> : (
                publications.length > 0 ? (
                  <div className="space-y-3">
                    {publications.map(pub => (
                      <div key={pub.id} className="flex items-center gap-4 p-2 border-b">
                        <FileText className="h-6 w-6 text-primary shrink-0" />
                        <div className="flex-grow">
                          <p className="font-semibold">{pub.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{pub.description || pub.fileName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleTogglePublish(pub)} title={pub.isPublished ? "Unpublish" : "Publish"}>
                             {pub.isPublished ? <CheckCircle className="h-5 w-5 text-green-600"/> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeletePublication(pub)} title="Delete">
                            <Trash2 className="h-5 w-5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-center p-4">No publications available.</p>
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
