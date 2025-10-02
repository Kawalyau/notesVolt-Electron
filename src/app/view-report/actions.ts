
// src/app/view-report/actions.ts
'use server';

import { firestore } from '@/config/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import type { Student, Exam, StudentExamProfile, ExamSubject } from '@/types/school';
import type { StudentSuggestion, ExamForStudent } from './types';

// This can be shared with other features if needed by moving it to a more central service file.
export async function searchStudentsByName(schoolId: string, searchText: string): Promise<StudentSuggestion[]> {
  if (!schoolId || !searchText || searchText.trim().length < 2) {
    return [];
  }

  const normalizedQuery = searchText.toLowerCase().trim();
  const studentsRef = collection(firestore, `schools/${schoolId}/students`);
  const resultsMap = new Map<string, StudentSuggestion>();

  try {
    const searchEndChar = normalizedQuery + '\uf8ff';

    // Query by Registration Number (case-insensitive by searching both lower and upper)
    const regNoQueryUpper = query(studentsRef, where('studentRegistrationNumber', '>=', searchText.toUpperCase()), where('studentRegistrationNumber', '<', searchText.toUpperCase() + '\uf8ff'), limit(5));
    const regNoQueryLower = query(studentsRef, where('studentRegistrationNumber', '>=', searchText.toLowerCase()), where('studentRegistrationNumber', '<', searchText.toLowerCase() + '\uf8ff'), limit(5));
    
    // Query by name parts (assuming names are stored with initial caps)
    const capitalizedQuery = normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1);
    const firstNameQuery = query(studentsRef, where('firstName', '>=', capitalizedQuery), where('firstName', '<', capitalizedQuery + '\uf8ff'), limit(5));
    const lastNameQuery = query(studentsRef, where('lastName', '>=', capitalizedQuery), where('lastName', '<', capitalizedQuery + '\uf8ff'), limit(5));
    
    const [regNoSnapshotUpper, regNoSnapshotLower, firstNameSnapshot, lastNameSnapshot] = await Promise.all([
      getDocs(regNoQueryUpper), getDocs(regNoQueryLower), getDocs(firstNameQuery), getDocs(lastNameQuery)
    ]);
    
    const processSnapshot = (snapshot: any) => {
        snapshot.docs.forEach((doc: any) => {
            if (!resultsMap.has(doc.id)) {
                const studentData = doc.data() as Student;
                resultsMap.set(doc.id, {
                    id: doc.id,
                    name: `${studentData.firstName} ${studentData.lastName}`,
                    registrationNumber: studentData.studentRegistrationNumber,
                });
            }
        });
    };

    processSnapshot(regNoSnapshotUpper);
    processSnapshot(regNoSnapshotLower);
    processSnapshot(firstNameSnapshot);
    processSnapshot(lastNameSnapshot);

  } catch (error) {
    console.error('Error searching students by name/reg:', error);
  }

  return Array.from(resultsMap.values()).slice(0, 5);
}


export async function getPublishedExamsForStudent(schoolId: string, studentId: string): Promise<ExamForStudent[]> {
  if (!schoolId || !studentId) return [];
  try {
    // This query is inefficient but necessary with the current model.
    // It should be replaced with a query on a dedicated `publishedReports` collection in a real-world app.
    const examsSnapshot = await getDocs(collection(firestore, `schools/${schoolId}/exams`));
    const availableExams: ExamForStudent[] = [];

    for (const examDoc of examsSnapshot.docs) {
      const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${examDoc.id}/studentProfiles`, studentId);
      const profileSnap = await getDoc(profileDocRef);
      if (profileSnap.exists()) {
        const examData = examDoc.data() as Exam;
        availableExams.push({
            examId: examDoc.id,
            examName: `${examData.name} - ${examData.term}`
        });
      }
    }
    return availableExams;

  } catch (error) {
    console.error("Error fetching published exams for student:", error);
    return [];
  }
}

export async function getExamReportForStudent(schoolId: string, examId: string, studentId: string): Promise<StudentExamProfile | null> {
    if (!schoolId || !examId || !studentId) return null;
    try {
        const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${examId}/studentProfiles`, studentId);
        const profileSnap = await getDoc(profileDocRef);

        if (!profileSnap.exists()) return null;

        const profileData = profileSnap.data() as StudentExamProfile;

        // Enrich with student and exam details
        const studentDocRef = doc(firestore, `schools/${schoolId}/students`, studentId);
        const examDocRef = doc(firestore, `schools/${schoolId}/exams`, examId);
        const schoolClassRef = collection(firestore, `schools/${schoolId}/schoolClasses`);

        const [studentSnap, examSnap, classesSnap] = await Promise.all([
            getDoc(studentDocRef),
            getDoc(examDocRef),
            getDocs(schoolClassRef)
        ]);

        const studentData = studentSnap.exists() ? studentSnap.data() as Student : null;
        const examData = examSnap.exists() ? examSnap.data() as Exam : null;
        const schoolClasses = classesSnap.docs.map(d => ({id: d.id, ...d.data()}) as SchoolClass);

        return {
            ...profileData,
            id: profileSnap.id,
            studentName: studentData ? `${studentData.firstName} ${studentData.lastName}` : 'N/A',
            studentRegNo: studentData?.studentRegistrationNumber || 'N/A',
            studentClass: studentData ? (schoolClasses.find(c => c.id === studentData.classId)?.class || 'N/A') : 'N/A',
            examName: examData ? `${examData.name} - ${examData.term}` : 'N/A',
        };

    } catch (error) {
        console.error("Error fetching student exam report:", error);
        return null;
    }
}
