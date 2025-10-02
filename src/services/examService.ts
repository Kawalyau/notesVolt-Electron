// src/services/examService.ts

import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  updateDoc,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import { firestore } from '@/config/firebase';
import type { StudentExamProfile, StudentPaperScore, Exam, SchoolSubject, GradingScale, ExamSubject } from '@/types/school';

/**
 * Fetches a student's exam profile. If it doesn't exist, it returns null.
 * @param schoolId - The ID of the school.
 * @param examId - The ID of the exam.
 * @param studentId - The ID of the student.
 * @returns The student's exam profile or null.
 */
export async function getStudentExamProfile(
  schoolId: string,
  examId: string,
  studentId: string
): Promise<StudentExamProfile | null> {
  const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${examId}/studentProfiles`, studentId);
  const docSnap = await getDoc(profileDocRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as StudentExamProfile;
  }
  return null;
}

interface UpdateProfilePayload {
  examSubjectId: string;
  newScore: number | null;
  subjectDetails: ExamSubject; // Use ExamSubject which has the 'isCoreSubject' flag
  examDetails: Exam;
  gradingScales: GradingScale[];
}

/**
 * Updates a student's score for a specific subject in an exam.
 * This function handles creating or updating the student's exam profile
 * and recalculating aggregates and divisions.
 * @param schoolId - The ID of the school.
 * @param examId - The ID of the exam.
 * @param studentId - The ID of the student.
 * @param payload - The update payload.
 */
export async function updateStudentExamProfile(
  schoolId: string,
  examId: string,
  studentId: string,
  payload: UpdateProfilePayload
): Promise<void> {
  const { examSubjectId, newScore, subjectDetails, examDetails, gradingScales } = payload;
  
  const profileDocRef = doc(firestore, `schools/${schoolId}/exams/${examId}/studentProfiles`, studentId);
  const currentProfile = await getStudentExamProfile(schoolId, examId, studentId);
  
  const examScale = gradingScales.find(s => s.id === examDetails.defaultGradingScaleId);
  if (!examScale) {
    throw new Error(`Default grading scale for exam not found (Scale ID: ${examDetails.defaultGradingScaleId})`);
  }

  // Calculate grade and value for the new score
  let newGradeInfo: { grade: string, value: number } | null = null;
  if (newScore !== null && newScore >= 0) {
    const percentage = (newScore / subjectDetails.maxScore) * 100;
    const grade = examScale.grades.find(g => percentage >= g.lowerBound && percentage <= g.upperBound);
    if (grade) {
      newGradeInfo = { grade: grade.name, value: grade.value };
    }
  }

  // Create or update scores array
  let updatedScores: StudentPaperScore[] = currentProfile?.scores || [];
  const scoreIndex = updatedScores.findIndex(s => s.examSubjectId === examSubjectId);

  if (scoreIndex > -1) {
    // Update existing score
    updatedScores[scoreIndex].score = newScore;
    updatedScores[scoreIndex].grade = newGradeInfo?.grade || null;
    updatedScores[scoreIndex].gradeValue = newGradeInfo?.value || null;
  } else {
    // Add new score
    updatedScores.push({
      examSubjectId: examSubjectId,
      subjectName: subjectDetails.subjectName,
      isCoreSubject: subjectDetails.isCoreSubject,
      score: newScore,
      grade: newGradeInfo?.grade || null,
      gradeValue: newGradeInfo?.value || null,
    });
  }

  // Recalculate aggregate and division based only on aggregate score
  let aggregate = 0;
  const coreScores = updatedScores.filter(s => s.isCoreSubject);
  coreScores.forEach(score => {
      if (score.gradeValue !== null && score.gradeValue !== undefined) {
          aggregate += score.gradeValue;
      }
  });

  let division: string | null = null;
  if (coreScores.length > 0) {
      division = examScale.divisions.find(d => aggregate >= d.minAggregate && aggregate <= d.maxAggregate)?.name || 'Ungraded';
  }

  // Prepare data for Firestore
  const dataToSave: Omit<StudentExamProfile, 'id' | 'createdAt'> = {
    studentId,
    examId,
    scores: updatedScores,
    aggregate: coreScores.length > 0 ? aggregate : null,
    division: division,
    updatedAt: serverTimestamp(),
  };

  if (currentProfile) {
    // Update existing profile
    await updateDoc(profileDocRef, dataToSave);
  } else {
    // Create new profile
    await setDoc(profileDocRef, {
      ...dataToSave,
      createdAt: serverTimestamp(),
    });
  }
}

// --- Exam Subject Management ---

export async function addExamSubject(schoolId: string, examId: string, subjectData: Omit<ExamSubject, 'id' | 'createdAt'>): Promise<string> {
    const subjectsRef = collection(firestore, `schools/${schoolId}/exams/${examId}/subjects`);
    const docRef = await addDoc(subjectsRef, {
        ...subjectData,
        createdAt: serverTimestamp(),
    });
    return docRef.id;
}

export async function deleteExamSubject(schoolId: string, examId: string, examSubjectId: string): Promise<void> {
    const subjectDocRef = doc(firestore, `schools/${schoolId}/exams/${examId}/subjects`, examSubjectId);
    await deleteDoc(subjectDocRef);
}
