// src/app/site/[schoolId]/page.tsx - The beautiful school website
'use client'

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { Globe, MapPin, Phone, Mail, Building, BookCopy, GraduationCap, Users, Edit, Image as ImageIcon, Newspaper, BookText, FileText, Calendar, Clock, User, School, Library, Trophy, Award, Mic, Music, Palette, WalletCards, Annoyed, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School as SchoolType, NewsArticle, Publication, GalleryImage, Event } from '@/types/school';
import { useAdminAuth } from '@/hooks/use-admin-auth';
import { AdminLoginDialog } from '@/components/school-site/admin-login-dialog';
import { AdminToolbar } from '@/components/school-site/admin-toolbar';
import { format } from 'date-fns';
import { EditHeroDialog } from '@/components/school-site/edit-hero-dialog';
import { EditAboutDialog } from '@/components/school-site/edit-about-dialog';
import { ManageNewsDialog } from '@/components/school-site/manage-news-dialog';
import { ManageEventsDialog } from '@/components/school-site/manage-events-dialog';
import { ManageGalleryDialog } from '@/components/school-site/manage-gallery-dialog';
import { ManagePublicationsDialog } from '@/components/school-site/manage-publications-dialog';
import { Loader2 } from 'lucide-react';
import { where, orderBy, limit } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useInView } from 'react-intersection-observer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function SchoolSitePage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const { isAdmin, loading: adminAuthLoading } = useAdminAuth();

  const [school, setSchool] = useState<SchoolType | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showEditHero, setShowEditHero] = useState(false);
  const [showEditAbout, setShowEditAbout] = useState(false);
  const [showManageNews, setShowManageNews] = useState(false);
  const [showManageEvents, setShowManageEvents] = useState(false);
  const [showManageGallery, setShowManageGallery] = useState(false);
  const [showManagePublications, setShowManagePublications] = useState(false);

  // Intersection observers for animations
  const [heroRef, heroInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [aboutRef, aboutInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [newsRef, newsInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [galleryRef, galleryInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [contactRef, contactInView] = useInView({ threshold: 0.1, triggerOnce: true });

  const fetchSchoolData = useCallback(async () => {
    if (!schoolId) {
        setIsLoading(false);
        setSchool(null);
        return;
    }
    setIsLoading(true);
    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool) {
        setSchool(null);
        return;
      }
      setSchool(fetchedSchool);
      
      const publishedQuery = [where('isPublished', '==', true), orderBy('createdAt', 'desc')];
      const limitedNewsQuery = [where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(4)];
      const [newsData, publicationsData, galleryData, eventsData] = await Promise.all([
        getSchoolSubcollectionItems<NewsArticle>(schoolId, 'news', limitedNewsQuery),
        getSchoolSubcollectionItems<Publication>(schoolId, 'publications', publishedQuery),
        getSchoolSubcollectionItems<GalleryImage>(schoolId, 'galleryImages', [where('isPublished', '==', true), orderBy('createdAt', 'desc'), limit(6)]),
        getSchoolSubcollectionItems<Event>(schoolId, 'events', [where('isPublished', '==', true), orderBy('date', 'asc'), limit(4)])
      ]);
      setNews(newsData);
      setPublications(publicationsData);
      setGalleryImages(galleryData);
      setEvents(eventsData);

    } catch (error) {
      console.error("Error fetching school data for site:", error);
      setSchool(null);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchSchoolData();
  }, [fetchSchoolData]);

  if (isLoading || adminAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-background to-muted/50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <School className="h-16 w-16 text-primary" />
        </motion.div>
      </div>
    );
  }
  
  if (!school) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-gray-100 to-gray-200 text-center p-8"
      >
        <motion.div
          animate={{ 
            y: [0, -10, 0],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Annoyed className="h-24 w-24 text-destructive mb-4" />
        </motion.div>
        <h1 className="text-4xl font-bold text-gray-800 mb-2">404 - School Not Found</h1>
        <p className="text-lg text-gray-600 mb-6">The school site you are looking for does not exist.</p>
        <Link href="/" passHref>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button className="mt-2">Go to Main Page</Button>
          </motion.div>
        </Link>
      </motion.div>
    );
  }

  const features = [
    { icon: GraduationCap, text: `Level: ${school.level}` },
    { icon: Building, text: `Ownership: ${school.ownership}` },
    { icon: BookCopy, text: `Curriculum: ${school.curriculum || 'Not specified'}` },
  ];

  const stats = [
    { value: '500+', label: 'Students', icon: Users },
    { value: '30+', label: 'Teachers', icon: User },
    { value: '15+', label: 'Classes', icon: School },
    { value: '20+', label: 'Awards', icon: Trophy },
  ];

  const programs = [
    { icon: Library, title: 'Academic Excellence', description: 'Rigorous curriculum with advanced placement options' },
    { icon: Palette, title: 'Arts Program', description: 'Visual and performing arts including music, theater, and fine arts' },
    { icon: Trophy, title: 'Athletics', description: 'Competitive sports teams and physical education' },
    { icon: Mic, title: 'Debate & Public Speaking', description: 'Opportunities to develop communication skills' },
  ];

  return (
    <>
      <div className="bg-background font-sans antialiased relative overflow-hidden">
        {isAdmin && (
          <AdminToolbar 
            onEditHero={() => setShowEditHero(true)} 
            onEditAbout={() => setShowEditAbout(true)} 
            onManageNews={() => setShowManageNews(true)} 
            onManageEvents={() => setShowManageEvents(true)}
            onManageGallery={() => setShowManageGallery(true)} 
            onManagePublications={() => setShowManagePublications(true)}
          />
        )}

        <header 
          ref={heroRef}
          className="relative h-screen max-h-[800px] min-h-[600px] text-primary-foreground text-center overflow-hidden flex items-center justify-center"
        >
          <div className="absolute inset-0 z-0 overflow-hidden">
            <motion.div 
              className="absolute inset-0"
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            >
              <Image
                src={school.siteContent?.heroImageUrl || "https://placehold.co/1920x1080.png"}
                alt={school.siteContent?.heroTitle || "A view of the school campus"}
                layout="fill"
                objectFit="cover"
                quality={100}
                priority
                className="opacity-70"
                data-ai-hint="school building"
              />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-background/10"></div>
            <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/30"></div>
          </div>
          
          <motion.div 
            className="container mx-auto px-6 relative z-10"
            initial={{ opacity: 0, y: 50 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            {school.badgeImageUrl && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={heroInView ? { scale: 1, opacity: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <Image
                  src={school.badgeImageUrl}
                  alt={`${school.name} School Badge`}
                  width={120}
                  height={120}
                  className="mx-auto mb-6 rounded-full border-4 border-primary-foreground/30 bg-background/80 p-2 shadow-lg object-contain hover:rotate-6 transition-transform duration-500"
                  data-ai-hint="school logo"
                />
              </motion.div>
            )}
            <motion.h1 
              className="text-4xl sm:text-6xl font-bold tracking-tight mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {school.siteContent?.heroTitle || school.name}
            </motion.h1>
            {school.siteContent?.heroSubtitle && (
              <motion.p 
                className="text-xl sm:text-2xl max-w-2xl mx-auto mb-8"
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.5 }}
              >
                {school.siteContent.heroSubtitle}
              </motion.p>
            )}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="flex flex-wrap gap-4 justify-center"
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
                  <Link href="/school/auth">Admissions Portal</Link>
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button asChild variant="outline" size="lg" className="bg-background/20 hover:bg-background/30">
                  <Link href={`/check-balance?schoolId=${schoolId}`}><WalletCards className="mr-2"/>Check Fees</Link>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>

          {isAdmin && (
            <motion.div 
              className="absolute top-4 right-4"
              whileHover={{ scale: 1.1 }}
            >
              <Button onClick={() => setShowEditHero(true)} variant="secondary" size="sm">
                <Edit className="h-4 w-4 mr-2" /> Edit Hero
              </Button>
            </motion.div>
          )}

          <motion.div 
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
            animate={{ 
              y: [0, 10, 0],
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="w-8 h-12 border-2 border-primary-foreground/50 rounded-full flex justify-center">
              <motion.div 
                className="w-1 h-3 bg-primary-foreground rounded-full mt-2"
                animate={{ 
                  y: [0, 8, 0],
                  opacity: [1, 0.5, 1]
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
          </motion.div>
        </header>

        <section className="bg-primary/10 py-12">
          <div className="container mx-auto px-6">
            <motion.div 
              className="grid grid-cols-2 md:grid-cols-4 gap-6"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              {stats.map((stat, index) => (
                <motion.div 
                  key={index}
                  className="bg-background p-6 rounded-xl shadow-sm text-center"
                  whileHover={{ y: -5, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex justify-center mb-3">
                    <stat.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-3xl font-bold text-primary mb-1">{stat.value}</h3>
                  <p className="text-muted-foreground text-sm">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <main className="container mx-auto px-6 py-16">
          <section id="about" ref={aboutRef} className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={aboutInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8 }}
            >
              <Card className="shadow-xl group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-transparent z-0"></div>
                <CardHeader>
                  <CardTitle className="text-3xl text-primary flex items-center">
                    <span className="relative z-10">About {school.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                      <motion.div 
                        className="text-muted-foreground whitespace-pre-wrap mb-6 text-lg leading-relaxed"
                        initial={{ opacity: 0 }}
                        animate={aboutInView ? { opacity: 1 } : {}}
                        transition={{ delay: 0.2 }}
                      >
                        {school.siteContent?.aboutUsContent || school.description || "Information about our school's mission, vision, and values."}
                      </motion.div>
                      <Separator className="my-6" />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {features.map((feature, index) => (
                          <motion.div 
                            key={index}
                            className="flex flex-col items-center p-4 bg-muted/50 rounded-lg"
                            initial={{ opacity: 0, y: 20 }}
                            animate={aboutInView ? { opacity: 1, y: 0 } : {}}
                            transition={{ delay: 0.3 + index * 0.1 }}
                          >
                            <feature.icon className="h-8 w-8 text-accent mb-2" />
                            <p className="font-semibold text-foreground text-center">{feature.text}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                    <div className="relative h-64 lg:h-auto rounded-xl overflow-hidden">
                      <Image
                        src={school.siteContent?.aboutImageUrl || "https://placehold.co/800x600.png"}
                        alt={school.siteContent?.aboutUsContent ? `Image illustrating about ${school.name}` : "A classroom with happy students"}
                        fill
                        className="object-cover rounded-xl hover:scale-105 transition-transform duration-700"
                        data-ai-hint="happy students"
                      />
                    </div>
                  </div>
                </CardContent>
                {isAdmin && (
                  <motion.div 
                    className="absolute top-4 right-4"
                    whileHover={{ scale: 1.1 }}
                  >
                    <Button onClick={() => setShowEditAbout(true)} variant="secondary" size="sm">
                      <Edit className="h-4 w-4 mr-2" /> Edit About
                    </Button>
                  </motion.div>
                )}
              </Card>
            </motion.div>
          </section>

          <section className="mb-20">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold text-center mb-12">Our Programs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {programs.map((program, index) => (
                  <motion.div
                    key={index}
                    className="bg-background border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -5 }}
                  >
                    <div className="flex justify-center mb-4">
                      <program.icon className="h-10 w-10 text-primary" />
                    </div>
                    <h3 className="text-xl font-bold text-center mb-2">{program.title}</h3>
                    <p className="text-muted-foreground text-center">{program.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </section>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             {/* News & Events Section */}
            <section id="news" className="lg:col-span-2" ref={newsRef}>
                <Tabs defaultValue="news">
                  <TabsList>
                    <TabsTrigger value="news">Latest News</TabsTrigger>
                    <TabsTrigger value="events">Upcoming Events</TabsTrigger>
                  </TabsList>
                  <TabsContent value="news">
                    <motion.div
                      initial={{ opacity: 0, y: 50 }}
                      animate={newsInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.8 }}
                    >
                      <Card className="shadow-xl group relative mt-2">
                        <CardContent className="p-6">
                          {news.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {news.map((article, index) => (
                                <motion.div key={article.id} className="flex flex-col border rounded-xl overflow-hidden hover:shadow-md transition-shadow" initial={{ opacity: 0, y: 20 }} animate={newsInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: index * 0.1 }} whileHover={{ y: -5 }}>
                                  {article.imageUrl && <div className="relative h-48 w-full"><Image src={article.imageUrl} alt={article.title} fill className="object-cover" data-ai-hint="school event" /></div>}
                                  <div className="p-4">
                                    <h3 className="font-bold text-lg mb-2">{article.title}</h3>
                                    <p className="text-xs text-muted-foreground mb-3 flex items-center"><Clock className="h-3 w-3 mr-1" />Published on {article.publishedAt ? format(new Date(article.publishedAt as string), 'PPP') : 'Not yet published'}</p>
                                    <div className="text-sm text-muted-foreground line-clamp-3 mb-4">{article.content}</div>
                                    <Button variant="outline" size="sm" asChild><Link href={`/news/${article.id}`}>Read More</Link></Button>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-muted-foreground text-center py-12">No news articles published yet.</div>
                          )}
                        </CardContent>
                         {isAdmin && <motion.div className="absolute top-4 right-4" whileHover={{ scale: 1.1 }}><Button onClick={() => setShowManageNews(true)} variant="secondary" size="sm"><Edit className="h-4 w-4 mr-2" /> News</Button></motion.div>}
                      </Card>
                    </motion.div>
                  </TabsContent>
                  <TabsContent value="events">
                    <Card className="shadow-xl group relative mt-2">
                        <CardContent className="p-6">
                            {events.length > 0 ? (
                                <div className="space-y-4">
                                    {events.map((event) => (
                                        <div key={event.id} className="flex items-start gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                            <div className="flex flex-col items-center justify-center bg-primary/10 text-primary p-3 rounded-md">
                                                <span className="text-2xl font-bold">{format(new Date((event.date as any).seconds * 1000), 'd')}</span>
                                                <span className="text-sm uppercase">{format(new Date((event.date as any).seconds * 1000), 'MMM')}</span>
                                            </div>
                                            <div className="flex-grow">
                                                <h3 className="font-semibold">{event.title}</h3>
                                                <p className="text-sm text-muted-foreground"><MapPin className="inline h-4 w-4 mr-1"/>{event.location || 'Not specified'}</p>
                                                <div className="text-sm text-muted-foreground line-clamp-2 mt-1">{event.description}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-muted-foreground text-center py-12">No upcoming events scheduled.</div>
                            )}
                        </CardContent>
                         {isAdmin && <motion.div className="absolute top-4 right-4" whileHover={{ scale: 1.1 }}><Button onClick={() => setShowManageEvents(true)} variant="secondary" size="sm"><Edit className="h-4 w-4 mr-2" /> Events</Button></motion.div>}
                    </Card>
                  </TabsContent>
                </Tabs>
            </section>
            
            {/* Contact & Location Section */}
            <div id="contact" ref={contactRef}>
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={contactInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6 }}
              >
                <Card className="shadow-xl sticky top-24">
                  <CardHeader>
                    <CardTitle className="text-2xl text-primary">Contact & Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <motion.div className="flex items-start gap-3" initial={{ opacity: 0, x: -20 }} animate={contactInView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.1 }}>
                      <MapPin className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />
                      <div><h4 className="font-semibold">Address</h4><p className="text-muted-foreground">{school.address}, {school.district}.</p></div>
                    </motion.div>
                    {school.phoneNumber && <motion.div className="flex items-start gap-3" initial={{ opacity: 0, x: -20 }} animate={contactInView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.2 }}>
                      <Phone className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />
                      <div><h4 className="font-semibold">Phone</h4><p className="text-muted-foreground">{school.phoneNumber}</p></div>
                    </motion.div>}
                    {school.email && <motion.div className="flex items-start gap-3" initial={{ opacity: 0, x: -20 }} animate={contactInView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.3 }}>
                      <Mail className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />
                      <div><h4 className="font-semibold">Email</h4><p className="text-muted-foreground">{school.email}</p></div>
                    </motion.div>}
                    {school.website && <motion.div className="flex items-start gap-3" initial={{ opacity: 0, x: -20 }} animate={contactInView ? { opacity: 1, x: 0 } : {}} transition={{ delay: 0.4 }}>
                      <Globe className="h-5 w-5 mt-1 text-muted-foreground shrink-0" />
                      <div><h4 className="font-semibold">Website</h4><a href={school.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{school.website}</a></div>
                    </motion.div>}
                    <Separator className="my-4" />
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={contactInView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.5 }}>
                      <Button asChild className="w-full bg-accent hover:bg-accent/90 mb-3"><Link href={`/school/auth`}><Users className="mr-2 h-4 w-4" /> Access School Portal</Link></Button>
                    </motion.div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
          
          <section className="mb-20" ref={galleryRef}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={galleryInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6 }}
            >
              <Card className="shadow-xl group relative">
                <CardHeader>
                  <CardTitle className="text-3xl text-primary flex items-center">
                    <ImageIcon className="mr-3" /> Gallery
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {galleryImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {galleryImages.map((image, index) => (
                        <motion.div key={image.id} className="aspect-square relative rounded-xl overflow-hidden group" initial={{ opacity: 0, scale: 0.9 }} animate={galleryInView ? { opacity: 1, scale: 1 } : {}} transition={{ delay: index * 0.1 }} whileHover={{ scale: 1.02 }}>
                          <Image src={image.imageUrl} alt={image.title || 'A school gallery image'} fill className="object-cover transition-transform duration-500 group-hover:scale-110" data-ai-hint="school students" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                            <h3 className="text-white font-medium">{image.title}</h3>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-center py-12">No gallery images published yet.</div>
                  )}
                </CardContent>
                {isAdmin && <motion.div className="absolute top-4 right-4" whileHover={{ scale: 1.1 }}><Button onClick={() => setShowManageGallery(true)} variant="secondary" size="sm"><Edit className="h-4 w-4 mr-2" /> Manage Gallery</Button></motion.div>}
              </Card>
            </motion.div>
          </section>

          <section className="mb-8">
            <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
              <Card className="shadow-xl group relative">
                <CardHeader><CardTitle className="text-2xl text-primary flex items-center"><BookText className="mr-3" /> Publications</CardTitle></CardHeader>
                <CardContent>
                  {publications.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {publications.map((pub, index) => (
                          <motion.a key={pub.id} href={pub.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.1 }} whileHover={{ x: 5 }}>
                            <div className="bg-primary/10 p-3 rounded-lg"><FileText className="h-6 w-6 text-primary" /></div>
                            <div className="flex-1"><h3 className="font-semibold">{pub.title}</h3><p className="text-sm text-muted-foreground">{pub.description || pub.fileName}</p></div>
                            <Button variant="outline" size="sm">Download</Button>
                          </motion.a>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (<div className="text-muted-foreground text-center py-12">No publications available.</div>)}
                </CardContent>
                {isAdmin && <motion.div className="absolute top-4 right-4" whileHover={{ scale: 1.1 }}><Button onClick={() => setShowManagePublications(true)} variant="secondary" size="sm"><Edit className="h-4 w-4 mr-2" /> Manage Publications</Button></motion.div>}
              </Card>
            </motion.div>
          </section>

        </main>

        <footer className="bg-muted/50 py-12 mt-12 border-t">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div><h3 className="text-lg font-semibold mb-4">{school.name}</h3><div className="text-sm text-muted-foreground">{school.siteContent?.footerDescription || "Providing quality education since establishment."}</div></div>
              <div><h3 className="text-lg font-semibold mb-4">Quick Links</h3><ul className="space-y-2 text-sm text-muted-foreground"><li><Link href="#about" className="hover:text-primary transition-colors">About Us</Link></li><li><Link href="#news" className="hover:text-primary transition-colors">News & Events</Link></li><li><Link href="#gallery" className="hover:text-primary transition-colors">Gallery</Link></li><li><Link href="#contact" className="hover:text-primary transition-colors">Contact</Link></li></ul></div>
              <div>
                <h3 className="text-lg font-semibold mb-4">Resources</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                    <li><Link href={school.academicCalendarUrl || '#'} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Academic Calendar</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">School Handbook</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">Uniform Policy</Link></li>
                    <li><Link href="#" className="hover:text-primary transition-colors">FAQs</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-4">Connect With Us</h3>
                <div className="flex gap-4 mb-4">
                  <Link href="#" className="bg-muted p-2 rounded-full hover:bg-primary hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-facebook"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></Link>
                  <Link href="#" className="bg-muted p-2 rounded-full hover:bg-primary hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-twitter"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg></Link>
                  <Link href="#" className="bg-muted p-2 rounded-full hover:bg-primary hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-instagram"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg></Link>
                  <Link href="#" className="bg-muted p-2 rounded-full hover:bg-primary hover:text-white transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-youtube"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg></Link>
                </div>
                <p className="text-sm text-muted-foreground">Subscribe to our newsletter for updates</p>
                <div className="flex mt-2"><input type="email" placeholder="Your email" className="border rounded-l-md px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-primary" /><Button className="rounded-l-none rounded-r-md">Subscribe</Button></div>
              </div>
            </div>
            <Separator className="my-6" />
            <div className="flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground">
              <p>&copy; {new Date().getFullYear()} {school.name}. All Rights Reserved.</p>
              <div className="flex gap-4 mt-4 md:mt-0"><Link href="#" className="hover:text-primary transition-colors">Privacy Policy</Link><Link href="#" className="hover:text-primary transition-colors">Terms of Service</Link><button onClick={() => setShowAdminLogin(true)} className="hover:text-primary transition-colors">Admin Login</button></div>
            </div>
          </div>
        </footer>
      </div>

      <AdminLoginDialog isOpen={showAdminLogin} onOpenChange={setShowAdminLogin} />
      {school && (
        <>
          <EditHeroDialog isOpen={showEditHero} onOpenChange={setShowEditHero} school={school} onUpdate={fetchSchoolData} />
          <EditAboutDialog isOpen={showEditAbout} onOpenChange={setShowEditAbout} school={school} onUpdate={fetchSchoolData} />
          <ManageNewsDialog isOpen={showManageNews} onOpenChange={setShowManageNews} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManageEventsDialog isOpen={showManageEvents} onOpenChange={setShowManageEvents} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManageGalleryDialog isOpen={showManageGallery} onOpenChange={setShowManageGallery} schoolId={schoolId} onUpdate={fetchSchoolData} />
          <ManagePublicationsDialog isOpen={showManagePublications} onOpenChange={setShowManagePublications} schoolId={schoolId} onUpdate={fetchSchoolData} />
        </>
      )}
    </>
  );
}
