// src/app/check-balance/actions.ts
'use server';

import { firestore } from '@/config/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import type { Student } from '@/types/school';

interface StudentSuggestion {
  name: string;
  registrationNumber: string;
}

/**
 * Searches for students by name or registration number within a specific school.
 * @param schoolId The ID of the school to search within.
 * @param searchText The partial name or registration number to search for.
 * @returns An array of matching students.
 */
export async function searchStudentsByName(schoolId: string, searchText: string): Promise<StudentSuggestion[]> {
  if (!schoolId || !searchText || searchText.trim().length < 2) {
    return [];
  }

  const normalizedQuery = searchText.toLowerCase().trim();
  const studentsRef = collection(firestore, `schools/${schoolId}/students`);
  const resultsMap = new Map<string, StudentSuggestion>();

  try {
    const searchEndChar = normalizedQuery + '\uf8ff';

    // Query by Registration Number (case-sensitive, so we use >= and <)
    const regNoQuery = query(
      studentsRef,
      where('studentRegistrationNumber', '>=', searchText.toUpperCase()),
      where('studentRegistrationNumber', '<', searchText.toUpperCase() + '\uf8ff'),
      limit(5)
    );

    const firstNameQuery = query(
      studentsRef,
      where('firstName', '>=', normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1)),
      where('firstName', '<', normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1) + '\uf8ff'),
      limit(5)
    );

    const lastNameQuery = query(
      studentsRef,
      where('lastName', '>=', normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1)),
      where('lastName', '<', normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1) + '\uf8ff'),
      limit(5)
    );
    
    const [regNoSnapshot, firstNameSnapshot, lastNameSnapshot] = await Promise.all([
      getDocs(regNoQuery),
      getDocs(firstNameQuery),
      getDocs(lastNameQuery)
    ]);
    
    const processSnapshot = (snapshot: any) => {
        snapshot.docs.forEach((doc: any) => {
            if (!resultsMap.has(doc.id)) {
                const studentData = doc.data() as Student;
                resultsMap.set(doc.id, {
                    name: `${studentData.firstName} ${studentData.lastName}`,
                    registrationNumber: studentData.studentRegistrationNumber,
                });
            }
        });
    };

    processSnapshot(regNoSnapshot);
    processSnapshot(firstNameSnapshot);
    processSnapshot(lastNameSnapshot);

  } catch (error) {
    console.error('Error searching students by name/reg:', error);
  }

  return Array.from(resultsMap.values()).slice(0, 5);
}


/**
 * Looks up a student's fee balance by their registration number for a specific school.
 * @param schoolId The ID of the school.
 * @param registrationNumber The student's registration number.
 * @returns An object with success status and either data or an error message.
 */
export async function lookupStudentBalance(schoolId: string, registrationNumber: string): Promise<{ success: boolean; data?: { name: string; balance: number }; error?: string }> {
  if (!schoolId || !registrationNumber || registrationNumber.trim() === '') {
    return { success: false, error: 'School ID and Registration number cannot be empty.' };
  }

  try {
    const studentsRef = collection(firestore, `schools/${schoolId}/students`);
    const q = query(
      studentsRef,
      where('studentRegistrationNumber', '==', registrationNumber.trim()),
      limit(1)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return { success: false, error: 'No student found with that registration number for the given school ID.' };
    }

    const studentDoc = querySnapshot.docs[0];
    const studentData = studentDoc.data() as Student;

    return {
      success: true,
      data: {
        name: `${studentData.firstName} ${studentData.lastName}`,
        balance: studentData.feeBalance || 0,
      },
    };
  } catch (error) {
    console.error('Error looking up student balance:', error);
    return { success: false, error: 'An unexpected error occurred. Please try again later.' };
  }
}
