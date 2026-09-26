/**
 * TruDoc Type Contracts
 *
 * These mirror the ACTUAL Python / FastAPI backend models in
 * `backend/app/models.py` (Pydantic v2). Field names are the real Pydantic
 * names — no invented aliases. The backend is the source of truth.
 */

// ---------------------------------------------------------------------------
// Enums (string-valued on the Python side)
// ---------------------------------------------------------------------------
export type DocumentType = 'purchase_order' | 'invoice' | 'unknown';
export type DocumentQualityStatus = 'GOOD' | 'DEGRADED' | 'POOR';
export type FieldStatus = 'VALID' | 'REVIEW_REQUIRED' | 'INVALID' | 'UNEXTRACTED';
export type TamperStatus = 'CLEAR' | 'SUSPICIOUS' | 'UNKNOWN';
export type DuplicateStatus = 'CLEAR' | 'EXACT_DUPLICATE' | 'NEAR_DUPLICATE';
export type ReconciliationStatus = 'MATCH' | 'MISMATCH' | 'MISSING' | 'AMBIGUOUS';
export type ServiceHealthStatus = 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE';
export type OverallStatus = 'VERIFIED' | 'REVIEW_REQUIRED' | 'REJECTED' | 'PENDING';

/**
 * Backend bbox is a 4-int polygon envelope: [x1, y1, x2, y2].
 * Coordinates come from OCR. They are never synthesised in the frontend.
 */
export type BBox = [number, number, number, number];

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------
export interface OCRToken {
  text: string;
  confidence: number;
  bbox: BBox;
  page: number;
}

export interface OCRResult {
  page_number: number;
  tokens: OCRToken[];
  raw_text: string;
  mean_confidence: number;
}

// ---------------------------------------------------------------------------
// Quality
// ---------------------------------------------------------------------------
export interface QualitySignal {
  blur: number;
  contrast: number;
  resolution: number;
  skew: number;
  readability: number;
}

export interface DocumentQuality {
  signals: QualitySignal;
  status: DocumentQualityStatus;
  score: number;
}

// ---------------------------------------------------------------------------
// Evidence / fields
// ---------------------------------------------------------------------------
export interface EvidenceSource {
  document_id: string;
  page: number;
  bbox: BBox;
  text: string;
  ocr_confidence: number;
}

export interface FieldSignal {
  ocr: number;
  format_valid: boolean;
  business_rule_valid: boolean;
  cross_document_match: boolean;
  quality_penalty: number;
  ambiguity_penalty: number;
}

