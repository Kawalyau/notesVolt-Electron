// src/app/view-report/types.ts

// This re-uses the type definition from the main app
import type { StudentExamProfile as BaseStudentExamProfile, School, SchoolClass, GradingScale, Exam } from '@/types/school';

export interface StudentSuggestion {
  id: string;
  name: string;
  registrationNumber: string;
}

export interface ExamForStudent {
    examId: string;
    examName: string;
}

// Extend the base profile with denormalized data for easy display
export interface StudentExamProfile extends BaseStudentExamProfile {
    studentName?: string;
    studentRegNo?: string;
    studentClass?: string;
    examName?: string;
}

// Re-exporting these for use on the page if needed
export type { School, SchoolClass, GradingScale, Exam };
