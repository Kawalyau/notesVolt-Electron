# Prompt: Create a Mobile School Management System

## **Objective**

Create a comprehensive, cross-platform mobile application (for iOS and Android) that serves as the mobile version of our existing web-based School Management System. The mobile app should empower school administrators to manage core operations on the go, with a primary focus on student fee management and reporting.

The app must be built using **React Native with Expo** and connect to the **existing Firebase/Firestore backend**. It should mirror the data structure and core logic of the web application to ensure seamless data consistency.

## **Core Requirements & Tech Stack**

*   **Platform:** iOS & Android.
*   **Framework:** React Native with Expo.
*   **Backend:** Connect to the existing Firebase Project (Firestore, Auth, Storage).
*   **UI/UX:** The user interface must be clean, modern, beautiful, and intuitive, following mobile design best practices. Use a component library like React Native Paper or a custom-built component system with a consistent design language.
*   **Offline Support:** While not a primary requirement for the first version, consider patterns that would allow for future offline capabilities (e.g., local caching of student lists).

## **Key Feature Modules**

### **1. Secure Authentication**

*   **Admin Login:** Implement a secure login screen for school administrators using Firebase Authentication (Email & Password).
*   **Session Management:** Maintain user sessions, allowing admins to stay logged in. Provide a secure logout option.

### **2. Student & Fee Management**

This is the core of the application.

*   **Student Directory:**
    *   Display a list of all students in the school.
    *   Implement a search functionality to find students by Name or Registration Number.
    *   Implement filtering by Class.
*   **Student Fee Ledger View:**
    *   Tapping a student should navigate to their detailed fee management screen.
    *   Clearly display the student's current overall fee balance.
    *   Show a chronological list of all fee transactions (debits and credits) for the student, identical to the web version's ledger. Include date, description, debit amount, credit amount, and a running balance for each transaction.
*   **Record Transactions:**
    *   **Record Payment (Credit):** Create a form to record a new payment. Fields should include Amount, Payment Method, Description, and an optional Reference number.
    *   **Bill Student (Debit):** Create a form to bill a student for a specific fee item. This should pull from the existing list of `feeItems` in Firestore. The amount can be auto-filled based on the student's class.
    *   **Award Bursary (Credit):** Implement a form to award a bursary, which functions as a credit transaction with a specific "Bursary/Scholarship" payment method.

### **3. Receipt Generation and Printing**

This feature is critical and must be implemented precisely.

*   **Generate Receipt Data:** After a payment is recorded, the app must generate receipt data.
*   **Identical Receipt Format:** The generated receipt **must have the exact same structure, layout, and information** as the web version's receipt. This includes:
    *   School Logo, Name, and Contact Details.
    *   Student Name, Registration Number, and Class.
    *   Receipt Number (Transaction ID) and Date.
    *   Payment details (Amount Received, Method, Reference).
    *   A summary of billed items for the current academic context (term/year).
    *   A financial summary showing: Previous Balance, Payment Amount, and New Overall Balance.
    *   A "Received by" field, populated with the logged-in admin's name.
*   **Printing Functionality:** Integrate a mobile printing library (e.g., `expo-print`) to generate a printable PDF from the receipt data and open the device's native print dialog.

### **4. Reporting System**

Implement a simplified reporting module for key financial overviews.

*   **Student Fee Balances Report:**
    *   Display a school-wide list of all students and their current fee balances.
    *   Provide options to filter by class.
    *   Provide options to sort by student name or by balance (highest to lowest).
*   **Class Fee Summary:**
    *   Allow the admin to select a Class, Academic Year, and Term.
    *   Display a summary card showing:
        *   Total Amount Billed for that class in the selected period.
        *   Total Amount Paid for that class in the selected period.
        *   Total Outstanding Balance for the class in that period.

## **Firebase Data Structure**

The application must adhere to the following Firestore data structure:

*   **Root Collection: `schools`**
    *   Each document represents a school. The app will operate within the context of a single school document (`/schools/{schoolId}`).
    *   **Key Fields:** `name`, `address`, `badgeImageUrl`, `adminUids` (array of admin user IDs).

*   **Subcollection: `/schools/{schoolId}/students`**
    *   Each document represents a student.
    *   **Key Fields:**
        *   `firstName` (string)
        *   `lastName` (string)
        *   `studentRegistrationNumber` (string)
        *   `classId` (string, reference to a document in `schoolClasses`)
        *   `feeBalance` (number) - This is the most important field for financial views.
        *   `status` ('Active', 'Inactive', etc.)

*   **Subcollection: `/schools/{schoolId}/feeItems`**
    *   Each document represents a billable item (e.g., "Term 1 Tuition", "Uniform").
    *   **Key Fields:**
        *   `name` (string)
        *   `isCompulsory` (boolean)
        *   `classAmounts` (array of objects) - Defines the cost for each class.
            *   `classId` (string)
            *   `amount` (number)

*   **Subcollection: `/schools/{schoolId}/schoolClasses`**
    *   Each document represents a class.
    *   **Key Fields:**
        *   `class` (string, e.g., "Primary One")
        *   `code` (string, e.g., "P1")

*   **Sub-subcollection: `/schools/{schoolId}/students/{studentId}/feeTransactions`**
    *   Each document is a single transaction on a student's ledger.
    *   **Key Fields:**
        *   `type` (string: 'debit' or 'credit')
        *   `description` (string)
        *   `amount` (number)
        *   `transactionDate` (Timestamp)
        *   `recordedByAdminName` (string)

## **UI/UX Design Principles**

*   **Clarity and Simplicity:** The app should be easy to navigate for non-technical users. Avoid clutter.
*   **Consistency:** Maintain a consistent design language (colors, fonts, components) throughout the app, taking inspiration from the web app's theme.
*   **Responsiveness:** The UI must adapt cleanly to various screen sizes and orientations (phone and tablet).
*   **Feedback:** Provide clear visual feedback for user actions, such as loading indicators when fetching data or saving transactions, and success/error messages (toasts).

Please proceed with creating this mobile application, ensuring all the above requirements are met.
