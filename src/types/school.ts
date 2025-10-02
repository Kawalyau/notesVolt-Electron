
// src/types/school.ts
import type { Timestamp as FirebaseClientTimestamp } from 'firebase/firestore';
import { z } from 'zod';

export type AppTimestamp = FirebaseClientTimestamp | string;


interface PrimaryContact {
  fullName: string;
  position: string;
  phoneNumber: string;
  emailAddress: string;
  nin?: string | null;
}

export interface SchoolClass {
  id: string;
  class: string; // e.g., P1, S1
  code?: string | null; // e.g., P1A, S1BLUE (Optional alternative identifier)
  createdAt?: AppTimestamp;
}

export interface SchoolSubject {
  id: string;
  subject: string; // e.g., Mathematics, English
  code?: string | null; // Optional subject code
  createdAt?: AppTimestamp;
}

export interface SchoolStream {
  id: string;
  name: string; // e.g., Red, Blue, North Wing
  createdAt?: AppTimestamp;
}

export interface SchoolAcademicYear {
  id: string;
  year: string; // e.g., "2024", "2024-2025"
  createdAt?: AppTimestamp;
}

export interface SchoolTerm {
  id: string;
  name: string; // e.g., "Term 1", "Semester A"
  academicYearId: string; // ID of the SchoolAcademicYear it belongs to
  academicYearName?: string; // Denormalized for display
  createdAt?: AppTimestamp;
  isClosed?: boolean; // New field
}


export interface NewPhysicalRequirementState {
  name: string;
  description: string;
  category: string;
  price: number;
  quantityPerStudent: number;
  unit: string;
  assignmentType: 'class' | 'optional_general' | 'individual_specific';
  isCompulsory: boolean;
  allowPhysicalProvision: boolean;
  applicableClassIds: string[];
  notes: string;
}

export interface PhysicalRequirement extends Omit<NewPhysicalRequirementState, 'applicableClassIds'> {
  id: string;
  applicableClassIds?: string[];
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}


export interface StudentRequirementStatus {
  id?: string; // requirementId
  requirementId: string;
  requirementName: string; // Denormalized
  originalPricePerUnit: number;
  originalQuantityNeeded: number;
  totalExpectedAmount: number; // price * quantityNeeded
  amountPaid: number; // Monetary payment towards this requirement
  quantityProvided: number; // Physical items provided by student/parent
  status: 'Fully Settled' | 'Partially Settled' | 'Pending' | 'Exempted' | 'Fully Settled (Monetary)' | 'Fully Settled (Physical)' | 'Fully Settled (Mixed)';
  lastTransactionDate?: AppTimestamp;
  notes?: string | null;
  academicYearId?: string | null; // Context of this status/payment
  term?: string | null; // Context of this status/payment
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface StudentRequirementAssignmentLog {
  id?: string;
  studentId: string; 
  requirementId: string;
  requirementName: string; // Denormalized
  quantityAssigned: number; // Quantity GIVEN to student by school
  assignmentDate: AppTimestamp;
  notes?: string | null;
  adminId: string; // UID of admin who recorded the assignment
  adminName?: string; // Display name of admin
}


export interface ClassSpecificAmount {
  classId: string;
  className?: string; 
  amount: number;
}

export interface FeeItem {
  id: string;
  name: string;
  description?: string | null;
  isRecurring: boolean;
  isCompulsory: boolean;
  revenueAccountId?: string | null; // Link to Chart of Accounts
  academicYearId?: string | null; 
  term?: string | null;          
  classAmounts: ClassSpecificAmount[];
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface FeeItemFormValues { 
    name: string;
    description?: string;
    isRecurring: boolean;
    isCompulsory: boolean;
    revenueAccountId?: string;
    classAmounts: Array<{ classId: string; amount: string | number }>;
}

export interface SchoolPayConfig {
  schoolCode?: string | null;
  password?: string | null;
}

export interface RegistrationNumberConfig {
  prefix?: string | null;
  nextSuffix?: number | null;
  suffixPadding?: number | null;
}

export interface ExerciseBookTransaction {
    id: string;
    type: 'payment' | 'issuance';
    bookCategory: 'small' | 'large';
    quantity: number;
    date: AppTimestamp;
    recordedByAdminId: string;
    recordedByAdminName: string;
    notes?: string;
}

export interface Student {
  id: string;
  schoolId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: AppTimestamp; // Storing as ISO string after parsing in functions
  classId: string;
  streamId?: string | null;
  studentRegistrationNumber: string;
  
  email?: string | null;
  phoneNumber?: string | null;
  nationality?: string | null;
  disability?: boolean | string | null; 
  disabilityNature?: string | null;

  guardianName?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  guardianRelation?: string | null; 

