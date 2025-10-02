import type { Timestamp } from 'firebase/firestore';

// Represents a user profile in the system, primarily for admins
export interface UserProfile {
  uid: string; // Firebase Auth User ID (unique identifier)
  email: string | null; // User's email address
  displayName: string | null; // User's chosen display name
  photoURL?: string | null; // URL to profile picture
  
  // Admin-managed fields
  // 'verified' and 'badges' could still be useful for identifying super-admins vs school-admins
  verified?: boolean; 
  badges?: string[];

  createdAt: Timestamp | string; // When the user profile was created
}