export interface DocumentField {
  name: string;
  value: string;
  normalized_value: string;
  raw_text: string;
  reliability: number;
  signals: FieldSignal;
  status: FieldStatus;
  evidence: EvidenceSource[];
  reasons: string[];
  bbox: BBox;
  page: number;
  ocr_confidence: number;
  extraction_method: string;
  extracted_value: string;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
export interface TableCell {
  value: string;
  raw_text: string;
  confidence: number;
  bbox: BBox;
  derived: boolean;
}

export interface TableRow {
  item: TableCell | null;
  description: TableCell | null;
  quantity: TableCell | null;
  unit_price: TableCell | null;
  line_total: TableCell | null;
  arithmetic_valid: boolean;
  arithmetic_note: string;
}

export interface TableResult {
  page: number;
  rows: TableRow[];
  columns: string[];
  evidence_text: string;
}

// ---------------------------------------------------------------------------
// Integrity
// ---------------------------------------------------------------------------
export interface TamperSignal {
  signal: string;
  severity: string;
  evidence: string;
  explanation: string;
}

export interface TamperResult {
  status: TamperStatus;
  signals: TamperSignal[];
}

export interface DuplicateResult {
  status: DuplicateStatus;
  matched_document_id: string | null;
  similarity: number;
  evidence: string;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------
export interface DocumentProvenance {
  document_id: string;
  content_hash: string;
  document_type: DocumentType;
  classification_method: string;
  schema_version: string;
  pipeline_version: string;
  ocr_engine: string;
  ocr_engine_version: string;
  processed_at: string;
  mime_type: string | null;
  page_count: number;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------
export interface ReconciliationEntry {
  field: string;
  doc_a_value: string;
  doc_b_value: string;
  status: ReconciliationStatus;
  difference: string;
  severity: string;
  reason: string;
}

export interface ReconciliationResult {
  document_id?: string;
  has_reconciliation?: boolean;
  reason?: string;
  entries: ReconciliationEntry[];
  overall_status: ReconciliationStatus | null;
  requires_review: boolean;
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------
export interface TraceEvent {
  timestamp: string;
  stage: string;
  component: string;
  status: string;
  details: unknown;
}

export interface AgentTrace {
  document_id: string;
  run_id?: string;
  processed_at: string;
  stage_count: number;
  stages: TraceEvent[];
}

// ---------------------------------------------------------------------------
// Adapter-level projections (computed server-side from backend state)
// ---------------------------------------------------------------------------
export interface ValidationRuleView {
  rule_id: string;
  rule_name: string;
  state: 'PASS' | 'FAIL' | 'REVIEW' | 'UNEXTRACTED';
  message: string;
  reliability: number;
}

export interface ValidationView {
  overall_status: OverallStatus;
  review_required: boolean;
  rules_checked: number;
  rules_passed: number;
  rules_failed: number;
  rules: ValidationRuleView[];
}

export interface FieldRow {
  name: string;
  value: string;
  status: FieldStatus;
  reliability: number;
  page: number;
  has_evidence: boolean;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
export interface Document {
  provenance: DocumentProvenance;
  quality: DocumentQuality;
  ocr_results: OCRResult[];
  fields: Record<string, DocumentField>;
  table: TableResult | null;
  tamper: TamperResult;
  duplicate: DuplicateResult;
  reconciliation: ReconciliationResult | null;
  review_required: boolean;
  overall_status: OverallStatus;
  trace: TraceEvent[];
  // adapter additions
  case_id: string;
  validation: ValidationView;
  field_rows: FieldRow[];
}

export interface DocumentSummary {
  document_id: string;
  case_id: string;
  filename: string;
  document_type: DocumentType;
  classification_method: string;
  page_count: number;
  ocr_engine: string;
  overall_status: OverallStatus;
  review_required: boolean;
  tamper_status: TamperStatus;
  duplicate_status: DuplicateStatus;
  quality_status: DocumentQualityStatus;
  quality_score: number;
  field_count: number;
  table_rows: number;
  processed_at: string;
}

// ---------------------------------------------------------------------------
// Evidence endpoint
// ---------------------------------------------------------------------------
export interface EvidenceItem {
  field_name: string;
  index: number;
  document_id: string;
  page: number;
  bbox: BBox;
  text: string;
  ocr_confidence: number;
  field_value: string;
  normalized_value: string;
  reliability: number;
  field_status: FieldStatus;
}

export interface EvidenceResponse {
  document_id: string;
  evidence: EvidenceItem[];
  ocr_tokens: OCRToken[];
  ocr_mean_confidence: number;
  ocr_engine: string;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export interface ReviewCase {
  review_id: string;
  document_id: string;
  case_id: string;
  field_name: string;
  current_value: string;
  extracted_value: string;
  reliability: number;
  reasons: string[];
  status: 'PENDING' | 'CORRECTED';
  extraction_method: string;
  page: number;
  bbox: BBox;
  ocr_confidence: number;
  evidence_text: string | null;
  evidence_bbox: BBox | null;
}

export interface CorrectionPayload {
  field_name: string;
  new_value: string;
  reason: string;
  reviewer: string;
}

export interface CorrectionResult extends Document {
  before: {
    overall_status: OverallStatus;
    review_required: boolean;
    field: { value: string | null; status: FieldStatus | null; reliability: number | null };
  };
  correction_applied: CorrectionPayload;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
export interface CaseSummary {
  case_id: string;
  document_count: number;
  document_ids: string[];
  document_types: string[];
  status: string;
  review_required: boolean;
}

export interface CaseDetail {
  case_id: string;
  documents: {
    document_id: string;
    document_type: DocumentType;
    overall_status: OverallStatus;
    review_required: boolean;
    reconciliation: ReconciliationResult | null;
  }[];
}

// ---------------------------------------------------------------------------
// Runs / policies / system
// ---------------------------------------------------------------------------
export interface RunSummary {
  run_id: string;
  document_id: string;
  case_id: string;
  document_type: DocumentType;
  started_at: string;
  overall_status: OverallStatus;
  stage_count: number;
}

export interface PolicyEntry {
  code: string;
  name: string;
  description: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  required_permissions: string[];
  idempotent: boolean;
  input_schema: Record<string, boolean>;
}

export interface ServiceStatus {
  service_name: string;
  category: string;
  status: ServiceHealthStatus;
  details: string;
  version: string;
  latency_ms: number;
}

export interface SystemHealth {
  overall_status: ServiceHealthStatus;
  ocr_engine: string;
  ocr_engine_version: string;
  mcp_tool_count: number;
  document_count: number;
  services: Record<string, ServiceStatus>;
}
