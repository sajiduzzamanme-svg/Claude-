import type { FlatStatus } from "@/components/building";

export type Money = string;

export type ProjectFin = {
  project: { id: number; code: string; name: string; location: string; status: string; sales_open: boolean; storeys: number; expected_handover: string | null; land_area_katha: string };
  flats: { total: number; available: number; hold: number; booked: number; handed_over: number; sold: number; total_sqft: string; sold_sqft: string; unsold_value: Money };
  sales: { sold_value: Money; sold_land_value: Money; sold_building_value: Money; collected: Money; receivable: Money; overdue: Money; due_next_30_days: Money; not_yet_due: Money };
  land?: { parcels: number; agreed: Money; paid: Money; remaining: Money; bayna_remaining: Money; next_deadline: string | null };
  cost?: { estimate_version: number | null; estimate_status: string | null; estimate_land: Money; estimate_building: Money; estimate_total: Money; actual_land: Money; actual_building: Money; actual_total: Money; land_committed: Money; land_basis: Money; building_basis: Money; cost_basis: Money; overrun: Money };
  profit?: { land: Money; building: Money; booked: Money; realised: Money; margin_percent: string; projected_revenue: Money; projected: Money; projected_margin_percent: string };
  cash?: { net: Money; vendor_payable: Money; retention_held: Money };
  progress: { work: string; cost: string; collection: string; sales: string };
};

export type Alert = { kind: "land_deadline" | "overdue" | "bills_due"; severity: "danger" | "warning" | "info"; project?: string; title?: string; amount: Money; date?: string; days?: number; shortfall?: Money; count?: number; link: string };
export type Upcoming = { booking: number; number: string; customer: string; phone: string; project: string; flat: string; title: string; due_date: string; amount: Money; days: number };
export type CashAccount = { id: number; code: string; name: string; name_bn: string; balance: Money };

export type Dashboard = {
  as_of: string; restricted: boolean;
  totals: Record<string, Money | number>;
  cash_accounts: CashAccount[];
  projects: ProjectFin[];
  trend: { month: string; inflow: Money; outflow?: Money }[];
  upcoming: Upcoming[];
  alerts: Alert[];
};

export type Project = {
  id: number; code: string; name: string; location: string; address: string; description: string; status: "PLANNING" | "ACTIVE" | "COMPLETED" | "CLOSED";
  sales_open: boolean; sales_opened_at: string | null; land_area_katha: string; storeys: number; start_date: string | null; expected_handover: string | null;
  render_url: string; flats_total: number; flats_sold: number; documents_pending: number; progress: string;
};

export type Flat = {
  id: number; project: number; project_code: string; code: string; floor: number; unit: string; flat_type: string; bedrooms: number; size_sqft: string;
  land_share_katha: string; facing: string; land_price: Money; construction_price: Money; other_charges: Money; list_price: Money; status: FlatStatus;
  booking: { id: number; number: string; customer: string; customer_id: number } | null;
};

export type Doc = { id: number; project: number; doc_type: string; title: string; is_required: boolean; status: "PENDING" | "RECEIVED"; reference_no: string; received_date: string | null; file: string | null; notes: string };
export type CostHead = { id: number; code: string; name: string; name_bn: string; category: CostCategory; system_key: string | null; is_active: boolean };
export type CostCategory = "LAND" | "DESIGN" | "CONSTRUCTION" | "MARKETING" | "OVERHEAD" | "CONTINGENCY";
export type EstimateLine = { id: number; cost_head: number; cost_head_code: string; cost_head_name: string; cost_head_name_bn: string; category: CostCategory; description: string; quantity: string; unit: string; rate: Money; amount: Money };
export type Estimate = { id: number; project: number; project_code: string; version: number; title: string; status: "DRAFT" | "APPROVED" | "SUPERSEDED"; notes: string; approved_by_name: string | null; approved_at: string | null; total: Money; lines: EstimateLine[] };
export type Milestone = { id: number; project: number; sequence: number; name: string; weight: string; planned_date: string | null; completed_date: string | null; progress: number; notes: string };
export type EvaRow = { cost_head: number; code: string; name: string; name_bn: string; category: CostCategory; estimate: Money; actual: Money; variance: Money; used_percent: string | null; over_budget: boolean };
export type Eva = { project: number; estimate: { id: number; version: number; status: string; title: string } | null; rows: EvaRow[]; categories: { category: CostCategory; estimate: Money; actual: Money; variance: Money; over_budget: boolean }[]; totals: { estimate: Money; actual: Money; variance: Money; used_percent: string } };

