
// src/types/school.ts
import type { Timestamp as FirebaseClientTimestamp } from 'firebase/firestore';
// For Firebase Admin SDK, Timestamp is imported directly in functions/src/index.js
// For shared types, we'll primarily deal with client-side Timestamp or ISO strings.

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
  class: string; // Changed from name
  code?: string | null;
  createdAt?: AppTimestamp;
}

export interface SchoolSubject {
  id: string;
  subject: string; // Changed from name
  code?: string | null;
  isCoreSubject: boolean; // To distinguish between core and other subjects
  createdAt?: AppTimestamp;
}

export interface SchoolStream {
  id: string;
  name: string;
  createdAt?: AppTimestamp;
}

export interface SchoolAcademicYear {
  id: string;
  year: string;
  createdAt?: AppTimestamp;
}

export interface SchoolTerm {
  id:string;
  name: string;
  academicYearId: string;
  academicYearName?: string;
  isClosed?: boolean;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

// --- NEW Examination Types ---

export interface Grade {
    id: string; // e.g., 'd1', 'c3', 'f9'
    name: string; // e.g., 'Distinction 1', 'Credit 3', 'Fail 9'
    lowerBound: number; // Inclusive lower bound (e.g., 80)
    upperBound: number; // Inclusive upper bound (e.g., 100)
    comment?: string; // e.g., 'Excellent'
    value: number; // Numerical value for averaging (e.g., D1=1, C3=3, F9=9)
}

export interface Division {
    id: string;
    name: string; // e.g., 'Division 1', 'Ungraded'
    minAggregate: number; // Inclusive lower bound
    maxAggregate: number; // Inclusive upper bound
}

export interface GradingScale {
    id: string;
    name: string; // e.g., 'O-Level Scale', 'A-Level Principal Pass Scale'
    grades: Grade[];
    divisions: Division[];
    failValue: number; // The grade value that signifies a fail (e.g., 9 for F9)
    isDefault: boolean;
    createdAt: AppTimestamp;
    updatedAt: AppTimestamp;
}

export interface Exam {
    id: string;
    name: string; // e.g., 'Mid-Term Exams', 'End of Year Exams'
    academicYearId: string;
    term: string;
    defaultGradingScaleId: string;
    createdAt: AppTimestamp;
    updatedAt: AppTimestamp;
}

export interface ExamSubject {
    id: string;
    examId?: string; // Reference back to the Exam document (useful for flat queries)
    subjectId: string; // Reference to SchoolSubject
    subjectName: string; // Denormalized
    paperCode?: string; // e.g., 535/1
    maxScore: number;
    isCoreSubject: boolean; // Denormalized from SchoolSubject for easier report generation
    createdAt?: AppTimestamp;
}


export interface StudentPaperScore {
    examSubjectId: string; // Reference to ExamSubject
    subjectName?: string;
    isCoreSubject: boolean;
    score?: number | null;
    grade?: string | null; // e.g., 'D1'
    gradeValue?: number | null; // e.g., 1
}

export interface StudentExamProfile {
    id: string; // Composite key like `${studentId}_${examId}` might be useful, or a unique ID
    studentId: string;
    examId: string;
    scores: StudentPaperScore[];
    aggregate?: number | null;
    division?: string | null;
    totalScore?: number;
    averageScore?: number;
    classPosition?: number;
    streamPosition?: number;
    principalComments?: string;
    classTeacherComments?: string;
    createdAt: AppTimestamp;
    updatedAt: AppTimestamp;
}

// --- NEW Accumulated Report Types ---

export interface ReportConfigurationSource {
    examId: string;
    examName: string; // Denormalized
    weight: number; // Percentage, e.g., 50 for 50%
}

export interface ReportConfiguration {
    id: string;
    name: string; // e.g., "Term 1 Final Report"
    academicYearId: string;
    term: string;
    sources: ReportConfigurationSource[];
    gradingScaleId: string; // The scale to use for the final accumulated scores
    createdAt: AppTimestamp;
    updatedAt: AppTimestamp;
}


// --- End Examination Types ---


export const accountTypeOptions = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] as const;
export type AccountType = typeof accountTypeOptions[number];

export interface ChartOfAccountItem {
  id: string;
  accountName: string;
  accountType: AccountType;
  accountCode?: string | null;
  description?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
  balance?: number; // For client-side display, calculated from journal entries
  balanceType?: 'debit' | 'credit' | 'zero'; // For client-side display
}