  dayBoardingStatus?: 'Day' | 'Boarder' | string | null; 

  photoUrl?: string | null;
  admissionDate?: AppTimestamp;
  status: 'Active' | 'Inactive' | 'Graduated' | 'Withdrawn';

  schoolPaySyncedAt?: AppTimestamp | null;
  schoolPaySyncStatus?: 'Success' | 'Failed' | 'Pending' | null;
  schoolPayStudentId?: string | null;

  feeBalance?: number; // Sum of all debit/credit fee transactions

  // Fields for Exercise Book Tracking
  exerciseBooksSmall_Paid?: number;
  exerciseBooksSmall_Received?: number;
  exerciseBooksLarge_Paid?: number;
  exerciseBooksLarge_Received?: number;

  createdAt: AppTimestamp; // Storing as ISO string after creation in functions
  updatedAt: AppTimestamp; // Storing as ISO string after update in functions
  createdBy: string;
}

export interface FeeTransaction {
  id?: string;
  studentId: string;
  schoolId: string;
  type: 'debit' | 'credit';
  description: string;
  amount: number; 
  feeItemId?: string | null; 
  academicYearId?: string | null; 
  term?: string | null;          
  transactionDate: AppTimestamp; // Storing as ISO string after creation in functions
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  paymentMethod?: string | null; 
  reference?: string | null;     
  createdAt?: AppTimestamp; // Storing as ISO string after creation in functions
  journalEntryId?: string | null;
  receiptPrinted?: boolean;
  receiptPrintedAt?: AppTimestamp;
  receiptPrintedBy?: string;
  receiptPrintedByName?: string;
}


export interface FeeReceiptItemDetails {
  name: string; // Name of the fee item billed
  billedAmount: number; // Amount billed for this item in the context
}

export interface FeeReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentClass: string;
  receiptNumber: string; // Transaction ID of the payment
  transactionDate: string; // Formatted string for display
  paymentReceived: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paidForDescription: string; // From the payment transaction
  academicYear: string; // Context of the payment transaction
  term: string;         // Context of the payment transaction
  items: FeeReceiptItemDetails[]; // Billed items within the transaction's academic context
  totalBilledThisContext: number; // Total billed for all items in transaction's context
  totalPaidThisContext: number; // Total paid by student within transaction's context UP TO this transaction
  previousOverallBalance: number; 
  newOverallBalance: number; 
}

export interface RequirementPaymentReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentSchoolPayId?: string | null;
  studentClass: string;
  transactionDate: string; // Date of the last recorded payment/provision
  currentAcademicYear?: string;
  currentTerm?: string;
  items: ReceiptItemData[]; 
  totalNetMonetaryDueOverall: number; 
}

export interface ReceiptItemData {
  id: string; // Requirement ID
  name: string;
  isCompulsory: boolean;
  unitPrice: number;
  qtyNeeded: number;
  qtyPhysicallyProvidedByStudent: number; 
  qtyCoveredByPaymentMonetaryEquiv: number; 
  qtyAlreadyGivenToStudent: number; 
  effectiveTotalQtySettled: number; 
  physicalQtyStillDueFromStudent: number; 
  netMonetaryBalanceDueForUnprovidedItems: number; 
  isCurrentTransactionItem: boolean; 
}


export interface SchoolExpense {
  id: string;
  date: AppTimestamp;
  category: string;
  accountId?: string | null;
  accountName?: string | null;
  description: string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
  journalEntryId?: string | null;
}

export interface SchoolIncome {
  id: string;
  date: AppTimestamp;
  source: string;
  accountId?: string | null;
  accountName?: string | null;
  description: string;
  amount: number;
  paymentMethodReceived?: string | null;
  reference?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
  journalEntryId?: string | null;
}


export interface School {
  id: string;
  name: string;
  schoolType: string; 
  ownership: string; 
  motto?: string | null;
  yearEstablished?: number | null; 
  level: string; 
  curriculum?: string | null; 
  gradingSystem?: string | null; 
  
  currentAcademicYearId?: string | null;
  currentTerm?: string | null; 
  termStructure?: string | null; 
  timezone?: string | null; 

  registrationNumber?: string | null; 
  unebCentreNumber?: string | null;
  upiNumber?: string | null; 
  badgeImageUrl?: string | null;
  description?: string | null;

  // Location
  district: string;
  subcounty: string;
  parish?: string | null;
  village?: string | null;
  address: string; 
  gpsCoordinates?: { lat: number; lng: number } | null;

  // Contact
  phoneNumber?: string | null;
  email?: string | null;
  website?: string | null;

  primaryContact: PrimaryContact;

