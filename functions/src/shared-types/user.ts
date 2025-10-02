import type { Timestamp } from 'firebase/firestore';

// Represents user's email notification preferences
export interface EmailPreferences {
  welcomeEmails: boolean; // For new user welcome messages
  resourceApprovalEmails: boolean; // Notify user when their submitted resource is approved/rejected
  downloadNotificationEmails: boolean; // Notify user when someone downloads their resource
  newFollowerEmails: boolean; // Notify user when someone follows them
  commentEmails: boolean; // Notify user on comments on their resources
  // Add more preferences as needed
}

// Represents a user/publisher profile in the system
export interface UserProfile {
  uid: string; // Firebase Auth User ID (unique identifier)
  email: string | null; // User's email address
  displayName: string | null; // User's chosen display name (Publisher Name)
  photoURL?: string | null; // URL to profile picture
  coverImageURL?: string | null; // URL to cover image
  bio?: string; // Short biography or description about the user/publisher

  // Engagement metrics related to the user/publisher
  followersCount?: number; // How many users follow this publisher
  followingCount?: number; // How many publishers this user follows
  uploadsCount?: number; // Number of resources/publications uploaded by the user

  // Admin-managed fields
  verified?: boolean; // Whether the user is verified by an admin
  badges?: string[]; // Array of badge names assigned by admin (e.g., "Top Contributor", "Moderator")

  emailPreferences?: EmailPreferences; // User's notification preferences

  createdAt: Timestamp | string; // When the user profile was created (Firestore Timestamp or ISO string)
  // lastLoginAt?: Timestamp | string; // Future: Track last login time
  // isVerifiedPublisher?: boolean; // Future: Add verification status

  // Monetization
  balance?: number; // User's earnings from downloads. Updated by admin or backend function after payout.
}

// Represents a user interacting with a resource (like, save, potentially comment base)
export interface UserInteraction {
  userId: string; // ID of the user performing the action
  resourceId: string; // ID of the resource being interacted with
  createdAt: Timestamp; // When the interaction occurred
}

// Represents a comment on a resource
export interface Comment extends UserInteraction {
  text: string; // The content of the comment
  userName?: string; // Display name of the commenter (denormalized for display)
  userPhotoURL?: string; // Profile picture URL of the commenter (denormalized)
  // parentCommentId?: string; // Future: For threaded comments
}

// Represents a follow relationship as a document in a subcollection
// e.g., /users/{followerId}/following/{followingId} (document data can be simple, like { followedAt: Timestamp })
// e.g., /users/{followingId}/followers/{followerId} (document data can be simple, like { followedAt: Timestamp })
export interface FollowRelationship {
  userId: string; // For the document ID under the subcollection, or a field if using root collection
  followedAt: Timestamp | string;
}
