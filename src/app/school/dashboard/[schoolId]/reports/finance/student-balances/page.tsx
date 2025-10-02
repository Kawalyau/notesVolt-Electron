
"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { getSchoolById, getSchoolSubcollectionItems } from '@/services/schoolService';
import type { School, Student, SchoolClass } from '@/types/school';
import * as XLSX from 'xlsx';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, Filter, Search as SearchIcon, ShieldAlert, UserCircle, WalletCards, Printer } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Timestamp } from 'firebase/firestore';

const ALL_CLASSES_SENTINEL = "_ALL_CLASSES_";

const getInitials = (firstName?: string, lastName?: string) => {
  if (!firstName && !lastName) return "S";
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
};

export default function StudentFeeBalancesReportPage() {
  const params = useParams();
  const schoolId = params.schoolId as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [school, setSchool] = useState<School | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string>(ALL_CLASSES_SENTINEL);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<'balanceDesc' | 'balanceAsc' | 'nameAsc'>('nameAsc');
  const [isDemandLetterDialogOpen, setIsDemandLetterDialogOpen] = useState(false);
  const [minimumBalance, setMinimumBalance] = useState<string>("0");
  const [letterTitle, setLetterTitle] = useState<string>("Outstanding Fee Balance Notice");
  const [letterSubject, setLetterSubject] = useState<string>("Outstanding Fee Balance");
  const [openingSalutation, setOpeningSalutation] = useState<string>("Dear {studentName},");
  const [mainContent, setMainContent] = useState<string>("We hope this letter finds you well. This is a reminder that your fee balance for the current term is <strong>UGX {balance}</strong>.");
  const [closingContent, setClosingContent] = useState<string>("Please settle the outstanding fee balance at your earliest convenience. For any inquiries, please contact the school bursar's office.");
  const [signatoryName, setSignatoryName] = useState<string>("Bursar");
  const [signatoryTitle, setSignatoryTitle] = useState<string>("Bursar");

  useEffect(() => {
    if (authLoading || !user || !schoolId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const fetchedSchool = await getSchoolById(schoolId);
        if (!fetchedSchool || !fetchedSchool.adminUids.includes(user.uid)) {
          toast({ variant: "destructive", title: "Access Denied" });
          router.push(`/school/dashboard/${schoolId}`);
          setIsAdminForSchool(false); 
          return;
        }
        setSchool(fetchedSchool); 
        setIsAdminForSchool(true);

        const [studentsData, classesData] = await Promise.all([
          getSchoolSubcollectionItems<Student>(schoolId, 'students'),
          getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        ]);
        setAllStudents(studentsData);
        setSchoolClasses(classesData.sort((a, b) => (a.class || "").localeCompare(b.class || "")));

      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load report data." });
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [schoolId, user, authLoading, router, toast]);

  const filteredAndSortedStudents = useMemo(() => {
    if (isLoading) return [];
    let studentsToProcess = allStudents;

    if (selectedClassId !== ALL_CLASSES_SENTINEL) {
      studentsToProcess = studentsToProcess.filter(s => s.classId === selectedClassId);
    }

    if (searchTerm.trim() !== "") {
      const lowerSearchTerm = searchTerm.toLowerCase();
      studentsToProcess = studentsToProcess.filter(s =>
        s.firstName.toLowerCase().includes(lowerSearchTerm) ||
        s.lastName.toLowerCase().includes(lowerSearchTerm) ||
        (s.middleName && s.middleName.toLowerCase().includes(lowerSearchTerm)) ||
        s.studentRegistrationNumber.toLowerCase().includes(lowerSearchTerm)
      );
    }
    
    return studentsToProcess.sort((a, b) => {
        const balanceA = a.feeBalance || 0;
        const balanceB = b.feeBalance || 0;
        if (sortBy === 'balanceDesc') return balanceB - balanceA;
        if (sortBy === 'balanceAsc') return balanceA - balanceB;
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });

  }, [allStudents, selectedClassId, searchTerm, sortBy, isLoading]);

  const getClassName = (classId: string) => {
    const foundClass = schoolClasses.find(c => c.id === classId);
    return foundClass ? (foundClass.code ? `${foundClass.class} (${foundClass.code})` : foundClass.class) : 'N/A';
  }

  const handlePrintReport = () => {
    const printContent = document.getElementById("printableStudentBalancesReport");
    if (printContent && school) {
      const printWindow = window.open('', '_blank', 'height=800,width=1000');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Student Fee Balances Report</title>');
        printWindow.document.write(`
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; font-size: 10pt; }
            .report-header { text-align: center; margin-bottom: 20px; }
            .report-header h1 { font-size: 16pt; margin: 0; color: #000; font-weight: 600; }
            .report-header h2 { font-size: 12pt; margin: 0; color: #000; font-weight: 600; }
            .report-header p { font-size: 9pt; margin: 2px 0; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 9pt; color: #000; font-weight: 500; }
            th { background-color: #f0f4f8; font-weight: 600; color: #000; }
            td.number, th.number { text-align: right; }
            .negative-balance { color: #000; }
            .positive-balance { color: #000; }
            .no-print { display: none !important; }
            @page { size: auto; margin: 0.5in; }
          </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write('<div class="report-header">');
        if (school.badgeImageUrl) {
          printWindow.document.write(`<img src="${school.badgeImageUrl}" alt="${school.name} Logo" style="max-height: 60px; margin-bottom: 10px; object-fit: contain;">`);
        }
        printWindow.document.write(`<h1>${school.name}</h1>`);
        printWindow.document.write(`<h2>Student Fee Balances Report</h2>`);
        const selectedClassName = selectedClassId === ALL_CLASSES_SENTINEL ? "All Classes" : getClassName(selectedClassId);
        printWindow.document.write(`<p>Class: ${selectedClassName} | Report Date: ${format(new Date(), "PP")}</p>`);
        printWindow.document.write('</div>');
        printWindow.document.write(printContent.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
      }
    }
  };

  const handlePrintDemandLetters = () => {
    if (!school) return;
    const minBalance = parseFloat(minimumBalance) || 0;
    const studentsWithBalance = filteredAndSortedStudents.filter(student => (student.feeBalance || 0) >= minBalance);
    
    if (studentsWithBalance.length === 0) {
      toast({ 
        variant: "destructive", 
        title: "No Students Found", 
        description: "No students have a balance above the specified minimum." 
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'height=800,width=1000');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Demand Letters</title>');
      printWindow.document.write(`
        <style>
          @page {
            size: A4;
            margin: 2cm;
          }
          body {
            font-family: 'Georgia', serif;
            color: #000;
            line-height: 1.6;
            background-color: white;
          }
          .letter-container {
            max-width: 100%;
            margin: 0 auto;
            padding: 2cm;
            box-sizing: border-box;
          }
          .letterhead {
            text-align: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid #000;
          }
          .letterhead img {
            max-height: 80px;
            margin-bottom: 0.5rem;
          }
          .letterhead h1 {
            font-size: 1.8rem;
            font-weight: 700;
            margin: 0;
            letter-spacing: 1px;
            color: #000;
          }
          .letterhead p {
            margin: 0.25rem 0;
            font-size: 0.9rem;
            color: #555;
          }
          .letter-date {
            text-align: right;
            margin: 1.5rem 0;
            font-style: italic;
          }
          .recipient-address {
            margin-bottom: 2rem;
            font-size: 0.95rem;
          }
          .letter-title {
            font-size: 1.4rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 1.5rem;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .letter-body {
            margin: 2rem 0;
          }
          .letter-body p {
            margin: 1rem 0;
            text-align: justify;
          }
          .letter-subject {
            font-weight: 700;
            margin: 1.5rem 0;
            font-style: italic;
          }
          .signature-block {
            margin-top: 3rem;
            text-align: right;
          }
          .signature-line {
            display: inline-block;
            width: 250px;
            border-top: 1px solid #000;
            margin: 0.5rem 0;
          }
          .signature-name {
            font-weight: 700;
            margin-top: 0.5rem;
          }
          .signature-title {
            font-style: italic;
          }
          .page-break {
            page-break-after: always;
          }
        </style>
      `);
      printWindow.document.write('</head><body>');

      studentsWithBalance.forEach((student, index) => {
        const studentName = `${student.firstName} ${student.lastName}`;
        const balance = (student.feeBalance || 0).toFixed(2);
        const schoolPayStudentId = student.schoolPayStudentId
        ? `Okusasula ensimbi z'essomero osobola okukozesa essimu yo:
      Nyiga: *185# / *165#
      londako: School fees (6) owa MTN alondako payments.
      awo olondako: SchoolPay (2)
      womala londako: pay fees (1)
      awo oteekemu koodi y’omuyizi: ${student.schoolPayStudentId}.
      Koodi erina okuleeta amanya ${student.firstName} ${student.lastName}
      
      Bw’oba n’ebibuuzo, tukyalireko ku ofiisi y’omuwanika w’essomero.`
        : "";
      
        // Replace placeholders in templates
        const processedSalutation = openingSalutation.replace('{studentName}', studentName);
        const processedMainContent = mainContent
          .replace('{balance}', balance)
          .replace('{schoolPayStudentId}', schoolPayStudentId)
          .replace('{studentName}', studentName)
          .replace('{className}', getClassName(student.classId))
          .replace('{regNumber}', student.studentRegistrationNumber);
        
        const processedClosingContent = closingContent
          .replace('{balance}', balance)
          .replace('{schoolPayStudentId}', schoolPayStudentId)
          .replace('{studentName}', studentName);

        printWindow.document.write('<div class="letter-container">');
        
        // Letterhead
        printWindow.document.write('<div class="letterhead">');
        if (school.badgeImageUrl) {
          printWindow.document.write(`<img src="${school.badgeImageUrl}" alt="${school.name} Logo">`);
        }
        printWindow.document.write(`<h1>${school.name}</h1>`);
        printWindow.document.write(`<p>${school.address || ''}</p>`);
        printWindow.document.write(`<p>${school.phoneNumber || ''} • ${school.email || ''}</p>`);
        printWindow.document.write('</div>');
        
        // Date
        printWindow.document.write('<div class="letter-date">');
        printWindow.document.write(format(new Date(), "PPPP"));
        printWindow.document.write('</div>');
        
        // Recipient Address
        printWindow.document.write('<div class="recipient-address">');
        printWindow.document.write(`<p>${student.firstName} ${student.middleName || ''} ${student.lastName}</p>`);
        printWindow.document.write(`<p>Registration No: ${student.studentRegistrationNumber}</p>`);
        printWindow.document.write(`<p>Class: ${getClassName(student.classId)}</p>`);
        printWindow.document.write('</div>');
        
        // Letter Content
        printWindow.document.write('<div class="letter-title">');
        printWindow.document.write(letterTitle);
        printWindow.document.write('</div>');
        
        printWindow.document.write('<div class="letter-body">');
        printWindow.document.write(`<p>${processedSalutation}</p>`);
        printWindow.document.write(`<div class="letter-subject">Ens: ${letterSubject}</div>`);
        printWindow.document.write(`<p>${processedMainContent}</p>`);
        printWindow.document.write(`<p>${processedClosingContent}</p>`);
        printWindow.document.write('</div>');
        
        // Signature
        printWindow.document.write('<div class="signature-block">');
        printWindow.document.write('<p>Nze omuweerezaawo,</p>');
        printWindow.document.write('<div class="signature-line"></div>');
        printWindow.document.write(`<div class="signature-name">${signatoryName}</div>`);
        printWindow.document.write(`<div class="signature-title">${signatoryTitle}</div>`);
    
        printWindow.document.write('</div>');
        
        printWindow.document.write('</div>'); // letter-container
        
        // Add page break except for last letter
        if (index < studentsWithBalance.length - 1) {
          printWindow.document.write('<div class="page-break"></div>');
        }
      });

      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
    setIsDemandLetterDialogOpen(false);
  };
  const handleExport = () => {
    const dataToExport = filteredAndSortedStudents.map(student => ({
      'First Name': student.firstName,
      'Last Name': student.lastName,
      'Registration Number': student.studentRegistrationNumber,
      'Class': getClassName(student.classId),
      'Fee Balance': student.feeBalance || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Balances');
    XLSX.writeFile(workbook, `Student_Fee_Balances_${school?.name.replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast({ title: 'Export Successful', description: 'Student balances have been exported to Excel.' });
  };


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-15rem)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  if (!isAdminForSchool && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to view this report.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-grow">
              <CardTitle className="text-2xl flex items-center">
                <WalletCards className="mr-3 h-6 w-6 text-primary"/>
                Student Fee Balances Report
              </CardTitle>
              <CardDescription>Overview of current fee balances for students in {school?.name || 'the school'}.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExport} variant="outline" size="sm" disabled={filteredAndSortedStudents.length === 0}>
                  <Printer className="mr-2 h-4 w-4"/> Export Excel
              </Button>
              <Button onClick={handlePrintReport} variant="outline" size="sm" disabled={filteredAndSortedStudents.length === 0}>
                <Printer className="mr-2 h-4 w-4"/> Print Report
              </Button>
              <Dialog open={isDemandLetterDialogOpen} onOpenChange={setIsDemandLetterDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={filteredAndSortedStudents.length === 0}>
                    <Printer className="mr-2 h-4 w-4"/> Print Demand Letters
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Customize Demand Letters</DialogTitle>
                    <DialogDescription>
                      Configure the demand letters for students with outstanding balances.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="minimumBalance" className="text-right">
                        Minimum Balance (UGX)
                      </Label>
                      <Input
                        id="minimumBalance"
                        type="number"
                        value={minimumBalance}
                        onChange={(e) => setMinimumBalance(e.target.value)}
                        className="col-span-3"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="letterTitle" className="text-right">
                        Letter Title
                      </Label>
                      <Input
                        id="letterTitle"
                        value={letterTitle}
                        onChange={(e) => setLetterTitle(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="letterSubject" className="text-right">
                        Subject Line
                      </Label>
                      <Input
                        id="letterSubject"
                        value={letterSubject}
                        onChange={(e) => setLetterSubject(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="openingSalutation" className="text-right">
                        Opening Salutation
                      </Label>
                      <Input
                        id="openingSalutation"
                        value={openingSalutation}
                        onChange={(e) => setOpeningSalutation(e.target.value)}
                        className="col-span-3"
                        placeholder="Dear {studentName},"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="mainContent" className="text-right">
                        Main Content
                      </Label>
                      <Textarea
                        id="mainContent"
                        value={mainContent}
                        onChange={(e) => setMainContent(e.target.value)}
                        className="col-span-3"
                        rows={4}
                        placeholder="Available placeholders: {studentName}, {balance}, {className}, {regNumber}"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="closingContent" className="text-right">
                        Closing Content
                      </Label>
                      <Textarea
                        id="closingContent"
                        value={closingContent}
                        onChange={(e) => setClosingContent(e.target.value)}
                        className="col-span-3"
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="signatoryName" className="text-right">
                        Signatory Name
                      </Label>
                      <Input
                        id="signatoryName"
                        value={signatoryName}
                        onChange={(e) => setSignatoryName(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="signatoryTitle" className="text-right">
                        Signatory Title
                      </Label>
                      <Input
                        id="signatoryTitle"
                        value={signatoryTitle}
                        onChange={(e) => setSignatoryTitle(e.target.value)}
                        className="col-span-3"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" onClick={handlePrintDemandLetters}>Generate Letters</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 w-full mb-4">
            <div className="relative w-full sm:w-auto sm:min-w-[200px]">
              <Input
                type="search"
                placeholder="Search student name/reg..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
              <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            <div className="w-full sm:w-auto sm:min-w-[200px]">
              <Select
                value={selectedClassId}
                onValueChange={(value) => setSelectedClassId(value)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground"/>
                  <SelectValue placeholder="Filter by Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES_SENTINEL}>All Classes</SelectItem>
                  {schoolClasses.map(cls => (
                    <SelectItem key={cls.id} value={cls.id}>{getClassName(cls.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[150px]">
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nameAsc">Name (A-Z)</SelectItem>
                  <SelectItem value="balanceDesc">Balance (High to Low)</SelectItem>
                  <SelectItem value="balanceAsc">Balance (Low to High)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredAndSortedStudents.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <UserCircle className="h-12 w-12 mx-auto mb-3"/>
              <p>{searchTerm || selectedClassId !== ALL_CLASSES_SENTINEL ? "No students match your search/filter criteria." : "No students found."}</p>
            </div>
          ) : (
            <div id="printableStudentBalancesReport" className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-black">Student Name</TableHead>
                    <TableHead className="font-semibold text-black">Reg. No.</TableHead>
                    <TableHead className="font-semibold text-black">Class</TableHead>
                    <TableHead className="text-right font-semibold text-black">Fee Balance (UGX)</TableHead>
                    <TableHead className="text-center no-print font-semibold text-black">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium text-black">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={student.photoUrl || undefined} alt={`${student.firstName} ${student.lastName}`} />
                            <AvatarFallback>{getInitials(student.firstName, student.lastName)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{student.firstName} {student.middleName} {student.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-black">{student.studentRegistrationNumber}</TableCell>
                      <TableCell className="text-sm text-black">{getClassName(student.classId)}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold text-black ${(student.feeBalance || 0) > 0 ? 'positive-balance' : ((student.feeBalance || 0) < 0 ? 'negative-balance' : '')}`}>
                        {(student.feeBalance || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center no-print">
                        <Link href={`/school/dashboard/${schoolId}/fees/manage-student/${student.id}`}>
                          <Button variant="outline" size="xs">Manage Fees</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
