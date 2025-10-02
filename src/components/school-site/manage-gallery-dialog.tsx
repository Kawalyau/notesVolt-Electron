// src/components/school-site/manage-gallery-dialog.tsx
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { GalleryImage } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Trash2, ImageUp, CheckCircle, XCircle } from 'lucide-react';
import { getSchoolSubcollectionItems, addSchoolSubcollectionItem, deleteSchoolSubcollectionItem, updateSchoolSubcollectionItem, uploadFile, deleteFileFromUrl } from '@/services/schoolService';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';

interface ManageGalleryDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  schoolId: string;
  onUpdate: () => void;
}

export function ManageGalleryDialog({ isOpen, onOpenChange, schoolId, onUpdate }: ManageGalleryDialogProps) {
  const { toast } = useToast();
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [newImageTitle, setNewImageTitle] = useState('');
  const [newImageDescription, setNewImageDescription] = useState('');

  const fetchGalleryImages = useCallback(async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const data = await getSchoolSubcollectionItems<GalleryImage>(schoolId, 'galleryImages');
      setGalleryImages(data);
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Could not load gallery images." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, toast]);

  useEffect(() => {
    if (isOpen) {
      fetchGalleryImages();
    }
  }, [isOpen, fetchGalleryImages]);

  const handleAddImage = async () => {
    if (!newImageFile || !newImageTitle) {
      toast({ variant: "destructive", title: "Missing Info", description: "Please provide a title and select an image file." });
      return;
    }
    setIsUploading(true);
    try {
      const filePath = `schools/${schoolId}/gallery/${Date.now()}_${newImageFile.name}`;
      const imageUrl = await uploadFile(filePath, newImageFile, setUploadProgress);
      
      const newImageData: Omit<GalleryImage, 'id' | 'createdAt' | 'updatedAt'> = {
        title: newImageTitle,
        description: newImageDescription || null,
        imageUrl,
        isPublished: true,
      };
      await addSchoolSubcollectionItem(schoolId, 'galleryImages', newImageData);
      
      toast({ title: "Image Added" });
      setNewImageFile(null); setNewImageTitle(''); setNewImageDescription('');
      fetchGalleryImages(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: error.message });
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteImage = async (image: GalleryImage) => {
    if (!window.confirm(`Are you sure you want to delete the image "${image.title}"?`)) return;
    try {
      await deleteFileFromUrl(image.imageUrl);
      await deleteSchoolSubcollectionItem(schoolId, 'galleryImages', image.id);
      toast({ title: "Image Deleted" });
      fetchGalleryImages(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error.message });
    }
  };
  
  const handleTogglePublish = async (image: GalleryImage) => {
    try {
      await updateSchoolSubcollectionItem(schoolId, 'galleryImages', image.id, { isPublished: !image.isPublished });
      toast({ title: "Status Updated" });
      fetchGalleryImages(); onUpdate();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage Gallery</DialogTitle>
          <DialogDescription>Add, remove, and manage images for your school's public website gallery.</DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4 flex-grow overflow-hidden">
          {/* Add New Image Form */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-lg">Add New Image</h3>
            <div>
              <Label htmlFor="new-image-title">Image Title*</Label>
              <Input id="new-image-title" value={newImageTitle} onChange={e => setNewImageTitle(e.target.value)} disabled={isUploading} />
            </div>
            <div>
              <Label htmlFor="new-image-desc">Description</Label>
              <Textarea id="new-image-desc" value={newImageDescription} onChange={e => setNewImageDescription(e.target.value)} disabled={isUploading} />
            </div>
            <div>
              <Label htmlFor="new-image-file">Image File*</Label>
              <Input id="new-image-file" type="file" accept="image/*" onChange={e => setNewImageFile(e.target.files?.[0] || null)} disabled={isUploading} />
            </div>
            {uploadProgress !== null && <Progress value={uploadProgress} className="w-full" />}
            <Button onClick={handleAddImage} disabled={isUploading || !newImageFile || !newImageTitle}>
              {isUploading ? <Loader2 className="animate-spin mr-2" /> : <ImageUp className="mr-2" />}
              Upload & Add Image
            </Button>
          </div>

          {/* Existing Images List */}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Existing Images</h3>
            <ScrollArea className="h-96 border rounded-lg p-2">
              {isLoading ? <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin"/></div> : (
                galleryImages.length > 0 ? (
                  <div className="space-y-4">
                    {galleryImages.map(image => (
                      <div key={image.id} className="flex items-center gap-4 p-2 border-b">
                        <Image src={image.imageUrl} alt={image.title} width={80} height={80} className="rounded-md object-cover" />
                        <div className="flex-grow">
                          <p className="font-semibold">{image.title}</p>
                          <p className="text-xs text-muted-foreground">{image.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleTogglePublish(image)} title={image.isPublished ? "Unpublish" : "Publish"}>
                             {image.isPublished ? <CheckCircle className="h-5 w-5 text-green-600"/> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteImage(image)} title="Delete">
                            <Trash2 className="h-5 w-5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-muted-foreground text-center p-4">No images in gallery.</p>
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
