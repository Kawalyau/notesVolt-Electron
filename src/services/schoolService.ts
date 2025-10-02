// src/services/schoolService.ts
import { firestore, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  addDoc,
  deleteDoc,
  orderBy,
  Timestamp,
  setDoc,
  DocumentData,
  QueryConstraint,
  writeBatch,
  increment,
  collectionGroup,
  query,
  runTransaction,
  getDocs,
  where,
  limit
} from 'firebase/firestore';
import type { School, Student, SchoolClass, SchoolSubject, SchoolStream, SchoolAcademicYear, PhysicalRequirement, StudentRequirementStatus, StudentRequirementAssignmentLog, RegistrationNumberConfig, FeeTransaction, FeeItem, SchoolTerm, AppTimestamp, ChartOfAccountItem, JournalEntry, JournalEntryLine, SiteContent, NewsArticle, Publication, GalleryImage, Announcement, Event, Teacher, AttendanceRecord, AttendanceStatus, ExerciseBookTransaction } from '@/types/school';
import type { UserProfile } from '@/types/user';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from '@/config/firebase';
import { format } from 'date-fns';


// --- School Level Operations ---
export async function getSchoolsByAdmin(adminUid: string): Promise<School[]> {
  if (!adminUid) return [];
  const schoolsRef = collection(firestore, 'schools');
  const q = query(schoolsRef, where('adminUids', 'array-contains', adminUid));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as School));
}

export async function getSchoolById(schoolId: string): Promise<School | null> {
  if (!schoolId) return null;
  const schoolDocRef = doc(firestore, 'schools', schoolId);
  const docSnap = await getDoc(schoolDocRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as School : null;
}

export async function updateSchoolData(schoolId: string, data: Partial<Omit<School, 'id' | 'createdAt' | 'adminUids' | 'createdBy'>>): Promise<void> {
  if (!schoolId) throw new Error("School ID is required for updates.");
  const schoolDocRef = doc(firestore, 'schools', schoolId);
  await updateDoc(schoolDocRef, { ...data, updatedAt: serverTimestamp() });
}


// --- Generic Subcollection Management ---
export async function getSchoolSubcollectionItems<T extends {id: string}>(
  schoolId: string,
  subcollectionName: string,
  queryConstraints: QueryConstraint[] = [] // Now using actual QueryConstraint type
): Promise<T[]> {
  const collectionRef = collection(firestore, `schools/${schoolId}/${subcollectionName}`);
  const q = query(collectionRef, ...queryConstraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
}

export async function addSchoolSubcollectionItem<TData>(
  schoolId: string,
  subcollectionName: string,
  itemData: Omit<TData, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
   const collectionRef = collection(firestore, `schools/${schoolId}/${subcollectionName}`);
   const dataWithTimestamps = { ...itemData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
   const docRef = await addDoc(collectionRef, dataWithTimestamps);
   return docRef.id;
}

export async function updateSchoolSubcollectionItem<TData>(
  schoolId: string,
  subcollectionName: string,
  itemId: string,
  itemData: Partial<Omit<TData, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const itemRef = doc(firestore, `schools/${schoolId}/${subcollectionName}`, itemId);
  await updateDoc(itemRef, { ...itemData, updatedAt: serverTimestamp() });
}

export async function updateSchoolTerm(schoolId: string, termId: string, data: Partial<Omit<SchoolTerm, 'id' | 'createdAt' | 'academicYearId' | 'academicYearName'>>): Promise<void> {
  if (!schoolId || !termId) throw new Error("School ID and Term ID are required.");
  return updateSchoolSubcollectionItem(schoolId, 'schoolTerms', termId, data);
}

export async function deleteSchoolSubcollectionItem(
  schoolId: string,
  subcollectionName: string,
  itemId: string
): Promise<void> {
  const itemRef = doc(firestore, `schools/${schoolId}/${subcollectionName}`, itemId);
  await deleteDoc(itemRef);
}

// --- File Upload/Delete remains client-side ---
export const uploadFile = async (filePath: string, file: File, onProgress: (progress: number) => void): Promise<string> => {
    const storageRef = ref(storage, filePath);
    const uploadTask = uploadBytesResumable(storageRef, file);
    return new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
            (snapshot) => onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            reject,
            async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
        );
    });
};

