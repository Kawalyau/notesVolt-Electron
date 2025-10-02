
// src/app/school/dashboard/[schoolId]/students/[studentId]/pay-requirements/page.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { firestore } from '@/config/firebase';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import type { Student, School, PhysicalRequirement, StudentRequirementStatus, SchoolAcademicYear, SchoolClass, StudentRequirementAssignmentLog, AppTimestamp } from '@/types/school';
import { getSchoolById, getSchoolSubcollectionItems, getStudentRequirementStatus, updateStudentRequirementStatus, getStudentById, getAllStudentRequirementStatuses, addStudentRequirementAssignmentLog, getStudentRequirementAssignmentLogs } from '@/services/schoolService';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, ShieldAlert, Receipt, DollarSign, CheckCircle, Package, AlertCircle, Printer, Info, SaveAll, PackagePlus, History, HandCoins, ListOrdered } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogDescription
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from '@/components/ui/separator';
import { AssignRequirementItemsDialog } from '@/components/school/assign-requirement-items-dialog';
import Image from 'next/image'; // For receipt logo


interface PendingInputValues {
  [requirementId: string]: {
    amountPaidStr: string;
    quantityProvidedStr: string;
    activeInput: 'amount' | 'quantity' | null;
  };
}

interface ReceiptItemData {
  id: string;
  name: string;
  isCompulsory: boolean;
  unitPrice: number;
  qtyNeeded: number;
  qtyPhysicallyProvidedByStudent: number;
  qtyCoveredByPaymentMonetaryEquiv: number;
  qtyAlreadyGivenToStudent: number;
  effectiveTotalQtySettled: number;
  physicalQtyStillDueFromStudent: number;
  netMonetaryBalanceDueForUnprovidedItems: number;
  isCurrentTransactionItem: boolean;
}

interface ReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentSchoolPayId?: string | null; // Added for SchoolPay ID
  studentClass: string;
  transactionDate: string;
  currentAcademicYear?: string;
  currentTerm?: string;
  items: ReceiptItemData[];
  totalNetMonetaryDueOverall: number;
}


const calculateRequirementStatusString = (
  requirement: PhysicalRequirement,
  currentAmountPaidByStudent: number,
  currentQuantityProvidedByStudent: number
): 'Fully Settled' | 'Partially Settled' | 'Pending' | 'Exempted' | 'Fully Settled (Monetary)' | 'Fully Settled (Physical)' | 'Fully Settled (Mixed)' => {
  const price = requirement.price || 0;
  const quantityNeeded = requirement.quantityPerStudent || 1;

  if (quantityNeeded <= 0) return 'Fully Settled'; // Or 'Exempted' if needed

  // Calculate how many items are covered by monetary payment
  let quantityCoveredByMoney = 0;
  if (price > 0) {
    quantityCoveredByMoney = Math.floor(currentAmountPaidByStudent / price);
  }

  const totalEffectiveQuantitySettled = currentQuantityProvidedByStudent + quantityCoveredByMoney;

  if (totalEffectiveQuantitySettled >= quantityNeeded) {
    if (currentQuantityProvidedByStudent >= quantityNeeded) return 'Fully Settled (Physical)';
    if (quantityCoveredByMoney >= quantityNeeded && currentQuantityProvidedByStudent === 0) return 'Fully Settled (Monetary)';
    return 'Fully Settled (Mixed)';
  }
  if (currentAmountPaidByStudent > 0 || currentQuantityProvidedByStudent > 0) {
    return 'Partially Settled';
  }
  return 'Pending';
};


const getBadgeVariantForStatus = (status: ReturnType<typeof calculateRequirementStatusString>): 'default' | 'secondary' | 'outline' | 'destructive' => {
  switch (status) {
    case 'Fully Settled':
    case 'Fully Settled (Monetary)':
    case 'Fully Settled (Physical)':
    case 'Fully Settled (Mixed)':
      return 'default'; // Greenish or primary
    case 'Partially Settled':
      return 'secondary'; // Yellowish or muted
    case 'Pending':
      return 'outline'; // A clear visual that it's outstanding
    case 'Exempted':
      return 'outline';
    default:
      return 'outline';
  }
};


