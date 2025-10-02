// src/components/school-site/edit-about-dialog.tsx
"use client";

import { useState, useEffect } from 'react';
import type { School, SiteContent } from '@/types/school';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save } from 'lucide-react';
import { updateSchoolData } from '@/services/schoolService';

interface EditAboutDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  school: School;
  onUpdate: () => void; // Callback to refresh data on parent page
}

export function EditAboutDialog({ isOpen, onOpenChange, school, onUpdate }: EditAboutDialogProps) {
  const { toast } = useToast();
  const [aboutUsContent, setAboutUsContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAboutUsContent(school.siteContent?.aboutUsContent || school.description || '');
    }
  }, [isOpen, school]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const updatedSiteContent: SiteContent = {
        ...school.siteContent,
        aboutUsContent: aboutUsContent,
      };
      await updateSchoolData(school.id, { siteContent: updatedSiteContent });
      toast({ title: "About Section Updated" });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating about section:", error);
      toast({ variant: "destructive", title: "Update Failed", description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit About Section</DialogTitle>
          <DialogDescription>
            Update the "About Us" content for your school's public website.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div>
            <Label htmlFor="aboutUsContent">About Us Content</Label>
            <Textarea
              id="aboutUsContent"
              value={aboutUsContent}
              onChange={(e) => setAboutUsContent(e.target.value)}
              placeholder="Write a welcome message or description about your school..."
              className="mt-1 min-h-[200px]"
              rows={8}
            />
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
