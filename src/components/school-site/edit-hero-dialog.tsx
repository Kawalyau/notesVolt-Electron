// src/components/school-site/edit-hero-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import type { School, SiteContent } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, ImageUp, XCircle } from 'lucide-react';
import { updateSchoolData, uploadFile, deleteFileFromUrl } from '@/services/schoolService';
import { Progress } from '@/components/ui/progress';
import Image from 'next/image';

interface EditHeroDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  school: School;
  onUpdate: () => void; // Callback to refresh data on parent page
}

export function EditHeroDialog({ isOpen, onOpenChange, school, onUpdate }: EditHeroDialogProps) {
  const { toast } = useToast();
  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroImagePreview, setHeroImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHeroTitle(school.siteContent?.heroTitle || '');
      setHeroSubtitle(school.siteContent?.heroSubtitle || '');
      setHeroImagePreview(school.siteContent?.heroImageUrl || null);
      setHeroImageFile(null);
      setUploadProgress(null);
    }
  }, [isOpen, school]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHeroImageFile(file);
      setHeroImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setHeroImageFile(null);
    setHeroImagePreview(null);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      let heroImageUrl = school.siteContent?.heroImageUrl;

      if (heroImageFile) {
        if (heroImageUrl) {
          await deleteFileFromUrl(heroImageUrl);
        }
        const filePath = `schools/${school.id}/site/hero_${Date.now()}_${heroImageFile.name}`;
        heroImageUrl = await uploadFile(filePath, heroImageFile, setUploadProgress);
      } else if (heroImagePreview === null && heroImageUrl) {
        await deleteFileFromUrl(heroImageUrl);
        heroImageUrl = undefined;
      }
      
      const updatedSiteContent: SiteContent = {
        ...school.siteContent,
        heroTitle: heroTitle,
        heroSubtitle: heroSubtitle,
        heroImageUrl: heroImageUrl,
      };
      
      await updateSchoolData(school.id, { siteContent: updatedSiteContent });
      toast({ title: "Hero Section Updated" });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating hero section:", error);
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Hero Section</DialogTitle>
          <DialogDescription>
            Customize the main title, subtitle, and background image of your school's website.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <Label htmlFor="heroTitle">Hero Title</Label>
            <Input id="heroTitle" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} placeholder="e.g., Welcome to Our School" />
          </div>
          <div>
            <Label htmlFor="heroSubtitle">Hero Subtitle</Label>
            <Input id="heroSubtitle" value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} placeholder="e.g., A Tradition of Excellence" />
          </div>
          <div>
            <Label>Hero Background Image</Label>
            <div className="mt-1 flex items-center gap-4">
              {heroImagePreview ? (
                <div className="relative h-24 w-40 rounded-md overflow-hidden border">
                  <Image src={heroImagePreview} alt="Hero preview" layout="fill" objectFit="cover" />
                </div>
              ) : (
                <div className="h-24 w-40 rounded-md border bg-muted flex items-center justify-center">
                  <ImageUp className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <div className="flex-grow">
                <Input id="hero-image" type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm"/>
                {heroImagePreview && (
                  <Button type="button" variant="link" size="sm" onClick={handleRemoveImage} className="text-destructive px-0 mt-1">
                    <XCircle className="h-4 w-4 mr-1"/>Remove Image
                  </Button>
                )}
              </div>
            </div>
             {uploadProgress !== null && <Progress value={uploadProgress} className="w-full h-1.5 mt-2" />}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
