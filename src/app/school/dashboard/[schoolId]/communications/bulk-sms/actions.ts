// src/app/school/dashboard/[schoolId]/communications/bulk-sms/actions.ts
'use server';

import { firestore } from '@/config/firebase';
import { collection, query, where, getDocs, limit, or } from 'firebase/firestore';
import type { Student } from '@/types/school';

export async function searchStudents(schoolId: string, searchText: string): Promise<Student[]> {
  if (!schoolId || !searchText || searchText.trim().length < 2) {
    return [];
  }

  const normalizedQuery = searchText.toLowerCase().trim();
  const studentsRef = collection(firestore, `schools/${schoolId}/students`);
  const results: Student[] = [];
  const addedIds = new Set<string>();

  try {
    const searchEndChar = normalizedQuery + '\uf8ff';
    
    // This is a simplified search. For a more robust solution, a dedicated search service like Algolia or Typesense is recommended.
    // We will perform a few separate queries and merge the results client-side.
    
    // Query by Registration Number (case-insensitive by searching both lower and upper)
    const regNoQueryUpper = query(studentsRef, where('studentRegistrationNumber', '>=', searchText.toUpperCase()), where('studentRegistrationNumber', '<', searchText.toUpperCase() + '\uf8ff'), limit(5));
    const regNoQueryLower = query(studentsRef, where('studentRegistrationNumber', '>=', searchText.toLowerCase()), where('studentRegistrationNumber', '<', searchText.toLowerCase() + '\uf8ff'), limit(5));
    
    // Query by name parts (assuming names are stored with initial caps)
    const capitalizedQuery = normalizedQuery.charAt(0).toUpperCase() + normalizedQuery.slice(1);
    const firstNameQuery = query(studentsRef, where('firstName', '>=', capitalizedQuery), where('firstName', '<', capitalizedQuery + '\uf8ff'), limit(5));
    const lastNameQuery = query(studentsRef, where('lastName', '>=', capitalizedQuery), where('lastName', '<', capitalizedQuery + '\uf8ff'), limit(5));

    const [regNoSnapshotUpper, regNoSnapshotLower, firstNameSnapshot, lastNameSnapshot] = await Promise.all([
      getDocs(regNoQueryUpper),
      getDocs(regNoQueryLower),
      getDocs(firstNameQuery),
      getDocs(lastNameQuery)
    ]);

    const processSnapshot = (snapshot: any) => {
        snapshot.docs.forEach((doc: any) => {
            if (!addedIds.has(doc.id)) {
                results.push({ id: doc.id, ...doc.data() } as Student);
                addedIds.add(doc.id);
            }
        });
    };

    processSnapshot(regNoSnapshotUpper);
    processSnapshot(regNoSnapshotLower);
    processSnapshot(firstNameSnapshot);
    processSnapshot(lastNameSnapshot);

  } catch (error) {
    console.error('Error searching students by name/reg for SMS:', error);
  }

  return results.slice(0, 10); // Return a combined limit
}
