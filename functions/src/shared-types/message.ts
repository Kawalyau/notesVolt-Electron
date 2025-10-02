// src/types/message.ts
import type { Timestamp } from 'firebase/firestore';

export interface ConversationParticipantInfo {
  displayName: string | null;
  photoURL?: string | null;
}

export interface LastMessage {
  text: string;
  senderId: string;
  timestamp: Timestamp | string; // Firestore Timestamp or ISO string
  isRead?: boolean; // Indicates if the last message was read by the other participant (relevant for current user)
}

export interface Conversation {
  id: string; // Firestore document ID (e.g., uid1_uid2 or generated)
  participants: string[]; // Array of two user UIDs
  participantInfo: { // Denormalized info for quick display
    [uid: string]: ConversationParticipantInfo; 
  };
  lastMessage?: LastMessage; // Snippet of the last message for conversation lists
  updatedAt: Timestamp | string; // Timestamp of the last activity, for sorting
  createdAt: Timestamp | string;
  // unreadCounts?: { [uid: string]: number }; // Optional: Track unread messages per participant
}

export interface Message {
  id: string; // Firestore document ID (subcollection of conversation)
  conversationId: string; // Parent conversation ID
  senderId: string; // UID of the message sender
  // receiverId: string; // UID of the message receiver (can be inferred from conversation participants)
  text: string; // Content of the message
  timestamp: Timestamp | string; // Firestore Timestamp or ISO string
  isRead: boolean; // Has the message been read by the recipient(s)?
  // reactions?: { [emoji: string]: string[] }; // Optional: message reactions
  // attachmentURL?: string; // Optional: for image/file attachments in messages
  // attachmentType?: 'image' | 'file'; 
}