export type LandPayment = { id: number; number: string; parcel: number; parcel_title: string; project_code: string; date: string; amount: Money; paid_from: number; paid_from_name: string; reference: string; note: string; status: "POSTED" | "VOIDED"; void_reason: string; journal_number: string };
export type LandParcel = {
  id: number; project: number; project_code: string; project_name: string; title: string; mouza: string; khatian_no: string; dag_no: string; area_katha: string;
  owner_name: string; owner_phone: string; agreed_price: Money; stage: "NEGOTIATION" | "BAYNA" | "REGISTERED" | "MUTATED"; bayna_date: string | null; bayna_deed_no: string;
  registration_deadline: string | null; registration_date: string | null; deed_no: string; mutation_date: string | null; notes: string; paid: Money; remaining: Money; payments: LandPayment[];
};

export type Customer = { id: number; name: string; phone: string; email: string; nid: string; father_name: string; address: string; occupation: string; nominee_name: string; nominee_relation: string; notes: string; bookings_count: number; contract_value: Money; paid: Money; created_at: string };
export type LeadStage = "NEW" | "CONTACTED" | "SITE_VISIT" | "NEGOTIATION" | "WON" | "LOST";
export type Lead = { id: number; name: string; phone: string; source: string; project: number | null; project_code: string | null; stage: LeadStage; budget: Money; assigned_to: number | null; assigned_to_name: string | null; next_follow_up: string | null; customer: number | null; notes: string; created_at: string };

export type Installment = { id: number; sequence: number; kind: string; title: string; due_date: string; amount: Money; paid_amount: Money; outstanding: Money; state: "PAID" | "PARTIAL" | "DUE" | "OVERDUE" };
export type Receipt = {
  id: number; number: string; booking: number; booking_number: string; customer_name: string; customer_phone: string; project_code: string; project_name: string; flat_code: string;
  date: string; amount: Money; method: "CASH" | "BANK" | "CHEQUE" | "MOBILE"; deposit_account: number; deposit_account_name: string; reference: string; bank_name: string; note: string;
  status: "POSTED" | "VOIDED"; void_reason: string; received_by: string; journal_number: string; allocations: { installment: number; title: string; sequence: number; amount: Money }[];
};
export type Cancellation = { id: number; booking: number; booking_number: string; customer_name: string; project_code: string; flat_code: string; date: string; reason: string; paid_total: Money; deduction: Money; refund_amount: Money; refunded_amount: Money; refund_outstanding: Money; refunds: { id: number; number: string; date: string; amount: Money; paid_from: string; reference: string }[] };
export type Booking = {
  id: number; number: string; project: number; project_code: string; project_name: string; flat: number; flat_code: string; flat_size: string; customer: number; customer_name: string; customer_phone: string;
  booking_date: string; land_price: Money; construction_price: Money; other_charges: Money; discount: Money; total_price: Money; revision_amount: Money; contract_value: Money;
  status: "ACTIVE" | "HANDED_OVER" | "CANCELLED"; sales_person: number | null; sales_person_name: string | null; expected_handover: string | null; handover_date: string | null; notes: string;
  paid: Money; outstanding: Money; overdue: Money;
};
export type BookingDetail = Booking & {
  installments: Installment[]; receipts: Receipt[]; cancellation: Cancellation | null;
  transfers: { id: number; date: string; from: string; to: string; fee: Money; note: string }[];
  customer_detail: Customer; flat_detail: { code: string; floor: number; unit: string; flat_type: string; bedrooms: number; size_sqft: string; land_share_katha: string; facing: string };
  cogs_land: Money; cogs_dev: Money; new_receipt_id?: number;
};
export type RevisionLine = { id?: number; booking: number; booking_number: string; customer_name: string; flat_code: string; flat_size: string; amount: Money };
export type PriceRevision = { id: number; project: number; project_code: string; title: string; reason: string; meeting_date: string; resolution_ref: string; due_date: string; status: "DRAFT" | "APPROVED"; approved_by_name: string | null; approved_at: string | null; total: Money; lines: RevisionLine[] };