  // Finance & Payment
  currency?: 'UGX'; 
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string | null; 
  feeStructureUrl?: string | null; 
  bankAccountInfo?: string | null; 
  schoolPayConfig?: SchoolPayConfig | null;
  registrationNumberConfig?: RegistrationNumberConfig | null;
  defaultCashAccountId?: string | null;
  defaultAccountsReceivableAccountId?: string | null;
  defaultFeeRevenueAccountId?: string | null;
  defaultBursaryExpenseAccountId?: string | null;

  // Document Uploads
  registrationCertificateUrl?: string | null;
  unebCertificateUrl?: string | null;
  headteacherAppointmentLetterUrl?: string | null;
  academicCalendarUrl?: string | null;

  // SMS Configuration
  enableSmsNotifications?: boolean;
  smsConfig?: SchoolSmsConfig;


  // System Features
  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;

  // Platform & Tenant (Advanced)
  multiTenantCode?: string | null;
  customDomain?: string | null;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string[]; 

  siteContent?: SiteContent;

  adminUids: string[];
  createdBy: string;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}


export interface SchoolSmsConfig {
  defaultProvider?: 'EgoSMS';
  egoSms?: {
    username?: string;
    password?: string;
    sender?: string;
  };
}


export interface SchoolSettingsFormData {
  // Basic Info
  name: string;
  schoolType: string;
  schoolTypeOther?: string;
  ownership: string;
  ownershipOther?: string;
  motto?: string;
  yearEstablished?: number | null;
  level: string;
  levelOther?: string;
  curriculum?: string;
  gradingSystem?: string;
  registrationNumber?: string;
  unebCentreNumber?: string;
  upiNumber?: string;
  badgeImage?: File | null;
  description?: string;

  // Location
  district: string;
  districtOther?: string;
  subcounty: string;
  parish?: string;
  village?: string;
  address: string;
  gpsCoordinatesLat?: number | null;
  gpsCoordinatesLng?: number | null;

  // Contact
  phoneNumber?: string;
  email?: string;
  website?: string;

  // Primary Contact (Admin Info)
  primaryContact_fullName: string;
  primaryContact_position: string;
  primaryContact_positionOther?: string;
  primaryContact_phoneNumber: string;
  primaryContact_emailAddress: string;
  primaryContact_nin?: string;

  // Academic Settings (General)
  currentAcademicYearId?: string | null;
  currentTerm?: string | null;
  termStructure?: string | null;
  timezone?: string | null;
  academicCalendarFile?: File | null;
  
  // Finance & Payment
  currency?: 'UGX';
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string;
  preferredPaymentProviderOther?: string;
  feeStructureFile?: File | null;
  bankAccountInfo?: string;

  // Default Account Links
  defaultCashAccountId?: string | null;
  defaultAccountsReceivableAccountId?: string | null;
  defaultFeeRevenueAccountId?: string | null;
  defaultBursaryExpenseAccountId?: string | null;

  // SchoolPay Config
  schoolPay_schoolCode?: string;
  schoolPay_password?: string;

  // Registration Number Config
  regNum_prefix?: string;
  regNum_nextSuffix?: number | null;
  regNum_suffixPadding?: number | null;

  // Document Uploads
  registrationCertificateFile?: File | null;
  unebCertificateFile?: File | null;
  headteacherAppointmentLetterFile?: File | null;

  // System Features
  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableSmsNotifications?: boolean;
  smsGatewayConfig?: string;
  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;

  // Platform & Tenant
  multiTenantCode?: string;
  customDomain?: string;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string; 
}