export const deleteFileFromUrl = async (url: string): Promise<void> => {
    try {
        const fileRef = ref(storage, url);
        await deleteObject(fileRef);
    } catch (error: any) {
        if (error.code === 'storage/object-not-found') {
            console.warn("Tried to delete a file that doesn't exist:", url);
        } else {
            console.error("Error deleting file from storage:", error);
            throw error;
        }
    }
};


// --- Student Specific Operations ---
export async function getStudentById(schoolId: string, studentId: string): Promise<Student | null> {
  if (!schoolId || !studentId) return null;
  const studentDocRef = doc(firestore, `schools/${schoolId}/students`, studentId);
  const docSnap = await getDoc(studentDocRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Student : null;
}

export interface AdminContext {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}

export async function addStudentToSchool(
  schoolId: string,
  studentData: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'schoolPaySyncedAt' | 'schoolPaySyncStatus' | 'schoolPaySyncMessage' | 'feeBalance'>,
  school: School,
  schoolPhysicalRequirements: PhysicalRequirement[],
  schoolFeeItems: FeeItem[],
  adminContext: AdminContext,
  currentNextSuffixForNewStudent?: number | undefined
): Promise<{ studentId: string; generatedRegistrationNumber?: string; }> {
  const studentCollectionRef = collection(firestore, `schools/${schoolId}/students`);
  const newStudentDocRef = doc(studentCollectionRef);
  const newStudentId = newStudentDocRef.id;

  const batch = writeBatch(firestore);

  const studentFullData = {
    ...studentData,
    feeBalance: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    schoolPaySyncedAt: null,
    schoolPaySyncStatus: 'Pending',
    schoolPaySyncMessage: null
  };
  batch.set(newStudentDocRef, studentFullData);

  let totalDebitedAmountForNewStudent = 0;
  if (studentData.status === 'Active') {
    (schoolPhysicalRequirements || []).forEach((req: any) => {
      if (req.isCompulsory && ((req.assignmentType === 'class' && req.applicableClassIds?.includes(studentData.classId)) || req.assignmentType === 'optional_general')) {
        const statusDocRef = doc(newStudentDocRef, 'requirementStatuses', req.id);
        batch.set(statusDocRef, { 
          requirementId: req.id, requirementName: req.name, originalPricePerUnit: req.price || 0, 
          originalQuantityNeeded: req.quantityPerStudent || 1, totalExpectedAmount: (req.price || 0) * (req.quantityPerStudent || 1), 
          amountPaid: 0, quantityProvided: 0, status: 'Pending', 
          academicYearId: school.currentAcademicYearId || null, term: school.currentTerm || null, 
          createdAt: serverTimestamp(), updatedAt: serverTimestamp() 
        });
      }
    });

    (schoolFeeItems || []).forEach((fee: any) => {
      if (fee.isCompulsory && fee.academicYearId === school.currentAcademicYearId && fee.term === school.currentTerm && fee.classAmounts.some((ca: any) => ca.classId === studentData.classId)) {
        const studentClassAmount = fee.classAmounts.find((ca: any) => ca.classId === studentData.classId)?.amount;
        if (studentClassAmount && studentClassAmount > 0) {
          const feeTxRef = doc(collection(newStudentDocRef, 'feeTransactions'));
          batch.set(feeTxRef, { 
            studentId: newStudentId, schoolId, type: 'debit', description: fee.name, 
            amount: studentClassAmount, feeItemId: fee.id, academicYearId: fee.academicYearId, term: fee.term, 
            transactionDate: serverTimestamp(), recordedByAdminId: adminContext.uid, 
            recordedByAdminName: adminContext.displayName || adminContext.email || null, 
            createdAt: serverTimestamp() 
          });
          totalDebitedAmountForNewStudent += studentClassAmount;
        }
      }
    });
    if (totalDebitedAmountForNewStudent > 0) {
      batch.update(newStudentDocRef, { feeBalance: increment(totalDebitedAmountForNewStudent) });
    }
  }

  await batch.commit();
  return { studentId: newStudentId, generatedRegistrationNumber: studentData.studentRegistrationNumber };
}

export async function updateStudentInSchool(schoolId: string, studentId: string, studentData: Partial<Omit<Student, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const studentRef = doc(firestore, `schools/${schoolId}/students`, studentId);
  await updateDoc(studentRef, { ...studentData, updatedAt: serverTimestamp() });
}

export async function deleteStudentFromSchool(schoolId: string, studentId: string): Promise<void> {
  // Note: This does not delete subcollections. A cloud function is needed for that.
  const studentRef = doc(firestore, `schools/${schoolId}/students`, studentId);
  await deleteDoc(studentRef);
}


// --- Teacher/Staff Operations ---
export async function updateTeacherInSchool(schoolId: string, teacherId: string, teacherData: Partial<Omit<Teacher, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const teacherRef = doc(firestore, `schools/${schoolId}/teachers`, teacherId);
  await updateDoc(teacherRef, { ...teacherData, updatedAt: serverTimestamp() });
}


// --- Requirement Status Operations ---
export async function getStudentRequirementStatus(schoolId: string, studentId: string, requirementId: string): Promise<StudentRequirementStatus | null> {
  const statusDocRef = doc(firestore, `schools/${schoolId}/students/${studentId}/requirementStatuses`, requirementId);
  const docSnap = await getDoc(statusDocRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as StudentRequirementStatus : null;
}

export async function getAllStudentRequirementStatuses(schoolId: string, studentId: string): Promise<StudentRequirementStatus[]> {
  return getSchoolSubcollectionItems(schoolId, `students/${studentId}/requirementStatuses`);
}

export async function updateStudentRequirementStatus(
  schoolId: string,
  studentId: string,
  requirementId: string,
  statusData: Partial<Omit<StudentRequirementStatus, 'id' | 'createdAt'>>
): Promise<void> {
  const statusDocRef = doc(firestore, `schools/${schoolId}/students/${studentId}/requirementStatuses`, requirementId);
  await setDoc(statusDocRef, { ...statusData, updatedAt: serverTimestamp() }, { merge: true });
}

export async function addStudentRequirementAssignmentLog(
  schoolId: string,
  studentId: string,
  logData: Omit<StudentRequirementAssignmentLog, 'id' | 'assignmentDate' | 'studentId'>
): Promise<string> {
  const collectionRef = collection(firestore, `schools/${schoolId}/students/${studentId}/requirementAssignmentLogs`);
  const docRef = await addDoc(collectionRef, { ...logData, studentId, assignmentDate: serverTimestamp() });
  return docRef.id;
}

export async function getStudentRequirementAssignmentLogs(
  schoolId: string,
  studentId: string,
  requirementId?: string
): Promise<StudentRequirementAssignmentLog[]> {
  const qConstraints = requirementId ? [where('requirementId', '==', requirementId)] : [];
  return getSchoolSubcollectionItems(schoolId, `students/${studentId}/requirementAssignmentLogs`, qConstraints);
}

// --- Exercise Book Transaction ---
export async function addStudentExerciseBookTransaction(
  schoolId: string,
  studentId: string,
  transactionData: Omit<ExerciseBookTransaction, 'id' | 'date'>
): Promise<string> {
  const collectionRef = collection(firestore, `schools/${schoolId}/students/${studentId}/exerciseBookTransactions`);
  const docRef = await addDoc(collectionRef, { ...transactionData, date: serverTimestamp() });
  return docRef.id;
}


// --- Fee Transaction Operations ---
export async function addFeeTransaction(
  schoolId: string,
  studentId: string,
  transactionData: Omit<FeeTransaction, 'id' | 'createdAt'>
): Promise<string> {
  const studentDocRef = doc(firestore, `schools/${schoolId}/students`, studentId);
  const transactionColRef = collection(firestore, `schools/${schoolId}/students/${studentId}/feeTransactions`);
  
  const newTransactionRef = doc(transactionColRef);

  await runTransaction(firestore, async (transactionRunner) => {
    const studentSnap = await transactionRunner.get(studentDocRef);
    if (!studentSnap.exists()) throw new Error("Student not found during transaction.");
    transactionRunner.set(newTransactionRef, { ...transactionData, createdAt: serverTimestamp() });
    const amountChange = transactionData.type === 'debit' ? transactionData.amount : -transactionData.amount;
    transactionRunner.update(studentDocRef, { feeBalance: increment(amountChange), updatedAt: serverTimestamp() });
  });

  return newTransactionRef.id;
}

export async function getFeeTransactions(schoolId: string, studentId: string): Promise<FeeTransaction[]> {
  return getSchoolSubcollectionItems(schoolId, `students/${studentId}/feeTransactions`, [orderBy('transactionDate', 'desc')]);
}

export async function deleteAllStudentFeeTransactions(schoolId: string, studentId: string): Promise<void> {
  const transactionsRef = collection(firestore, `schools/${schoolId}/students/${studentId}/feeTransactions`);
  const studentDocRef = doc(firestore, `schools/${schoolId}/students`, studentId);
  
  const querySnapshot = await getDocs(transactionsRef);
  
  const batch = writeBatch(firestore);
  querySnapshot.forEach(docSnapshot => batch.delete(docSnapshot.ref));
  batch.update(studentDocRef, { feeBalance: 0, updatedAt: serverTimestamp() });
  
  await batch.commit();
}

// --- Attendance Operations ---
export async function setAttendanceForClass(
  schoolId: string,
  classId: string,
  date: Date,
  records: Record<string, AttendanceStatus>,
  adminId: string
): Promise<void> {
  const batch = writeBatch(firestore);
  const formattedDate = format(date, 'yyyy-MM-dd');

  for (const studentId in records) {
    const status = records[studentId];
    // Create a consistent document ID for idempotency
    const docId = `${formattedDate}_${studentId}`;
    const attendanceDocRef = doc(firestore, `schools/${schoolId}/attendance`, docId);

    const data: Omit<AttendanceRecord, 'id'> = {
      studentId,
      classId,
      date: formattedDate,
      status,
      recordedByAdminId: adminId,
      createdAt: serverTimestamp(), // Will only be set on create
      updatedAt: serverTimestamp(), // Will be set on create and update
    };
    
    // Using set with merge to create or update the record for that day
    batch.set(attendanceDocRef, data, { merge: true });
  }

  await batch.commit();
}

export async function getAttendanceForDate(schoolId: string, date: Date): Promise<AttendanceRecord[]> {
  const formattedDate = format(date, 'yyyy-MM-dd');
  return getSchoolSubcollectionItems<AttendanceRecord>(schoolId, 'attendance', [where('date', '==', formattedDate)]);
}


// --- Chart of Accounts ---
export async function getChartOfAccountItemById(schoolId: string, accountId: string): Promise<ChartOfAccountItem | null> {
    if (!schoolId || !accountId) return null;
    const accDocRef = doc(firestore, `schools/${schoolId}/chartOfAccounts`, accountId);
    const docSnap = await getDoc(accDocRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as ChartOfAccountItem : null;
}

export async function updateChartOfAccountItem(
  schoolId: string,
  accountId: string,
  data: Partial<Omit<ChartOfAccountItem, 'id' | 'createdAt' | 'updatedAt' | 'accountType' | 'balance' | 'balanceType'>>
): Promise<void> {
  return updateSchoolSubcollectionItem(schoolId, 'chartOfAccounts', accountId, data);
}


// --- Exam and Report Related ---
export * from './examService';
