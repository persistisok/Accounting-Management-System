export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'SYSTEM_ADMIN' | 'ADMIN' | 'PM' | 'GUEST';
  projectManagerId: string | null;
  projectManager?: ProjectManager | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  permissions: AccountPermission[];
}

export type PermissionResource = 'PROJECTS' | 'CONTRACTS' | 'BANKING' | 'INVOICES' | 'SUPPORTERS' | 'EXECUTORS' | 'EXPERTS' | 'MEMBERS';
export type PermissionLevel = 'VIEW' | 'EDIT' | 'REVIEW';
export interface AccountPermission { resource: PermissionResource; level: PermissionLevel }

export interface ProjectManager {
  id: string;
  displayName: string;
  department?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { projects: number };
}

export interface ListResponse<T> { items: T[]; total: number }

export type LedgerAttachmentObjectType = 'PROJECT' | 'CONTRACT' | 'BANK_TRANSACTION' | 'INVOICE' | 'MEMBERSHIP';

export interface LedgerAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: string;
  createdAt: string;
}

export interface FinancialSummary {
  receivableAmount: string;
  receivedAmount: string;
  invoicedAmount: string;
  receivedInvoiceAmount: string;
  payableExecutionAmount: string;
  paidExecutionAmount: string;
  paidExpertAmount: string;
  unreceivedAmount: string;
  uninvoicedAmount: string;
  unpaidExecutionAmount: string;
}

export interface Project {
  id: string;
  projectCode: string;
  platform: string;
  platformAbbreviation?: string;
  publishedOn: string;
  name: string;
  nature: string;
  projectType: string;
  periodMonths: number;
  approvedAmount: string;
  executionCost: string;
  pmName: string;
  pmUserId?: string;
  status: string;
  archiveStatus: 'UNARCHIVED' | 'ARCHIVED';
  requestedStatus?: 'CLOSED' | 'ABORTED' | null;
  statusReviewState?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  statusRequestedAt?: string | null;
  statusReviewedAt?: string | null;
  statusRequester?: Pick<User, 'id' | 'displayName'> | null;
  statusReviewer?: Pick<User, 'id' | 'displayName'> | null;
  requestedArchiveStatus?: 'ARCHIVED' | null;
  archiveReviewState?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  archiveRequestedAt?: string | null;
  archiveReviewedAt?: string | null;
  archiveRequester?: Pick<User, 'id' | 'displayName'> | null;
  archiveReviewer?: Pick<User, 'id' | 'displayName'> | null;
  remark?: string;
  pm?: ProjectManager;
  financialSummary: FinancialSummary;
  attachments: LedgerAttachment[];
  contracts?: Contract[];
  allocations?: BankAllocation[];
  invoices?: Invoice[];
}

export interface ProjectFilterOptions {
  platforms: string[];
  natures: string[];
  projectTypes: string[];
}

export interface Organization {
  id: string;
  organizationCode: string;
  name: string;
  platform: string;
  joinedOn?: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  ownerUserId?: string;
  owner: ProjectManager;
  cumulativeAmount?: string;
  roles?: { roleType: string }[];
}

export interface Contract {
  id: string;
  contractNo: string;
  contractDirection: string;
  contractType: string;
  contractEntity: string;
  projectId?: string;
  counterpartyId?: string;
  amount: string;
  signedOn: string;
  status: string;
  remark?: string;
  project: Pick<Project, 'id' | 'projectCode' | 'name'>;
  counterparty: Pick<Organization, 'id' | 'organizationCode' | 'name'>;
  attachments: LedgerAttachment[];
}

export interface BankAllocation {
  id: string;
  category: string;
  allocatedAmount: string;
  status: string;
  project?: Pick<Project, 'id' | 'projectCode' | 'name'>;
  expertProfile?: { id: string; person: { name: string } };
  memberDue?: { id: string; dueCode: string; periodLabel?: string; membership: { id: string; memberName: string; committee?: { name: string } } };
}

export interface BankTransaction {
  id: string;
  transactionNo?: string;
  bankAccountId: string;
  transactionAt: string;
  counterpartyName: string;
  counterpartyBankName?: string;
  counterpartyAccountMasked?: string;
  direction: 'IN' | 'OUT';
  amount: string;
  nature: string;
  settlementApplicable: boolean;
  matchStatus: string;
  sourceType: string;
  bankAccount: { bankName: string; accountNumberMasked: string };
  allocations: BankAllocation[];
  attachments: LedgerAttachment[];
}

export interface Invoice {
  id: string;
  projectId?: string;
  direction: 'ISSUED' | 'RECEIVED';
  issuedOn: string;
  invoiceType: string;
  invoicePlatform: string;
  buyerName: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  project: Pick<Project, 'id' | 'projectCode' | 'name'>;
  attachments: LedgerAttachment[];
}

export interface Expert {
  id: string;
  formOwnerId?: string;
  professionalTitle?: string;
  bankName?: string;
  bankAccountMasked?: string;
  joinedOn: string;
  reviewStatus: string;
  status: string;
  person: {
    id: string;
    name: string;
    phoneMasked?: string;
    idNumberMasked?: string;
    email?: string;
    organizationName?: string;
    department?: string;
    position?: string;
  };
  formOwner: ProjectManager;
  reviewer?: User;
  credentials: ExpertCredential[];
}

export interface ExpertCredential extends LedgerAttachment {}

export interface ExpertSensitiveDetails {
  name: string;
  phone?: string;
  idNumber?: string;
  bankAccount?: string;
  unavailableFields: string[];
}

export interface Committee {
  id: string;
  committeeCode: string;
  name: string;
  establishedOn: string;
  ownerUserId?: string;
  status?: string;
  owner: ProjectManager;
  _count?: { memberships: number };
}

export interface MemberDue {
  id: string;
  dueCode: string;
  periodLabel?: string;
  amountDue: string;
  amountPaid?: string;
  lastPaidAt?: string;
  dueOn?: string;
  status: string;
}

export interface Membership {
  id: string;
  memberName: string;
  memberType: string;
  memberPosition?: string;
  certificateIssued: boolean;
  committeeId?: string;
  pmUserId?: string;
  joinedOn?: string;
  status: string;
  committee: Committee;
  pm: ProjectManager;
  dues: MemberDue[];
  attachments?: LedgerAttachment[];
  _count?: { dues: number };
}
