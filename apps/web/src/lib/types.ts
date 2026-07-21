export interface User {
  id: string;
  username?: string;
  displayName: string;
  role: string;
  department?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { projects: number };
}

export interface ListResponse<T> { items: T[]; total: number }

export interface FinancialSummary {
  receivableAmount: string;
  receivedAmount: string;
  invoicedAmount: string;
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
  publishedOn: string;
  name: string;
  nature: string;
  periodMonths: number;
  approvedAmount: string;
  executionCost: string;
  pmName: string;
  pmUserId?: string;
  status: string;
  remark?: string;
  pm?: User;
  financialSummary: FinancialSummary;
  contracts?: Contract[];
  allocations?: BankAllocation[];
  invoices?: Invoice[];
  candidates?: Candidate[];
}

export interface Organization {
  id: string;
  organizationCode: string;
  name: string;
  creditCode?: string;
  platform: string;
  contactName?: string;
  contactPhone?: string;
  status: string;
  ownerUserId?: string;
  owner: User;
  cumulativeAmount?: string;
  roles?: { roleType: string }[];
}

export interface Candidate {
  id: string;
  selectionStatus: string;
  selectedOn?: string;
  remark?: string;
  organization: Organization;
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
}

export interface BankAllocation {
  id: string;
  category: string;
  allocatedAmount: string;
  status: string;
  project?: Pick<Project, 'id' | 'projectCode' | 'name'>;
  expertProfile?: { id: string; person: { name: string } };
}

export interface BankTransaction {
  id: string;
  transactionNo?: string;
  bankAccountId: string;
  transactionAt: string;
  counterpartyName: string;
  direction: 'IN' | 'OUT';
  amount: string;
  nature: string;
  settlementApplicable: boolean;
  matchStatus: string;
  sourceType: string;
  bankAccount: { accountName: string; accountNumberMasked: string };
  allocations: BankAllocation[];
}

export interface Invoice {
  id: string;
  invoiceCode?: string;
  invoiceNumber: string;
  projectId?: string;
  issuedOn: string;
  invoiceType: string;
  invoicePlatform: string;
  buyerName: string;
  amountExcludingTax: string;
  taxRate: string;
  taxAmount: string;
  totalAmount: string;
  kind: string;
  status: string;
  project: Pick<Project, 'id' | 'projectCode' | 'name'>;
}

export interface Expert {
  id: string;
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
  formOwner: User;
  reviewer?: User;
}

export interface Committee {
  id: string;
  committeeCode: string;
  name: string;
  establishedOn: string;
  ownerUserId?: string;
  status?: string;
  owner: User;
  _count?: { memberships: number };
}

export interface MemberDue {
  id: string;
  dueCode: string;
  periodLabel?: string;
  amountDue: string;
  amountPaid?: string;
  dueOn?: string;
  status: string;
}

export interface Membership {
  id: string;
  memberName: string;
  memberType: string;
  committeeId?: string;
  pmUserId?: string;
  joinedOn?: string;
  status: string;
  committee: Committee;
  pm: User;
  dues: MemberDue[];
}
