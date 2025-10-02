// src/services/userService.ts
import { firestore } from '@/config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { EmailPreferences } from '@/types/user';

/**
 * Updates the email notification preferences for a user.
 * @param userId The ID of the user.
 * @param preferences The new email preferences.
 */
export async function updateUserEmailPreferences(userId: string, preferences: EmailPreferences): Promise<void> {
  if (!userId) throw new Error("User ID is required to update email preferences.");
  
  const userDocRef = doc(firestore, `users/${userId}`);
  await updateDoc(userDocRef, {
    emailPreferences: preferences,
  });
}

// You can add other user-related service functions here,
// e.g., fetching a specific user's profile if not covered by useAuth,
// or more complex update operations.
