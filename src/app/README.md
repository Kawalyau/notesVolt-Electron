# School Management System - Mobile App Development Guide

This document outlines the requirements and data structures needed to build a cross-platform mobile application for the existing web-based School Management System.

## **Objective**

Create a comprehensive mobile application for iOS and Android that empowers school administrators to manage core operations on the go. The initial focus is on **student and class management**.

## **Core Requirements & Tech Stack**

*   **Platform:** iOS & Android
*   **Framework:** React Native with Expo (Recommended)
*   **Backend:** Connect to the existing Firebase Project (Firestore, Auth, Storage). The app must use the same Firebase project to ensure data consistency with the web application.
*   **UI/UX:** The user interface should be clean, modern, and intuitive, following mobile design best practices.

---

## **School Classes Module Implementation Guide**

This section details how to manage school classes, which are referenced by students.

### **1. Firebase Data Structure for School Classes**

The class data is stored in a Firestore subcollection.

*   **Path:** `/schools/{schoolId}/schoolClasses/{classId}`
*   **Description:** Each document within the `schoolClasses` subcollection represents a single class.

#### **SchoolClass Document Fields:**

The `SchoolClass` data type has the following fields.

```typescript
// Reference from src/types/school.ts

export interface SchoolClass {
  id: string; // The Firestore document ID
  class: string; // The full name of the class, e.g., "Primary One"
  code?: string | null; // An optional shortcode, e.g., "P1"
  createdAt?: AppTimestamp; // Firebase Timestamp or ISO String
}
```

### **2. Implementing Class Management Features**

#### **A. Displaying a List of Classes**

*   **Fetching Data:**
    *   Query the collection at `/schools/{schoolId}/schoolClasses`.
    *   For better organization, you can order the classes alphabetically by the `class` field.
*   **UI:**
    *   Display the classes in a simple list.
    *   Each list item should show the full class name and its code, if available.

#### **B. Adding and Editing Classes**

*   **Form Modal:** Create a modal component for both adding and editing classes.
    *   When **adding**, the form should be empty.
    *   When **editing**, pre-populate the form with the selected class's data.
*   **Form Fields:** The form must include inputs for the `class` name and the optional `code`.
*   **Saving Data:**
    *   **On Add:** Use `addDoc` to create a new document in the `/schools/{schoolId}/schoolClasses` collection.
    *   **On Edit:** Use `updateDoc` on the specific class document at `/schools/{schoolId}/schoolClasses/{classId}`.
    *   Remember to include `createdAt` (on add) and `updatedAt` (on edit) timestamps.

---

## **Student Module Implementation Guide**

This is the core of the initial mobile app version.

### **1. Firebase Data Structure for Students**

The student data is stored in a Firestore subcollection. It is crucial to adhere to this structure to maintain compatibility with the web application.

*   **Path:** `/schools/{schoolId}/students/{studentId}`
*   **Description:** Each document within the `students` subcollection represents a single student. The `{schoolId}` must be dynamically provided (e.g., from user session or selection screen), and `{studentId}` is the unique ID for each student document.

#### **Student Document Fields:**

The `Student` data type has the following fields. Your mobile app should be able to read and write data according to this structure.

```typescript
// Reference from src/types/school.ts

export interface Student {
  id: string; // The Firestore document ID
  schoolId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: AppTimestamp; // Firebase Timestamp or ISO String
  classId: string; // Reference to a document in /schools/{schoolId}/schoolClasses
  studentRegistrationNumber: string;
  guardianPhone?: string | null;
  photoUrl?: string | null;
  status: 'Active' | 'Inactive' | 'Graduated' | 'Withdrawn';
  feeBalance?: number; // Handled by the fees module
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
  createdBy: string; // UID of the admin who created the student
}
```

### **2. Implementing Student Management Features**

#### **A. Displaying a List of Students**

*   **Fetching Data:**
    *   Use the Firebase SDK for your chosen mobile framework (e.g., `react-native-firebase` or the Firebase Web SDK with Expo).
    *   To get all students for a given school, query the collection at `/schools/{schoolId}/students`.
    *   For better performance, you can order the students alphabetically by `lastName` or `firstName`.
    *   Implement real-time updates using `onSnapshot` to ensure the student list is always current.
*   **UI:**
    *   Display the students in a `FlatList` or similar virtualized list component for performance.
    *   Each list item should clearly show the student's full name, registration number, and class. An avatar with the student's initials or photo is recommended.

#### **B. Search and Filter**

*   **Search:** Implement a text input that filters the displayed student list. The search should match against the student's name (first, middle, last) and registration number.
*   **Filter:** Add a dropdown/picker to filter students by their `classId`. This will require you to first fetch the list of available classes from `/schools/{schoolId}/schoolClasses`.

#### **C. Adding and Editing Students**

*   **Form Modal:** Create a single, reusable modal component for both adding and editing student information.
    *   When **adding**, the form should be empty. You may pre-fill the registration number if your system has auto-generation logic (see `registrationNumberConfig` in the `school` document).
    *   When **editing**, the form should be pre-populated with the selected student's data.
*   **Form Fields:** The form must include inputs for all the key fields defined in the `Student` interface (firstName, lastName, gender, dateOfBirth, classId, etc.).
*   **Saving Data:**
    *   **On Add:** Use the Firebase SDK to `addDoc` to the `/schools/{schoolId}/students` collection.
    *   **On Edit:** Use the Firebase SDK to `updateDoc` on the specific student document at `/schools/{schoolId}/students/{studentId}`.
    *   Remember to include `createdAt` (on add) and `updatedAt` (on edit) timestamps using `serverTimestamp()`.
*   **Photo Upload:**
    *   If a photo is provided, upload it to Firebase Storage at a path like `schools/{schoolId}/student_photos/{studentId/timestamp}`.
    *   After a successful upload, get the `downloadURL` and save it to the `photoUrl` field in the student's Firestore document.

By following this guide, you will build a robust student management module for your mobile app that is fully synchronized with your existing web platform.