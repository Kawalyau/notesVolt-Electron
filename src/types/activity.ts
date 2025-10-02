// src/types/activity.ts
import type { Timestamp } from 'firebase/firestore';

export interface ActivityLogInput {
  action: string; // e.g., 'user_signup', 'resource_approved', 'admin_updated_settings'
  userId?: string; // User performing the action (if applicable, could be admin or regular user)
  userName?: string; // Display name of the user performing the action
  targetId?: string; // ID of the entity being acted upon (e.g., resource ID, user ID)
  targetType?: string; // Type of the entity (e.g., 'resource', 'user', 'school')
  schoolId?: string; // If the action is related to a specific school
  details?: Record<string, any>; // Any additional JSON-ifiable details
}

export interface ActivityLog extends ActivityLogInput {
  id: string; // Firestore document ID
  timestamp: Timestamp | string; // When the activity occurred
}
