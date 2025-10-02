
// src/app/school/dashboard/[schoolId]/layout.tsx
"use client";

import type { ReactNode } from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Bell, Users, BarChart3, GraduationCap, DollarSign, Wallet, Settings, LayoutDashboard,
  Handshake, Baby, MessageSquare, PenSquare, Clock, Bed, Bus, Library, Package,
  UserCog, UserCheck, Briefcase, Calendar, CalendarCheck, FileSpreadsheet, ListChecks,
  BookText, Scale, TrendingUp, BookKey, Hash, KeyRound, Globe, FileText as FileTextIcon,
  MapPin, Contact as ContactIcon, SlidersHorizontal, BookOpen, UserPlus, ArrowLeft, Ticket as TicketIcon, UsersRound, HeartHandshake, Book
} from 'lucide-react';
import {
  SidebarProvider, Sidebar, SidebarTrigger, SidebarInset, SidebarHeader, SidebarContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton
} from "@/components/ui/sidebar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StudentFormDialog } from '@/components/school/student-form-dialog';
import type { School, SchoolClass, Student } from '@/types/school';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const sidebarSections = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    {
      title: "People", href: "/people", icon: UsersRound,
      subItems: [
        { title: "Student Directory", href: "/students/directory" },
        { title: "Staff Directory", href: "/teachers/directory" },
        { title: "Behavior Records", href: "/people/behavior" },
        { title: "Staff Payroll", href: "/payroll" },
      ]
    },
    {
      title: "Academics", href: "/academics", icon: GraduationCap,
      subItems: [
        { title: "Primary/Secondary", href: "/academics/exams" },
        { title: "Nursery", href: "/nursery" },
        { title: "Attendance", href: "/attendance" },
        { title: "Timetables", href: "/timetables" },
      ]
    },
    {
      title: "Finance", href: "/finance", icon: Wallet,
      subItems: [
        { title: "Finance Dashboard", href: "/finance/dashboard" },
        { title: "Student Fees", href: "/fees" },
        { title: "Other Income", href: "/finance/income" },
        { title: "Expenses", href: "/finance/expenses" },
        { title: "Budgets", href: "/finance/budgets" },
        { title: "Accounting", href: "/finance/journal-entries" },
      ]
    },
    {
      title: "Communications", href: "/communications", icon: MessageSquare,
       subItems: [
        { title: "Bulk SMS", href: "/communications/bulk-sms" },
        { title: "Send for Fees", href: "/communications/send-for-fees" },
        { title: "Support Tickets", href: "/tickets" },
      ]
    },
    {
      title: "Reports", href: "/reports", icon: BarChart3,
    },
    {
      title: "Modules", href: "/modules", icon: Package,
      subItems: [
        { title: "School Calendar", href: "/calendar" },
        { title: "Exercise Books", href: "/exercise-books" },
        { title: "Library", href: "/library" },
        { title: "Hostels", href: "/hostels" },
        { title: "Transport", href: "/transport" },
        { title: "Inventory", href: "/inventory" },
      ]
    },
    {
      title: "Settings", href: "/settings", icon: Settings,
    },
];

export default function SchoolDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const params = useParams();
  const schoolId = params.schoolId as string;
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  const fetchSchoolData = useCallback(async () => {
    if (!user || !schoolId) return;
    try {
      const [schoolData, classesData, studentsData] = await Promise.all([
        getSchoolById(schoolId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<Student>(schoolId, 'students'),
      ]);

      if (schoolData && schoolData.adminUids.includes(user.uid)) {
        setSchool(schoolData);
        setSchoolClasses(classesData);
        setAllStudents(studentsData);
      } else {
        toast({ variant: "destructive", title: "Access Denied" });
        router.push('/school/auth');
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to load essential school data for dialogs." });
    }
  }, [schoolId, user, toast, router]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      const handleMenuAction = (event: any, action: string) => {
        if (action === 'add-student') {
          fetchSchoolData().then(() => setIsAddStudentOpen(true));
        }
        if (action === 'record-payment') {
          router.push(`/school/dashboard/${schoolId}/fees/manage-student`);
        }
      };
      ipcRenderer.on('menu-action', handleMenuAction);
      return () => {
        ipcRenderer.removeListener('menu-action', handleMenuAction);
      };
    }
  }, [schoolId, router, fetchSchoolData]);

  const activeAccordionItem = useMemo(() => {
    const activeSection = sidebarSections.find(section => section.subItems && pathname.startsWith(`/school/dashboard/${schoolId}${section.href}`));
    return activeSection ? activeSection.title : undefined;
  }, [pathname, schoolId]);


  return (
    <>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className="p-4">
            <h2 className="font-bold text-xl text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              {school?.name || "Dashboard"}
            </h2>
            <SidebarTrigger />
          </SidebarHeader>
          <SidebarContent>
            <Accordion type="single" collapsible defaultValue={activeAccordionItem} className="w-full">
              {sidebarSections.map((section) => (
                section.subItems ? (
                  <AccordionItem key={section.title} value={section.title} className="border-none">
                    <AccordionTrigger 
                      className="w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-md px-2 py-1.5 [&[data-state=open]]:bg-sidebar-accent [&[data-state=open]]:text-sidebar-accent-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <section.icon className="h-5 w-5"/>
                        <span className="group-data-[collapsible=icon]:hidden">{section.title}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pl-6 pt-1 pb-0">
                      <ul className="flex flex-col gap-1 border-l border-sidebar-border ml-1 pl-3">
                        {section.subItems.map(subItem => (
                          <li key={subItem.title}>
                             <Link href={`/school/dashboard/${schoolId}${subItem.href}`} passHref>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`w-full justify-start h-8 text-xs ${pathname.startsWith(`/school/dashboard/${schoolId}${subItem.href}`) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent/50'}`}
                              >
                                {subItem.title}
                              </Button>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                ) : (
                  <div key={section.title} className="px-2 py-0.5">
                    <Link href={`/school/dashboard/${schoolId}${section.href}`} passHref>
                      <Button
                        variant="ghost"
                        className={`w-full justify-start ${pathname.startsWith(`/school/dashboard/${schoolId}${section.href}`) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'}`}
                      >
                        <section.icon className="mr-2 h-5 w-5" />
                         <span className="group-data-[collapsible=icon]:hidden">{section.title}</span>
                      </Button>
                    </Link>
                  </div>
                )
              ))}
            </Accordion>
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          <main>{children}</main>
        </SidebarInset>
      </SidebarProvider>

      {school && (
        <StudentFormDialog
          isOpen={isAddStudentOpen}
          onOpenChange={setIsAddStudentOpen}
          school={school}
          schoolClasses={schoolClasses}
          allStudents={allStudents}
          initialData={null}
          onStudentSaved={() => {
            fetchSchoolData();
            setIsAddStudentOpen(false);
          }}
        />
      )}
    </>
  );
}