export default function PayStudentRequirementsPage() {
  const params = useParams();
  const router = useRouter();
  const { user: adminUserAuth, userProfile: adminProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const schoolId = params.schoolId as string;
  const studentId = params.studentId as string;

  const [school, setSchool] = useState<School | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [schoolAcademicYears, setSchoolAcademicYears] = useState<SchoolAcademicYear[]>([]);
  const [allSchoolRequirements, setAllSchoolRequirements] = useState<PhysicalRequirement[]>([]);
  const [allStudentRequirementStatuses, setAllStudentRequirementStatuses] = useState<Record<string, StudentRequirementStatus>>({});
  
  const [pendingInputs, setPendingInputs] = useState<PendingInputValues>({});
  const [assignmentLogsByReqId, setAssignmentLogsByReqId] = useState<Record<string, StudentRequirementAssignmentLog[]>>({});

  const [isSubmittingAllTransactions, setIsSubmittingAllTransactions] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAdminForSchool, setIsAdminForSchool] = useState(false);

  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  
  const [processedInLastTransaction, setProcessedInLastTransaction] = useState<string[]>([]);

  const [assigningRequirement, setAssigningRequirement] = useState<(PhysicalRequirement & { status?: StudentRequirementStatus | null, qtyAlreadyGivenToStudent: number, maxQtyAvailableForNewAssignment: number }) | null>(null);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  const fetchAssignmentLogsForRequirement = useCallback(async (reqId: string) => {
    if (!schoolId || !studentId) return;
    try {
      const logs = await getStudentRequirementAssignmentLogs(schoolId, studentId, reqId);
      setAssignmentLogsByReqId(prev => ({ ...prev, [reqId]: logs }));
    } catch (error) {
      console.error(`Failed to fetch assignment logs for req ${reqId}:`, error);
    }
  }, [schoolId, studentId]);

  const fetchAllData = useCallback(async (initialLoad = true) => {
    if (!adminUserAuth || !schoolId || !studentId) return;
    if (initialLoad) setIsLoadingData(true);

    try {
      const fetchedSchool = await getSchoolById(schoolId);
      if (!fetchedSchool || !fetchedSchool.adminUids.includes(adminUserAuth.uid)) {
        toast({ variant: "destructive", title: "Access Denied", description: "You are not an admin for this school." });
        router.push(`/school/dashboard/${schoolId}`);
        setIsAdminForSchool(false); setSchool(null); return;
      }
      setSchool(fetchedSchool); setIsAdminForSchool(true);

      const [fetchedStudent, fetchedClasses, fetchedAcademicYears, schoolReqsData] = await Promise.all([
        getStudentById(schoolId, studentId),
        getSchoolSubcollectionItems<SchoolClass>(schoolId, 'schoolClasses'),
        getSchoolSubcollectionItems<SchoolAcademicYear>(schoolId, 'schoolAcademicYears'),
        getSchoolSubcollectionItems<PhysicalRequirement>(schoolId, 'physicalRequirements'),
      ]);

      setSchoolClasses(fetchedClasses); setSchoolAcademicYears(fetchedAcademicYears); setAllSchoolRequirements(schoolReqsData);

      if (!fetchedStudent) {
        toast({ variant: "destructive", title: "Error", description: "Student not found." });
        setStudent(null); if (initialLoad) setIsLoadingData(false); return;
      }
      setStudent(fetchedStudent);
      
      const studentApplicableRequirements = schoolReqsData.filter(req => 
        (req.assignmentType === 'class' && req.applicableClassIds?.includes(fetchedStudent.classId)) ||
        req.assignmentType === 'optional_general'
      );
      
      const fetchedStatuses: Record<string, StudentRequirementStatus> = {};
      const logsPromises: Promise<void>[] = [];
      const newPendingInputs: PendingInputValues = {};

      for (const req of studentApplicableRequirements) {
        const status = await getStudentRequirementStatus(schoolId, studentId, req.id);
        if (status) {
          fetchedStatuses[req.id] = status;
        }
        logsPromises.push(fetchAssignmentLogsForRequirement(req.id));
        newPendingInputs[req.id] = { amountPaidStr: '', quantityProvidedStr: '', activeInput: null };
      }
      await Promise.all(logsPromises);
      setAllStudentRequirementStatuses(fetchedStatuses);
      setPendingInputs(newPendingInputs);

    } catch (error) {
      console.error("Error fetching data for payment page:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load requirement or student data." });
    } finally {
      if (initialLoad) setIsLoadingData(false);
    }
  }, [adminUserAuth, schoolId, studentId, toast, router, fetchAssignmentLogsForRequirement]);

  useEffect(() => {
    if (authLoading) return;
    if (!adminUserAuth) {
      router.replace(`/login?redirect=/school/dashboard/${schoolId}/students/${studentId}/pay-requirements`);
      return;
    }
    fetchAllData(true);
  }, [adminUserAuth, authLoading, router, schoolId, studentId, fetchAllData]);

  const applicableRequirementsWithDetails = useMemo(() => {
    if (!student || !allSchoolRequirements.length) return [];

    return allSchoolRequirements
      .filter(req => 
        (req.assignmentType === 'class' && req.applicableClassIds?.includes(student.classId)) ||
        req.assignmentType === 'optional_general'
      )
      .map(req => {
        const status = allStudentRequirementStatuses[req.id]; 
        const logs = assignmentLogsByReqId[req.id] || [];
        const qtyAlreadyGivenToStudent = logs.reduce((sum, log) => sum + log.quantityAssigned, 0);
        
        const studentProvidedQty = status?.quantityProvided || 0;
        const studentPaidAmount = status?.amountPaid || 0;
        const unitPrice = req.price || 0;
        const qtyNeeded = req.quantityPerStudent || 1;
        
        let qtyCoveredByPayment = 0;
        if (unitPrice > 0) {
            qtyCoveredByPayment = Math.floor(studentPaidAmount / unitPrice);
        }
        const totalQtyEffectivelySettledByStudent = Math.min(qtyNeeded, studentProvidedQty + qtyCoveredByPayment);
        const maxQtyAvailableForNewAssignment = Math.max(0, totalQtyEffectivelySettledByStudent - qtyAlreadyGivenToStudent);
        
        const calculatedStatusVal = calculateRequirementStatusString(req, studentPaidAmount, studentProvidedQty);
        const isFullySettledVal = calculatedStatusVal.startsWith('Fully Settled');

        return { 
          ...req, 
          status: status || null,
          qtyAlreadyGivenToStudent,
          maxQtyAvailableForNewAssignment,
          calculatedStatus: calculatedStatusVal,
          isFullySettled: isFullySettledVal
        };
      }).sort((a, b) => { // Sort: Compulsory first, then by name
        if (a.isCompulsory && !b.isCompulsory) return -1;
        if (!a.isCompulsory && b.isCompulsory) return 1;
        return (a.name || "").localeCompare(b.name || "");
    });
  }, [student, allSchoolRequirements, allStudentRequirementStatuses, assignmentLogsByReqId]);

  const handleRequirementInputChange = (
    requirementId: string,
    field: 'amountPaidStr' | 'quantityProvidedStr',
    value: string
  ) => {
    setPendingInputs(prev => {
      const currentReqInputs = { ...(prev[requirementId] || { amountPaidStr: '', quantityProvidedStr: '', activeInput: null }) };
      const otherFieldKey = field === 'amountPaidStr' ? 'quantityProvidedStr' : 'amountPaidStr';
      
      currentReqInputs[field] = value;
      if (value.trim() !== '') {
        currentReqInputs[otherFieldKey] = ''; // Clear the other input
        currentReqInputs.activeInput = field === 'amountPaidStr' ? 'amount' : 'quantity';
      } else {
        // If this input is cleared, and it was the active one, reset activeInput
        if (currentReqInputs.activeInput === (field === 'amountPaidStr' ? 'amount' : 'quantity')) {
          currentReqInputs.activeInput = null;
        }
      }
      return { ...prev, [requirementId]: currentReqInputs };
    });
  };

  const handleRequirementInputFocus = (
    requirementId: string,
    inputField: 'amount' | 'quantity' | null
  ) => {
    setPendingInputs(prev => {
      const currentReqState = { ...(prev[requirementId] || { amountPaidStr: '', quantityProvidedStr: '', activeInput: null }) };
      if(currentReqState.activeInput !== inputField){
        currentReqState.activeInput = inputField;
        // If focusing one input, clear the other's string value if it was active
        if (inputField === 'amount' && currentReqState.quantityProvidedStr) {
          currentReqState.quantityProvidedStr = '';
        } else if (inputField === 'quantity' && currentReqState.amountPaidStr) {
          currentReqState.amountPaidStr = '';
        }
      }
      return { ...prev, [requirementId]: currentReqState };
    });
  };
  
  const handleRecordAllTransactions = async () => {
    if (!school || !student || !adminProfile) return;
    setIsSubmittingAllTransactions(true);
    const processedIds: string[] = [];
    let anyErrorOccurred = false;

    for (const reqId in pendingInputs) {
      const input = pendingInputs[reqId];
      const requirement = allSchoolRequirements.find(r => r.id === reqId);
      if (!requirement) continue;

      let transactionAmountPaid = parseFloat(input.amountPaidStr);
      let transactionQuantityProvided = parseInt(input.quantityProvidedStr, 10);

      if (isNaN(transactionAmountPaid)) transactionAmountPaid = 0;
      if (isNaN(transactionQuantityProvided)) transactionQuantityProvided = 0;

      if (transactionAmountPaid <= 0 && transactionQuantityProvided <= 0) continue;

      const currentStatus = allStudentRequirementStatuses[reqId];
      const newTotalAmountPaid = (currentStatus?.amountPaid || 0) + transactionAmountPaid;
      const newTotalQuantityProvided = (currentStatus?.quantityProvided || 0) + transactionQuantityProvided;
      const newStatusString = calculateRequirementStatusString(requirement, newTotalAmountPaid, newTotalQuantityProvided);

      const statusUpdate: Partial<StudentRequirementStatus> = {
        requirementId: requirement.id,
        requirementName: requirement.name,
        originalPricePerUnit: requirement.price || 0,
        originalQuantityNeeded: requirement.quantityPerStudent || 1,
        totalExpectedAmount: (requirement.price || 0) * (requirement.quantityPerStudent || 1),
        amountPaid: newTotalAmountPaid,
        quantityProvided: newTotalQuantityProvided,
        status: newStatusString,
        lastTransactionDate: serverTimestamp() as Timestamp,
        academicYearId: school.currentAcademicYearId || null,
        term: school.currentTerm || null,
      };

      try {
        await updateStudentRequirementStatus(school.id, student.id, requirement.id, statusUpdate);
        processedIds.push(reqId);
      } catch (error: any) {
        anyErrorOccurred = true;
        toast({ variant: "destructive", title: `Error for ${requirement.name}`, description: error.message });
      }
    }

    if (processedIds.length > 0) {
      toast({ title: "Transactions Recorded", description: `${processedIds.length} requirement(s) updated successfully.` });
      setProcessedInLastTransaction(processedIds);
      await prepareReceiptData(processedIds);
      await fetchAllData(false);
      setPendingInputs(prev => {
        const clearedInputs = { ...prev };
        processedIds.forEach(id => {
          clearedInputs[id] = { amountPaidStr: '', quantityProvidedStr: '', activeInput: null };
        });
        return clearedInputs;
      });
    } else if (!anyErrorOccurred) {
      toast({ title: "No Transactions", description: "No valid amounts or quantities were entered to record." });
    }
    setIsSubmittingAllTransactions(false);
  };

  const handleAssignmentRecorded = (updatedRequirementId: string) => {
    fetchAssignmentLogsForRequirement(updatedRequirementId);
    fetchAllData(false); // Re-fetch all data to update derived states like maxQtyAvailableForNewAssignment
  };
  
  const openAssignmentDialog = (req: (PhysicalRequirement & { status?: StudentRequirementStatus | null, qtyAlreadyGivenToStudent: number, maxQtyAvailableForNewAssignment: number })) => {
    setAssigningRequirement(req);
    setIsAssignDialogOpen(true);
  };

  const hasAnyPendingInputs = useMemo(() => {
    if (isLoadingData) return false;
    return Object.values(pendingInputs).some(input =>
      (input.amountPaidStr && input.amountPaidStr.trim() !== '' && parseFloat(input.amountPaidStr) > 0) ||
      (input.quantityProvidedStr && input.quantityProvidedStr.trim() !== '' && parseInt(input.quantityProvidedStr, 10) > 0)
    );
  }, [pendingInputs, isLoadingData]);


  const prepareReceiptData = async (highlightedReqIds: string[] = []) => {
    if (!school || !student) return;

    const studentClass = schoolClasses.find(c => c.id === student.classId)?.name || 'N/A';
    const currentAcademicYearObj = schoolAcademicYears.find(ay => ay.id === school.currentAcademicYearId);
    const currentAcademicYear = currentAcademicYearObj?.year || 'N/A';
    let totalNetMonetaryDueOverall = 0;

    const itemsForReceiptPromises = applicableRequirementsWithDetails
        .filter(req => req.isCompulsory || ((allStudentRequirementStatuses[req.id]?.amountPaid || 0) > 0 || (allStudentRequirementStatuses[req.id]?.quantityProvided || 0) > 0))
        .map(async (req) => {
            const status = allStudentRequirementStatuses[req.id];
            const logs = assignmentLogsByReqId[req.id] || [];
            const qtyAlreadyGivenToStudent = logs.reduce((sum, log) => sum + log.quantityAssigned, 0);

            const unitPrice = req.price || 0;
            const qtyNeeded = req.quantityPerStudent || 1;

            const qtyPhysicallyProvidedByStudent = status?.quantityProvided || 0;
            const totalMonetaryAmountPaidByStudent = status?.amountPaid || 0;

            let qtyCoveredByPaymentMonetaryEquiv = 0;
            if (unitPrice > 0) {
                qtyCoveredByPaymentMonetaryEquiv = Math.floor(totalMonetaryAmountPaidByStudent / unitPrice);
            }

            const effectiveTotalQtySettledByStudent = Math.min(qtyNeeded, qtyPhysicallyProvidedByStudent + qtyCoveredByPaymentMonetaryEquiv);
            const physicalQtyStillDueFromStudent = Math.max(0, qtyNeeded - qtyPhysicallyProvidedByStudent);
            
            const valueOfPhysicallyUnprovidedItems = physicalQtyStillDueFromStudent * unitPrice;
            const netMonetaryBalanceDueForUnprovidedItems = Math.max(0, valueOfPhysicallyUnprovidedItems - totalMonetaryAmountPaidByStudent);
            
            totalNetMonetaryDueOverall += netMonetaryBalanceDueForUnprovidedItems;

            return {
                id: req.id,
                name: req.name,
                isCompulsory: req.isCompulsory || false,
                unitPrice: unitPrice,
                qtyNeeded: qtyNeeded,
                qtyPhysicallyProvidedByStudent: qtyPhysicallyProvidedByStudent,
                qtyCoveredByPaymentMonetaryEquiv: qtyCoveredByPaymentMonetaryEquiv,
                qtyAlreadyGivenToStudent: qtyAlreadyGivenToStudent,
                effectiveTotalQtySettled: effectiveTotalQtySettledByStudent,
                physicalQtyStillDueFromStudent: physicalQtyStillDueFromStudent,
                netMonetaryBalanceDueForUnprovidedItems: netMonetaryBalanceDueForUnprovidedItems,
                isCurrentTransactionItem: highlightedReqIds.includes(req.id),
            };
        });

    const itemsForReceipt = await Promise.all(itemsForReceiptPromises);


    setReceiptData({
      schoolName: school.name,
      schoolAddress: school.address,
      schoolPhone: school.phoneNumber,
      schoolLogoUrl: school.badgeImageUrl,
      studentName: `${student.firstName} ${student.lastName}`,
      studentRegNo: student.studentRegistrationNumber,
      studentSchoolPayId: student.schoolPayStudentId,
      studentClass: studentClass,
      transactionDate: new Date().toLocaleString(),
      currentAcademicYear: currentAcademicYear,
      currentTerm: school.currentTerm || 'N/A',
      items: itemsForReceipt,
      totalNetMonetaryDueOverall,
    });
    setShowReceiptDialog(true);
  };

  const printReceipt = () => {
    const receiptContentElement = document.getElementById('receipt-content-area');
    if (receiptContentElement && school) {
        const printWindow = window.open('', '_blank', 'height=800,width=800');
        if (printWindow) {
            printWindow.document.write('<html><head><title>Requirement Payment Receipt</title>');
            printWindow.document.write(
                '<style>' +
                '@media print {' +
                    'body { font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; font-size: 10pt; line-height: 1.3; color: #333; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
                    '.receipt-container { width: 100%; max-width: 750px; margin: auto; }' + // Removed border and shadow for print
                    '.receipt-header { text-align: center; margin-bottom: 15px; padding-bottom:10px; border-bottom: 2px solid #1A237E /* Primary Color */; }' +
                    '.school-logo { max-height: 60px; margin-bottom: 5px; object-fit: contain; }' + // Logo will be inline-block if present
                    '.receipt-header h2 { margin: 3px 0; font-size: 1.4em; text-transform: uppercase; color: #1A237E; }' +
                    '.receipt-header p { margin: 2px 0; font-size: 0.85em; color: #444; }' +
                    '.info-grid { display: grid; grid-template-columns: auto 1fr; gap-x: 15px; gap-y: 2px; margin-bottom: 10px; font-size: 0.9em; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }' +
                    '.info-grid p { margin: 1px 0; } .info-grid strong { color: #222; font-weight: 600; }' +
                    'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.8em; }' + // Reduced font for table
                    'th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; } ' + // Reduced padding
                    'th { background-color: #F0F4F8 !important; font-weight: bold; color: #1A237E; } ' +
                    'td.number, th.number { text-align: right; }' +
                    '.highlight-row td { background-color: #E3F2FD !important; font-weight: 500; } ' +
                    '.compulsory-badge { font-size: 0.7em; padding: 1px 3px; border-radius: 3px; background-color: #FFF3CD !important; border: 1px solid #FFECB5 !important; color: #856404 !important; margin-left: 5px; font-weight:normal; white-space: nowrap; }' +
                    '.optional-badge { font-size: 0.7em; padding: 1px 3px; border-radius: 3px; background-color: #E9ECEF !important; border: 1px solid #DEE2E6 !important; color: #495057 !important; margin-left: 5px; font-weight:normal; white-space: nowrap; }' +
                    '.totals { margin-top: 15px; padding-top: 10px; border-top: 2px solid #1A237E; text-align: right; }' +
                    '.totals p { margin: 3px 0; font-weight: bold; font-size: 1em; }' +
                    '.totals p.grand-total { font-size: 1.1em; color: #1A237E; }' +
                    '.footer-notes { text-align: center; margin-top: 25px; font-size: 0.8em; color: #666; border-top: 1px dashed #ccc; padding-top: 10px; }' +
                    '.no-print { display: none !important; }' +
                '}' +
                '</style>'
            );
            printWindow.document.write('</head><body><div class="receipt-container">');
            printWindow.document.write(receiptContentElement.innerHTML);
            printWindow.document.write('</div></body></html>');
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => { printWindow.print(); printWindow.close(); }, 750);
        }
    }
  };

  if (isLoadingData || authLoading) {
    return <div className="flex justify-center items-center min-h-screen-minus-navbar"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!adminUserAuth || !isAdminForSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">You do not have permission to perform this action.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}`)} variant="outline">Back to Dashboard</Button>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen-minus-navbar bg-background p-6 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Student Not Found</h1>
        <p className="text-muted-foreground mb-6">The student details could not be loaded.</p>
        <Button onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} variant="outline">Back to Student List</Button>
      </div>
    );
  }

  const studentClass = schoolClasses.find(c => c.id === student.classId)?.name || 'N/A';
  const currentAcademicYear = schoolAcademicYears.find(ay => ay.id === school?.currentAcademicYearId)?.year || 'N/A';
  
  return (
    <div className="container mx-auto px-2 sm:px-4 py-8">
      <div className="mb-6">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <Button variant="outline" onClick={() => router.push(`/school/dashboard/${schoolId}/students`)} size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Student List
            </Button>
             <Link href={`/school/dashboard/${schoolId}/students/${studentId}/assignment-statement`} passHref>
                <Button variant="outline" size="sm">
                    <ListOrdered className="mr-2 h-4 w-4" /> View Assignment Statement
                </Button>
            </Link>
        </div>
        <h1 className="text-3xl font-bold text-primary flex items-center">
          <HandCoins className="mr-3 h-8 w-8" /> Manage Student Requirements & Assignments
        </h1>
        <Card className="mt-3 p-4 bg-muted/20 shadow-sm rounded-lg">
          <CardDescription className="text-sm space-y-0.5">
            <div>School: <span className="font-semibold text-foreground">{school?.name}</span></div>
            <div>Student: <span className="font-semibold text-foreground">{student.firstName} {student.lastName}</span> (Reg: {student.studentRegistrationNumber})</div>
            <div>Class: <span className="font-semibold text-foreground">{studentClass}</span></div>
            <div>Academic Year: <span className="font-semibold text-foreground">{currentAcademicYear}</span> | Term: <span className="font-semibold text-foreground">{school?.currentTerm || 'N/A'}</span></div>
          </CardDescription>
        </Card>
      </div>

      {applicableRequirementsWithDetails.length === 0 && !isLoadingData && (
        <Card>
          <CardContent className="p-6 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No physical requirements are currently assigned to this student's class or as general optional items.</p>
            <Link href={`/school/dashboard/${schoolId}/settings/academic`}>
              <Button variant="link" className="mt-2">Configure Requirements in School Settings</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {applicableRequirementsWithDetails
            .map((req) => {
                const currentInput = pendingInputs[req.id] || { amountPaidStr: '', quantityProvidedStr: '', activeInput: null };
                const unitPrice = req.price || 0;
                const showAmountInput = unitPrice > 0 && !req.isFullySettled;
                const showQuantityInput = req.allowPhysicalProvision && !req.isFullySettled;
                
                const valueOfPhysicallyUnprovidedItems = Math.max(0, (req.quantityPerStudent || 1) - (req.status?.quantityProvided || 0)) * unitPrice;
                const netMonetaryBalanceForThisReq = Math.max(0, valueOfPhysicallyUnprovidedItems - (req.status?.amountPaid || 0));

          return (
            <Card key={req.id} className={`shadow-md rounded-lg ${req.isFullySettled && req.maxQtyAvailableForNewAssignment === 0 && req.qtyAlreadyGivenToStudent >= (req.quantityPerStudent || 1) ? 'bg-green-50 border-green-200' : 'bg-card'}`}>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-semibold text-primary">{req.name} {req.isCompulsory ? <Badge variant="outline" className="ml-2 border-orange-500 text-orange-600 text-xs">Compulsory</Badge> : <Badge variant="secondary" className="ml-2 text-xs">Optional</Badge>}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{req.description || 'No description.'} {req.category ? `(Category: ${req.category})` : ''}</CardDescription>
                  </div>
                  <Badge variant={getBadgeVariantForStatus(req.calculatedStatus)} className={`capitalize h-fit text-xs`}>
                    {req.calculatedStatus}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-2 space-y-2 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                  <div><strong>Price/Unit:</strong> UGX {unitPrice.toFixed(2)}</div>
                  <div><strong>Qty Needed:</strong> {req.quantityPerStudent || 1} {req.unit || 'item(s)'}</div>
                  <div><strong>Total Value:</strong> UGX {(unitPrice * (req.quantityPerStudent || 1)).toFixed(2)}</div>
                  <div><strong>Phys. Provision:</strong> {req.allowPhysicalProvision ? "Allowed" : "Not Allowed"}</div>
                </div>
                <Separator className="my-2"/>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-xs">
                  <div><strong>Paid by Student (Cash):</strong> UGX {(req.status?.amountPaid || 0).toFixed(2)}</div>
                  {req.allowPhysicalProvision && <div><strong>Provided by Student (Physical):</strong> {req.status?.quantityProvided || 0} / {req.quantityPerStudent || 1}</div>}
                   <div><strong>Given to Student (by School):</strong> {req.qtyAlreadyGivenToStudent} / {req.quantityPerStudent || 1}</div>
                  {req.status?.lastTransactionDate && <div><strong>Last Update:</strong> {new Date((req.status.lastTransactionDate as Timestamp).toDate()).toLocaleDateString()}</div>}
                  {netMonetaryBalanceForThisReq > 0 && <div className="font-semibold text-destructive">Monetary Balance Due: UGX {netMonetaryBalanceForThisReq.toFixed(2)}</div>}
                </div>

                {!(req.isFullySettled) && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                            {showAmountInput && (
                            <div>
                                <Label htmlFor={`amountPaid-${req.id}`}>Amount to Pay (UGX)</Label>
                                <Input
                                id={`amountPaid-${req.id}`}
                                type="number"
                                step="any"
                                min="0"
                                placeholder="e.g., 10000"
                                value={currentInput.amountPaidStr}
                                onFocus={() => handleRequirementInputFocus(req.id, 'amount')}
                                onChange={(e) => handleRequirementInputChange(req.id, 'amountPaidStr', e.target.value)}
                                disabled={isSubmittingAllTransactions || (currentInput.activeInput === 'quantity' && currentInput.quantityProvidedStr !== '')}
                                className="mt-1"
                                />
                            </div>
                            )}
                            {showQuantityInput && (
                            <div>
                                <Label htmlFor={`quantityProvided-${req.id}`}>Quantity Provided ({req.unit || 'item(s)'})</Label>
                                <Input
                                id={`quantityProvided-${req.id}`}
                                type="number"
                                step="1"
                                min="0"
                                placeholder="e.g., 1"
                                value={currentInput.quantityProvidedStr}
                                onFocus={() => handleRequirementInputFocus(req.id, 'quantity')}
                                onChange={(e) => handleRequirementInputChange(req.id, 'quantityProvidedStr', e.target.value)}
                                disabled={isSubmittingAllTransactions || (currentInput.activeInput === 'amount' && currentInput.amountPaidStr !== '')}
                                className="mt-1"
                                />
                            </div>
                            )}
                        </div>
                    </div>
                )}
                
                 {(req.isFullySettled && req.maxQtyAvailableForNewAssignment === 0 && req.qtyAlreadyGivenToStudent >= (req.quantityPerStudent || 1)) && (
                  <div className="mt-3 pt-2 border-t text-center text-green-700 font-semibold flex items-center justify-center gap-2 text-sm">
                    <CheckCircle className="h-5 w-5" /> This requirement is fully settled and all items assigned.
                  </div>
                )}

                {/* Assign Items Button and History */}
                {req.allowPhysicalProvision && req.maxQtyAvailableForNewAssignment > 0 && (
                  <div className="mt-4 pt-3 border-t border-dashed border-primary/50">
                    <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => openAssignmentDialog(req)}
                        disabled={isSubmittingAllTransactions}
                        className="w-full sm:w-auto"
                      >
                        <PackagePlus className="mr-2 h-4 w-4"/> Assign Items to Student (Avail: {req.maxQtyAvailableForNewAssignment})
                    </Button>
                    {assignmentLogsByReqId[req.id] && assignmentLogsByReqId[req.id].length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        <p className="font-medium flex items-center gap-1"><History className="h-3 w-3"/>Assignment History:</p>
                        <ul className="list-disc pl-4">
                          {assignmentLogsByReqId[req.id].map(log => (
                            <li key={log.id}>
                              Given {log.quantityAssigned} on {log.assignmentDate ? new Date((log.assignmentDate as Timestamp).toDate()).toLocaleDateString() : 'N/A'} by {log.adminName || 'Admin'}. {log.notes && `(Note: ${log.notes})`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      
      {hasAnyPendingInputs && (
        <div className="mt-8 text-center sticky bottom-4 z-10">
          <Button onClick={handleRecordAllTransactions} disabled={isSubmittingAllTransactions || isLoadingData} size="lg" className="bg-primary hover:bg-primary/90 shadow-lg">
            {isSubmittingAllTransactions ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <SaveAll className="mr-2 h-5 w-5" />}
            Record All Entered Payments/Provisions
          </Button>
        </div>
      )}
      
      <AssignRequirementItemsDialog
        isOpen={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        student={student}
        requirement={assigningRequirement}
        schoolId={schoolId}
        adminProfile={adminProfile}
        onAssignmentRecorded={handleAssignmentRecorded}
      />

      {receiptData && (
        <AlertDialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <AlertDialogContent className="max-w-3xl print:max-w-full print:border-none print:shadow-none bg-white text-black">
            <div id="receipt-content-area"> 
              <AlertDialogHeader className="print:text-black">
                <div className="receipt-header text-center mb-4 pb-3 border-b-2 border-primary">
                  {receiptData.schoolLogoUrl && (
                    <Image src={receiptData.schoolLogoUrl} alt={`${receiptData.schoolName} Logo`} width={70} height={70} className="school-logo h-16 w-auto object-contain mx-auto mb-2" data-ai-hint="school logo"/>
                  )}
                  <AlertDialogTitle className="text-2xl font-bold text-primary">{receiptData.schoolName}</AlertDialogTitle>
                  {receiptData.schoolAddress && <p className="text-xs text-gray-600">{receiptData.schoolAddress}</p>}
                  {receiptData.schoolPhone && <p className="text-xs text-gray-600">Tel: {receiptData.schoolPhone}</p>}
                  <p className="text-lg font-semibold mt-2 text-gray-800">REQUIREMENT SETTLEMENT RECEIPT</p>
                </div>
                <Separator className="my-3 print:hidden"/>
                <div className="info-grid text-xs grid grid-cols-2 gap-x-4 gap-y-0.5 mb-3">
                  <p><strong>Student:</strong> {receiptData.studentName}</p>
                  <p><strong>Reg No:</strong> {receiptData.studentRegNo} {receiptData.studentSchoolPayId ? `(SP ID: ${receiptData.studentSchoolPayId})` : ''}</p>
                  <p><strong>Class:</strong> {receiptData.studentClass}</p>
                  <p><strong>Date:</strong> {receiptData.transactionDate}</p>
                  <p><strong>Academic Year:</strong> {receiptData.currentAcademicYear}</p>
                  <p><strong>Term:</strong> {receiptData.currentTerm}</p>
                </div>
              </AlertDialogHeader>
              <div className="space-y-2 text-xs py-1 max-h-[50vh] overflow-y-auto print:max-h-none print:overflow-visible">
                <h3 className="font-semibold text-base mt-2 mb-1 text-gray-700">Requirements Status (Compulsory & Paid Optional):</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-1.5 px-2">Requirement</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2">Unit Price</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2">Qty Needed</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2">Qty Prov. (Std)</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2">Qty Paid (Equiv.)</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2">Qty Given (Sch)</TableHead>
                       <TableHead className="number text-xs py-1.5 px-2">Phys. Bal. (Std)</TableHead>
                      <TableHead className="number text-xs py-1.5 px-2 font-semibold">Net Mon. Due (Cash)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiptData.items.map((item) => (
                      <TableRow key={item.id} className={item.isCurrentTransactionItem ? 'highlight-row bg-blue-50' : ''}>
                        <TableCell className="text-xs py-1 px-2">{item.name} {item.isCompulsory ? <span className="compulsory-badge">(C)</span> : <span className="optional-badge">(O)</span>}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.qtyNeeded}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.qtyPhysicallyProvidedByStudent}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.qtyCoveredByPaymentMonetaryEquiv}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.qtyAlreadyGivenToStudent}</TableCell>
                        <TableCell className="number text-xs py-1 px-2">{item.physicalQtyStillDueFromStudent}</TableCell>
                        <TableCell className="number text-xs py-1 px-2 font-semibold">{item.netMonetaryBalanceDueForUnprovidedItems.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="totals mt-4 pt-3 border-t-2 border-primary">
                  <p className="text-right font-bold text-sm text-primary grand-total">
                    Total Net Monetary Due (All Listed Items): UGX {receiptData.totalNetMonetaryDueOverall.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="footer-notes mt-6 pt-3 border-t text-center text-xs text-gray-500">
                <p>This receipt reflects the student's requirement settlement status as of the transaction date.</p>
                <p>Generated by NotesVault School Management System.</p>
              </div>
            </div>
            <AlertDialogFooter className="mt-5 pt-4 border-t no-print">
              <Button variant="outline" onClick={printReceipt}><Printer className="mr-2 h-4 w-4" /> Print Receipt</Button>
              <AlertDialogAction onClick={() => setShowReceiptDialog(false)}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