export interface SiteContent {
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImageUrl?: string | null;
  aboutUsContent?: string | null;
  aboutImageUrl?: string | null;
  footerDescription?: string | null;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  imageUrl?: string | null;
  isPublished: boolean;
  publishedAt?: string | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface Publication {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'other';
  isPublished: boolean;
  createdAt: AppTimestamp;
}

export interface GalleryImage {
  id: string;
  title: string;
  imageUrl: string;
  isPublished: boolean;
  createdAt: AppTimestamp;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: AppTimestamp;
  location?: string | null;
  imageUrl?: string | null;
  isPublished: boolean;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

// Staff/Teacher Types
export interface StaffSalaryItem {
  type: 'Allowance' | 'Deduction';
  name: string;
  amount: number;
}

export interface StaffTransaction {
  id: string;
  teacherId: string;
  type: 'credit' | 'debit'; // credit=payment to teacher, debit=charge/advance to teacher
  amount: number;
  description: string;
  paymentMethod: string | null;
  reference: string | null;
  transactionDate: AppTimestamp;
  recordedByAdminId: string;
  recordedByAdminName: string | null;
}

export interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  photoUrl?: string | null;
  status: 'Active' | 'Inactive';
  // Payroll info
  baseSalary?: number | null;
  salaryBalance?: number;
  recurringItems?: StaffSalaryItem[];
  contractStartDate?: AppTimestamp | null;
  contractEndDate?: AppTimestamp | null;
}

// Attendance Types
export type AttendanceStatus = 'Present' | 'Absent' | 'Late';

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  recordedByAdminId: string;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

// Ticketing System Types
export type TicketCategory = 'Billing' | 'Academic' | 'Technical' | 'General Inquiry';
export type TicketStatus = 'Open' | 'Pending' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  submittedBy: { name: string; phone: string; email: string | null; };
  studentId?: string | null;
  studentName?: string | null;
  studentRegNo?: string | null;
  className?: string | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface TicketMessage {
  id: string;
  content: string;
  senderId: string; // Can be admin UID or parent/student UID
  senderName: string; // e.g., "John Doe (Parent)" or "Admin Name"
  createdAt: AppTimestamp;
}

// Finance & Accounting Types
export const accountTypeOptions = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
export type AccountType = typeof accountTypeOptions[number];

export interface ChartOfAccountItem {
  id: string;
  accountName: string;
  accountType: AccountType;
  parentAccountId?: string | null;
  accountCode?: string | null;
  description?: string | null;
  balance?: number; // Not stored in DB, calculated on client
  balanceType?: 'debit' | 'credit'; // Not stored in DB
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface ChartOfAccountItemFormValues {
    accountName: string;
    accountType?: AccountType;
    parentAccountId?: string | null;
    accountCode?: string;
    description?: string;
}

export interface JournalEntryLine {
  accountId: string;
  accountName: string; // Denormalized for display
  debit: number | null;
  credit: number | null;
  description: string | null;
}

export interface JournalEntry {
  id: string;
  date: AppTimestamp;
  description: string;
  lines: JournalEntryLine[];
  schoolId: string;
  postedByAdminId: string;
  postedByAdminName: string;
  sourceDocumentId?: string | null;
  sourceDocumentType?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}


// Nursery Specific Types
export interface NurseryGradeLevel {
  id: string;
  name: string; // e.g., "Exceeds", "Meeting", "Beginning"
  remark: string; // "Consistently exceeds expectations."
  color: string; // e.g., "#10B981" for color coding
}

export interface NurseryCompetence {
  id: string;
  name: string; // e.g., "Identifies 10 colors"
  category: string; // e.g., "Cognitive Skills", "Social & Emotional"
}

export interface NurseryAssessment {
  id: string;
  name: string; // e.g., "Term 1 Mid-Term Assessment"
  academicYearId: string;
  term: string;
  competenceIds: string[];
  gradeScaleId: string; // e.g., 'default_scale'
  examId?: string | null; // Optional link to a primary exam
}

export interface NurseryStudentReport {
  studentId: string;
  assessments: {
    [assessmentId: string]: {
      results: {
        [competenceId: string]: string; // gradeLevelId
      },
      teacherComment?: string;
      principalComment?: string;
    };
  };
  updatedAt: AppTimestamp;
}

export interface StudentPaperScore {
  examSubjectId: string;
  subjectName: string;
  isCoreSubject: boolean;
  score: number | null;
  grade: string | null;
  gradeValue: number | null;
}

export interface StudentExamProfile {
  id: string;
  studentId: string;
  examId: string;
  scores: StudentPaperScore[];
  aggregate: number | null;
  division: string | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface Grade {
    id: string;
    name: string; // D1, D2
    value: number; // 1, 2
    lowerBound: number;
    upperBound: number;
    comment?: string;
}

export interface Division {
    id: string;
    name: string; // Division 1
    minAggregate: number;
    maxAggregate: number;
}

export interface GradingScale {
    id: string;
    name: string;
    grades: Grade[];
    divisions: Division[];
    failValue: number; // The grade value that signifies a failure (e.g., 9 for F9)
    isDefault: boolean;
}

export interface ExamSubject {
    id: string;
    subjectId: string;
    subjectName: string;
    isCoreSubject: boolean; // Indicates if it's one of the 4 core subjects for aggregation
    maxScore: number;
    createdAt: AppTimestamp;
}

export interface Exam {
    id: string;
    name: string;
    academicYearId: string;
    term: string;
    defaultGradingScaleId: string;
}


export interface ReportConfiguration {
    id: string;
    name: string;
    academicYearId: string;
    term: string;
    gradingScaleId: string;
    sources: Array<{
        examId: string;
        examName: string; // Denormalized
        weight: number; // Percentage, e.g., 50 for 50%
    }>;
}

export interface ReportConfigurationFormValues {
    name: string;
    academicYearId: string;
    term: string;
    gradingScaleId: string;
    sources: Array<{
        examId: string;
        weight: number | string;
    }>;
}