export type Vendor = { id: number; name: string; kind: "SUPPLIER" | "CONTRACTOR" | "LABOUR" | "CONSULTANT"; phone: string; address: string; trade_license: string; notes: string; is_active: boolean; payable: Money; retention: Money; billed: Money };
export type WorkPackage = { id: number; project: number; project_code: string; name: string; cost_head: number; cost_head_name: string; cost_head_name_bn: string; execution: "OWN" | "CONTRACTOR"; vendor: number | null; vendor_name: string | null; budget: Money; retention_percent: string; start_date: string | null; end_date: string | null; progress: number; status: "PLANNED" | "IN_PROGRESS" | "DONE"; notes: string; billed: Money; paid: Money };
export type PurchaseOrder = { id: number; number: string; project: number; project_code: string; vendor: number; vendor_name: string; work_package: number | null; work_package_name: string | null; date: string; expected_date: string | null; status: "DRAFT" | "APPROVED" | "RECEIVED" | "CANCELLED"; notes: string; total: Money; bill_number: string | null; lines: { id: number; cost_head: number; cost_head_name: string; item: string; unit: string; quantity: string; rate: Money; amount: Money }[] };
export type VendorPayment = { id: number; number: string; bill: number; bill_number: string; vendor_name: string; project_code: string; kind: "BILL" | "RETENTION"; date: string; amount: Money; paid_from: number; paid_from_name: string; reference: string; note: string; status: "POSTED" | "VOIDED"; void_reason: string; journal_number: string };
export type VendorBill = {
  id: number; number: string; project: number; project_code: string; vendor: number; vendor_name: string; work_package: number | null; work_package_name: string | null; po_number: string | null;
  kind: "MATERIAL" | "CONTRACTOR" | "LABOUR" | "SERVICE"; bill_date: string; due_date: string | null; reference: string; gross_amount: Money; retention_amount: Money; net_payable: Money; paid_amount: Money;
  retention_released: Money; outstanding: Money; retention_outstanding: Money; status: "POSTED" | "VOIDED"; void_reason: string; notes: string; journal_number: string;
  lines: { id: number; cost_head: number; cost_head_code: string; cost_head_name: string; description: string; unit: string; quantity: string; rate: Money; amount: Money }[]; payments: VendorPayment[];
};
export type Expense = { id: number; number: string; project: number | null; project_code: string | null; cost_head: number; cost_head_name: string; cost_head_name_bn: string; category: CostCategory; date: string; amount: Money; paid_from: number; paid_from_name: string; payee: string; description: string; status: "POSTED" | "VOIDED"; void_reason: string; journal_number: string };

export type Account = { id: number; code: string; name: string; name_bn: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"; is_cash_bank: boolean; is_control: boolean; system_key: string | null; is_active: boolean; balance: Money };
export type JournalLine = { id: number; account: number; account_code: string; account_name: string; account_name_bn: string; project_code: string | null; cost_head_name: string | null; debit: Money; credit: Money; description: string };
export type JournalEntry = { id: number; number: string; date: string; memo: string; project_code: string | null; source_type: string; source_ref: string; reverses_number: string | null; is_reversed: boolean; created_by_name: string; total: Money; lines: JournalLine[] };
export type TrialBalance = { rows: { id: number; code: string; name: string; name_bn: string; type: Account["type"]; debit: Money; credit: Money; balance: Money }[]; total_debit: Money; total_credit: Money; balanced: boolean; summary: { assets: Money; liabilities: Money; equity: Money; income: Money; expenses: Money; net_profit: Money } };
export type Ledger = { account: Account; opening: Money; closing: Money; rows: { id: number; date: string; number: string; memo: string; source_type: string; source_ref: string; project_code: string | null; debit: Money; credit: Money; balance: Money }[] };
export type Integrity = { ok: boolean; checks: { key: string; title: string; title_bn: string; ok: boolean; expected: string; actual: string; detail: string }[] };

export type Receivables = { as_of: string; total: Money; overdue: Money; buckets: { not_due: Money; d1_30: Money; d31_60: Money; d61_90: Money; d90_plus: Money }; rows: { booking: number; number: string; customer: string; customer_id: number; phone: string; project: string; flat: string; not_due: Money; overdue: Money; total: Money; oldest_due: string | null; max_days_overdue: number }[] };
export type Cashflow = { as_of: string; opening_cash: Money; overdue_included: Money; lowest_cash: Money; months: { month: string; inflow: Money; outflow: Money; land: Money; vendors: Money; refunds: Money; net: Money; closing_cash: Money }[]; beyond: { inflow: Money; outflow: Money } };
export type Staff = { id: number; display_name: string; role: string };
export type AuditRow = { id: number; user_name: string; action: string; model: string; object_id: string; summary: string; created_at: string };
