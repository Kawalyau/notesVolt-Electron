
// src/components/school-site/admin-toolbar.tsx
"use client";

import { useAdminAuth } from '@/hooks/use-admin-auth';
import { Button } from '@/components/ui/button';
import { ShieldCheck, LogOut, Brush, Newspaper, GalleryHorizontal, FileText, CalendarClock } from 'lucide-react';

interface AdminToolbarProps {
  onEditHero: () => void;
  onEditAbout: () => void;
  onManageNews: () => void;
  onManageEvents: () => void;
  onManageGallery: () => void;
  onManagePublications: () => void;
}

export function AdminToolbar({ onEditHero, onEditAbout, onManageNews, onManageEvents, onManageGallery, onManagePublications }: AdminToolbarProps) {
  const { isAdmin, logoutAdmin } = useAdminAuth();

  if (!isAdmin) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background/80 backdrop-blur-sm p-2 rounded-lg shadow-lg border flex items-center gap-2">
      <div className="flex items-center gap-1 text-primary font-semibold text-sm mr-2">
        <ShieldCheck className="h-5 w-5"/> Admin Mode
      </div>
      <Button variant="outline" size="sm" onClick={onEditHero}><Brush className="mr-1 h-4 w-4"/>Hero</Button>
      <Button variant="outline" size="sm" onClick={onEditAbout}><Brush className="mr-1 h-4 w-4"/>About</Button>
      <Button variant="outline" size="sm" onClick={onManageNews}><Newspaper className="mr-1 h-4 w-4"/>News</Button>
      <Button variant="outline" size="sm" onClick={onManageEvents}><CalendarClock className="mr-1 h-4 w-4"/>Events</Button>
      <Button variant="outline" size="sm" onClick={onManageGallery}><GalleryHorizontal className="mr-1 h-4 w-4"/>Gallery</Button>
      <Button variant="outline" size="sm" onClick={onManagePublications}><FileText className="mr-1 h-4 w-4"/>Docs</Button>
      
      <Button variant="ghost" size="sm" onClick={logoutAdmin} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
        <LogOut className="mr-1 h-4 w-4"/> Lock
      </Button>
    </div>
  );
}
