// src/services/activityService.ts
import { firestore } from '@/config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { ActivityLogInput } from '@/types/activity';

/**
 * Logs an activity to Firestore.
 * @param activityData The data for the activity log.
 */
export async function logActivity(activityData: ActivityLogInput): Promise<void> {
  try {
    const activityLogRef = collection(firestore, 'activityLogs');
    await addDoc(activityLogRef, {
      ...activityData,
      timestamp: serverTimestamp(),
    });
    console.log('Activity logged:', activityData.action);
  } catch (error) {
    console.error("Error logging activity:", error);
    // Optionally re-throw or handle as needed, e.g., don't block primary operation
  }
}