export interface ChartOfAccountItemFormValues {
    accountName: string;
    accountType: AccountType | undefined; // Allow undefined for initial form state
    accountCode?: string;
    description?: string;
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

export interface PhysicalRequirement {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  price?: number | null;
  quantityPerStudent?: number | null;
  unit?: string | null;
  assignmentType: 'class' | 'optional_general' | 'individual_specific';
  isCompulsory: boolean;
  allowPhysicalProvision: boolean;
  applicableClassIds?: string[];
  notes?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}


export interface StudentRequirementStatus {
  id?: string;
  requirementId: string;
  requirementName: string;
  originalPricePerUnit: number;
  originalQuantityNeeded: number;
  totalExpectedAmount: number;
  amountPaid: number;
  quantityProvided: number;
  status: 'Fully Settled' | 'Partially Settled' | 'Pending' | 'Exempted' | 'Fully Settled (Monetary)' | 'Fully Settled (Physical)' | 'Fully Settled (Mixed)';
  lastTransactionDate?: AppTimestamp;
  academicYearId?: string | null;
  term?: string | null;
  notes?: string | null;
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface StudentRequirementAssignmentLog {
  id?: string;
  studentId: string;
  requirementId: string;
  requirementName: string;
  quantityAssigned: number;
  assignmentDate: AppTimestamp;
  notes?: string | null;
  adminId: string;
  adminName?: string;
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
  academicYearId?: string | null;
  term?: string | null;
  revenueAccountId?: string | null; // ID of the ChartOfAccountItem (Revenue type)
  classAmounts: ClassSpecificAmount[];
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}


export interface FeeItemFormValues {
    name: string;
    description: string;
    isRecurring: boolean;
    isCompulsory: boolean;
    revenueAccountId: string | undefined; // Changed to string | undefined
    classAmounts: Array<{ classId: string; amount: string | number | undefined }>; // amount can be string for form input
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

export interface Student {
  id: string;
  schoolId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: 'Male' | 'Female' | 'Other';
  dateOfBirth: AppTimestamp; // Can be ISO string or client-side Timestamp
  classId: string;
  className?: string; // Denormalized for convenience
  streamId?: string | null;
  studentRegistrationNumber: string;

  email?: string | null;
  phoneNumber?: string | null;
  nationality?: string | null;
  disability?: boolean | null;
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
  schoolPaySyncMessage?: string | null;
  schoolPayStudentId?: string | null;

