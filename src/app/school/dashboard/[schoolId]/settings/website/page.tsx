
// src/app/school/dashboard/[schoolId]/settings/website/page.tsx
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useAdminAuth } from '@/hooks/use-admin-auth';
import { useToast } from '@/hooks/use-toast';
import { getSchoolById } from '@/services/schoolService';
import type { School } from '@/types/school';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Globe, Brush, Newspaper, GalleryHorizontal, FileText, CalendarClock } from 'lucide-react';
import { EditHeroDialog } from '@/components/school-site/edit-hero-dialog';
import { EditAboutDialog } from '@/components/school-site/edit-about-dialog';
import { ManageNewsDialog } from '@/components/school-site/manage-news-dialog';
import { ManageEventsDialog } from '@/components/school-site/manage-events-dialog';
import { ManageGalleryDialog } from '@/components/school-site/manage-gallery-dialog';
import { ManagePublicationsDialog } from '@/components/school-site/manage-publications-dialog';

export default function WebsiteAdminPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin } = useAdminAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // State for managing dialog visibility
  const [dialogs, setDialogs] = useState({
    hero: false,
    about: false,
    news: false,
    events: false,
    gallery: false,
    publications: false,
  });

  const fetchSchoolData = useCallback(async () => {
    if (!user || !schoolId) return;
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool) {
        toast({ variant: "destructive", title: "Error", description: "School not found." });
        router.push('/school/auth');
      } else if (!fetchedSchool.adminUids.includes(user.uid)) {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push('/school/auth');
      } else {
        setSchool(fetchedSchool);
      }
    } catch (error) {
      console.error("Error fetching school data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load school data." });
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchSchoolData();
    }
  }, [user, authLoading, fetchSchoolData]);

  const openDialog = (dialog: keyof typeof dialogs) => {
    if (!isAdmin) {
      toast({ variant: "destructive", title: "Access Denied", description: "You must be in Admin Mode to edit site content. Log in via the homepage footer." });
      return;
    }
    setDialogs(prev => ({ ...prev, [dialog]: true }));
  };

  const contentSections = [
    { key: 'hero', title: 'Hero Section', description: "Manage the main banner, title, and subtitle on your homepage.", icon: Brush },
    { key: 'about', title: 'About Us Section', description: "Edit the description and image in the 'About Us' area.", icon: Brush },
    { key: 'news', title: 'News Articles', description: "Create, publish, and manage school news and announcements.", icon: Newspaper },
    { key: 'events', title: 'School Events', description: "Post and update upcoming school events and calendar items.", icon: CalendarClock },
    { key: 'gallery', title: 'Image Gallery', description: "Upload and manage images for the public photo gallery.", icon: GalleryHorizontal },
    { key: 'publications', title: 'Publications & Docs', description: "Manage downloadable documents like newsletters and circulars.", icon: FileText },
  ];

  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Globe className="mr-3 h-6 w-6 text-primary" /> Website Content Management
          </CardTitle>
          <CardDescription>
            A centralized dashboard to manage all content on your public-facing school website.
            {!isAdmin && <span className="text-destructive font-semibold"> (You are not in Admin Mode. Please log in from the homepage footer to enable editing.)</span>}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {contentSections.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <section.icon className="mr-2 h-5 w-5 text-muted-foreground" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" onClick={() => openDialog(section.key as keyof typeof dialogs)} disabled={!isAdmin}>
                Manage {section.key.charAt(0).toUpperCase() + section.key.slice(1)}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      
      {school && (
        <>
          <EditHeroDialog isOpen={dialogs.hero} onOpenChange={(open) => setDialogs(p => ({...p, hero: open}))} school={school} onUpdate={fetchSchoolData} />
          <EditAboutDialog isOpen={dialogs.about} onOpenChange={(open) => setDialogs(p => ({...p, about: open}))} school={school} onUpdate={fetchSchoolData} />
          <ManageNewsDialog isOpen={dialogs.news} onOpenChange={(open) => setDialogs(p => ({...p, news: open}))} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManageEventsDialog isOpen={dialogs.events} onOpenChange={(open) => setDialogs(p => ({...p, events: open}))} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManageGalleryDialog isOpen={dialogs.gallery} onOpenChange={(open) => setDialogs(p => ({...p, gallery: open}))} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManagePublicationsDialog isOpen={dialogs.publications} onOpenChange={(open) => setDialogs(p => ({...p, publications: open}))} schoolId={schoolId} onUpdate={fetchSchoolData} />
        </>
      )}
    </div>
  );
}