  feeBalance?: number;

  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
  createdBy: string;
}

export interface FeeTransaction {
  id?: string;
  studentId: string;
  studentName?: string; // Denormalized for convenience
  studentClass?: string; // Denormalized for convenience
  schoolId: string;
  type: 'debit' | 'credit';
  description: string;
  amount: number;
  feeItemId?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  transactionDate: AppTimestamp; // Can be ISO string or client-side Timestamp
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  journalEntryId?: string | null; // Link to the created Journal Entry
  receiptPrinted?: boolean;
  receiptPrintedAt?: AppTimestamp;
  receiptPrintedBy?: string;
  receiptPrintedByName?: string;
  createdAt?: AppTimestamp;
}


export interface FeeReceiptData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentClass: string;
  receiptNumber: string;
  transactionDate: string;
  paymentReceived: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paidForDescription: string;
  academicYear: string;
  term: string;
  items: FeeReceiptItemDetails[];
  totalBilledThisContext: number;
  totalPaidThisContext: number;
  previousOverallBalance: number;
  newOverallBalance: number;
}

export interface FeeReceiptItemDetails {
  name: string;
  billedAmount: number;
}


export interface StudentFeeStatementData {
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  schoolLogoUrl?: string | null;
  studentName: string;
  studentRegNo: string;
  studentClass: string;
  statementPeriod: string;
  openingBalance: number;
  transactions: Array<FeeTransaction & { runningBalance: number }>;
  closingBalance: number;
  generatedDate: string;
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
  transactionDate: string;
  currentAcademicYear?: string;
  currentTerm?: string;
  items: ReceiptItemData[];
  totalNetMonetaryDueOverall: number;
}

export interface ReceiptItemData {
  id: string;
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
  date: AppTimestamp; // Can be ISO string or client-side Timestamp
  accountId?: string | null; // Link to ChartOfAccountItem (Expense type)
  accountName?: string | null; // Denormalized
  category?: string | null; // Legacy field, prefer accountName
  description: string;
  amount: number;
  paymentMethod?: string | null;
  reference?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  journalEntryId?: string | null; // Link to the created Journal Entry
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface SchoolIncome {
  id: string;
  date: AppTimestamp; // Can be ISO string or client-side Timestamp
  accountId?: string | null; // Link to ChartOfAccountItem (Revenue type)
  accountName?: string | null; // Denormalized
  source?: string | null; // Legacy, prefer accountName if linked to CoA
  description: string;
  amount: number;
  paymentMethodReceived?: string | null;
  reference?: string | null;
  academicYearId?: string | null;
  term?: string | null;
  recordedByAdminId: string;
  recordedByAdminName?: string | null;
  journalEntryId?: string | null; // Link to the created Journal Entry
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

export interface JournalEntryLine {
  accountId: string;
  accountName?: string; // Denormalized for display
  debit?: number | null;
  credit?: number | null;
  description?: string | null;
}

export interface JournalEntry {
  id: string;
  date: AppTimestamp; // Can be ISO string or client-side Timestamp
  description: string;
  lines: JournalEntryLine[];
  schoolId: string;
  postedByAdminId: string;
  postedByAdminName?: string | null;
  sourceDocumentId?: string; // e.g., FeeTransaction ID, Income ID, Expense ID
  sourceDocumentType?: 'FeeTransaction' | 'SchoolIncome' | 'SchoolExpense' | 'Manual';
  createdAt?: AppTimestamp;
  updatedAt?: AppTimestamp;
}

// SMS Configuration Types
export interface EgoSmsProviderConfig {
  username?: string | null;
  password?: string | null;
  sender?: string | null;
}

// Add other provider configs here, e.g., TwilioConfig
// export interface TwilioProviderConfig { ... }

export interface SchoolSmsConfig {
  defaultProvider?: 'EgoSMS' | string | null; // Allow string for future providers
  egoSms?: EgoSmsProviderConfig | null;
  // twilio?: TwilioProviderConfig | null;
}

// --- NEW School Website Content Types ---
export interface NewsArticle {
  id: string;
  title: string;
  content: string; // Could be markdown or rich text
  imageUrl?: string | null;
  authorId?: string;
  authorName?: string;
  isPublished: boolean;
  publishedAt?: AppTimestamp;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface Publication {
  id: string;
  title: string;
  description?: string | null;
  fileUrl: string; // URL to the PDF, DOCX, etc.
  fileName: string; // e.g., "Term_1_Newsletter.pdf"
  fileType: 'pdf' | 'docx' | 'link' | 'other';
  isPublished: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface GalleryImage {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  isPublished: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: AppTimestamp;
  location?: string | null;
  imageUrl?: string | null;
  isPublished: boolean;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  expiresAt?: AppTimestamp | null;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}

export interface SiteContent {
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  heroImageUrl?: string | null;
  aboutUsContent?: string | null;
  aboutImageUrl?: string | null;
  footerDescription?: string | null;
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
  gradingScaleDescription?: string | null;
  assessmentTypesList?: string[]; 

  currentAcademicYearId?: string | null;
  currentTerm?: string | null;
  termStructure?: string | null;
  timezone?: string | null;

  registrationNumber?: string | null;
  unebCentreNumber?: string | null;
  upiNumber?: string | null;
  badgeImageUrl?: string | null;
  description?: string | null;

  district: string;
  subcounty: string;
  parish?: string | null;
  village?: string | null;
  address: string;
  gpsCoordinates?: { lat: number; lng: number } | null;

  phoneNumber?: string | null;
  email?: string | null;
  website?: string | null;

  primaryContact: PrimaryContact;

  currency?: 'UGX';
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string | null;
  feeStructureUrl?: string | null;
  bankAccountInfo?: string | null;
  schoolPayConfig?: SchoolPayConfig | null;
  registrationNumberConfig?: RegistrationNumberConfig | null;
  
  // Default accounts for automated journal entries
  defaultCashAccountId?: string | null;
  defaultAccountsReceivableAccountId?: string | null;
  defaultBursaryExpenseAccountId?: string | null; 

  registrationCertificateUrl?: string | null;
  unebCertificateUrl?: string | null;
  headteacherAppointmentLetterUrl?: string | null;
  academicCalendarUrl?: string | null;

  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableSmsNotifications?: boolean;
  smsConfig?: SchoolSmsConfig | null; 
  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;
  
  multiTenantCode?: string | null;
  customDomain?: string | null;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string[];
  siteContent?: SiteContent;
  
  // Placeholder for stats if we add them later
  stats?: {
    students?: number;
    teachers?: number;
    classes?: number;
    awards?: number;
  };

  adminUids: string[];
  createdBy: string;
  createdAt: AppTimestamp;
  updatedAt: AppTimestamp;
}


export interface SchoolSettingsFormData {
  name?: string;
  schoolType?: string;
  schoolTypeOther?: string;
  ownership?: string;
  ownershipOther?: string;
  motto?: string;
  yearEstablished?: number | string | null;
  level?: string;
  levelOther?: string;
  curriculum?: string;
  gradingScaleDescription?: string;
  registrationNumber?: string;
  unebCentreNumber?: string;
  upiNumber?: string;
  badgeImage?: File | null;
  description?: string;

  district?: string;
  districtOther?: string;
  subcounty?: string;
  parish?: string;
  village?: string;
  address?: string;
  gpsCoordinatesLat?: number | string | null;
  gpsCoordinatesLng?: number | string | null;

  phoneNumber?: string;
  email?: string;
  website?: string;

  primaryContact_fullName?: string;
  primaryContact_position?: string;
  primaryContact_positionOther?: string;
  primaryContact_phoneNumber?: string;
  primaryContact_emailAddress?: string;
  primaryContact_nin?: string;

  currentAcademicYearId?: string | null;
  currentTerm?: string | null;
  termStructure?: string | null;
  timezone?: string | null;
  academicCalendarFile?: File | null;
  
  currency?: 'UGX';
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string;
  preferredPaymentProviderOther?: string;
  feeStructureFile?: File | null;
  bankAccountInfo?: string;
  defaultCashAccountId?: string | null; 
  defaultAccountsReceivableAccountId?: string | null; 
  defaultBursaryExpenseAccountId?: string | null; 

  schoolPay_schoolCode?: string;
  schoolPay_password?: string;

  regNum_prefix?: string;
  regNum_nextSuffix?: number | string | null;
  regNum_suffixPadding?: number | string | null;

  registrationCertificateFile?: File | null;
  unebCertificateFile?: File | null;
  headteacherAppointmentLetterFile?: File | null;

  enableStudentPortal?: boolean;
  enableParentPortal?: boolean;
  enableTeacherPortal?: boolean;
  enableSmsNotifications?: boolean;
  smsConfig_egoSms_apiKey?: string; 
  smsConfig_egoSms_senderId?: string;

  enableAttendanceTracking?: boolean;
  enableExamsModule?: boolean;
  enableTimetableModule?: boolean;
  enableHostelModule?: boolean;
  enableTransportModule?: boolean;
  enableLibraryModule?: boolean;
  enableReportsModule?: boolean;
  enableInventoryAssetsModule?: boolean;
  
  multiTenantCode?: string;
  customDomain?: string;
  dataRetentionPolicyYears?: number | null;
  autoBackupEnabled?: boolean;
  complianceTags?: string;
}

// Combined type for general academic settings form on the academic settings page
export interface AcademicSettingsFormValues {
  currentAcademicYearId?: string | null;
  currentTerm?: string | null;
  termStructure?: string | null;
  timezone?: string | null;
}

// Combined type for general finance settings on finance settings page
export interface GeneralFinanceFormValues {
  currency?: 'UGX';
  acceptsMobileMoney?: boolean;
  preferredPaymentProvider?: string;
  preferredPaymentProviderOther?: string;
  feeStructureFile?: File | null;
  bankAccountInfo?: string;
  defaultCashAccountId?: string | null;
  defaultAccountsReceivableAccountId?: string | null;
  defaultBursaryExpenseAccountId?: string | null;
}

// Type for basic school info form on its own settings page
export interface BasicSchoolInfoFormValues {
  name: string;
  schoolType: string;
  schoolTypeOther?: string;
  ownership: string;
  ownershipOther?: string;
  motto?: string;
  yearEstablished?: number | string | null; // Allow string for form input
  level: string;
  levelOther?: string;
  curriculum?: string;
  gradingSystem?: string;
  registrationNumber?: string;
  unebCentreNumber?: string;
  upiNumber?: string;
  badgeImage?: File | null; // Or string if URL is handled
  description?: string;
}
