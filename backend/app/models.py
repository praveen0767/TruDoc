from __future__ import annotations

import hashlib
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    PURCHASE_ORDER = "purchase_order"
    INVOICE = "invoice"
    UNKNOWN = "unknown"


class DocumentQualityStatus(str, Enum):
    GOOD = "GOOD"
    DEGRADED = "DEGRADED"
    POOR = "POOR"


class FieldStatus(str, Enum):
    VALID = "VALID"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    INVALID = "INVALID"
    UNEXTRACTED = "UNEXTRACTED"


class TamperStatus(str, Enum):
    CLEAR = "CLEAR"
    SUSPICIOUS = "SUSPICIOUS"
    UNKNOWN = "UNKNOWN"


class DuplicateStatus(str, Enum):
    CLEAR = "CLEAR"
    EXACT = "EXACT_DUPLICATE"
    NEAR = "NEAR_DUPLICATE"


class ReconciliationStatus(str, Enum):
    MATCH = "MATCH"
    MISMATCH = "MISMATCH"
    MISSING = "MISSING"
    AMBIGUOUS = "AMBIGUOUS"


class RiskLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class IntegrityStatus(str, Enum):
    CLEAR = "CLEAR"
    CHANGED = "CHANGED"
    UNKNOWN = "UNKNOWN"


class QualitySignal(BaseModel):
    blur: float = 0.0
    contrast: float = 0.0
    resolution: int = 0
    skew: float = 0.0
    readability: float = 0.0


class DocumentQuality(BaseModel):
    signals: QualitySignal = Field(default_factory=QualitySignal)
    status: DocumentQualityStatus = DocumentQualityStatus.GOOD
    score: float = 1.0


class OCRToken(BaseModel):
    text: str
    confidence: float = 1.0
    bbox: List[int]
    page: int


class OCRResult(BaseModel):
    page_number: int
    tokens: List[OCRToken] = []
    raw_text: str = ""
    mean_confidence: float = 0.0


class EvidenceSource(BaseModel):
    document_id: str
    page: int
    bbox: List[int]
    text: str
    ocr_confidence: float = 0.0


class FieldSignal(BaseModel):
    ocr: float = 0.0
    format_valid: bool = False
    business_rule_valid: bool = False
    cross_document_match: bool = False   # starts False until reconciliation confirms match
    quality_penalty: float = 0.0
    ambiguity_penalty: float = 0.0


class FieldResult(BaseModel):
    name: str
    value: str = ""
    normalized_value: str = ""
    raw_text: str = ""
    reliability: float = 0.0
    signals: FieldSignal = Field(default_factory=FieldSignal)
    status: FieldStatus = FieldStatus.UNEXTRACTED
    evidence: List[EvidenceSource] = []
    reasons: List[str] = []
    bbox: List[int] = Field(default_factory=lambda: [0, 0, 0, 0])
    page: int = 1
    ocr_confidence: float = 0.0
    extraction_method: str = "rule_based"
    extracted_value: str = ""   # the value read straight from OCR/evidence (pre-correction)


def compute_reliability(signal: FieldSignal, quality_score: float = 1.0) -> float:
    """Deterministic documented reliability. Never fabricated."""
    r = signal.ocr * 0.40
    r += (1.0 if signal.format_valid else 0.0) * 0.20
    r += (1.0 if signal.business_rule_valid else 0.0) * 0.15
    r += (1.0 if signal.cross_document_match else 0.0) * 0.15
    r += quality_score * 0.10
    r -= signal.ambiguity_penalty * 0.10
    return max(0.0, min(1.0, round(r, 3)))


class TableCell(BaseModel):
    value: str = ""
    raw_text: str = ""
    confidence: float = 0.0
    bbox: List[int] = Field(default_factory=lambda: [0, 0, 0, 0])
    derived: bool = False


class TableRow(BaseModel):
    item: Optional[TableCell] = None
    description: Optional[TableCell] = None
    quantity: Optional[TableCell] = None
    unit_price: Optional[TableCell] = None
    line_total: Optional[TableCell] = None
    arithmetic_valid: bool = True
    arithmetic_note: str = ""


class TableResult(BaseModel):
    page: int = 1
    rows: List[TableRow] = []
    columns: List[str] = ["item", "description", "quantity", "unit_price", "line_total"]
    evidence_text: str = ""


class TamperSignal(BaseModel):
    signal: str
    severity: str
    evidence: str
    explanation: str


class TamperResult(BaseModel):
    status: TamperStatus = TamperStatus.UNKNOWN
    signals: List[TamperSignal] = []


class DuplicateResult(BaseModel):
    status: DuplicateStatus = DuplicateStatus.CLEAR
    matched_document_id: Optional[str] = None
    similarity: float = 0.0
    evidence: str = ""


class ReconciliationEntry(BaseModel):
    field: str
    doc_a_value: str
    doc_b_value: str
    status: ReconciliationStatus
    difference: str = ""
    severity: str = "LOW"
    reason: str = ""


class ReconciliationResult(BaseModel):
    entries: List[ReconciliationEntry] = []
    overall_status: ReconciliationStatus = ReconciliationStatus.MATCH
    requires_review: bool = False


class DocumentProvenance(BaseModel):
    document_id: str
    content_hash: str
    document_type: DocumentType = DocumentType.UNKNOWN
    classification_method: str = "unclassified"
    schema_version: str = "2.0"
    pipeline_version: str = "2.0"
    ocr_engine: str = "pytesseract"
    ocr_engine_version: str = "unknown"
    processed_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    mime_type: Optional[str] = None
    page_count: int = 0

    @staticmethod
    def compute_hash(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()


class ToolDefinition(BaseModel):
    name: str
    description: str
    risk_level: RiskLevel
    required_permissions: List[str] = []
    idempotent: bool = True
    input_schema: Dict[str, Any] = {}


class ToolRequest(BaseModel):
    tool_name: str
    document_id: str
    payload: Dict[str, Any] = {}
    requester: str = "agent"


class ToolResult(BaseModel):
    tool_name: str
    document_id: str
    success: bool
    output: Any = None
    error: Optional[str] = None


class DocumentResult(BaseModel):
    provenance: DocumentProvenance
    quality: DocumentQuality = Field(default_factory=DocumentQuality)
    ocr_results: List[OCRResult] = []
    fields: Dict[str, FieldResult] = {}
    table: Optional[TableResult] = None
    tamper: TamperResult = Field(default_factory=TamperResult)
    duplicate: DuplicateResult = Field(default_factory=DuplicateResult)
    reconciliation: Optional[ReconciliationResult] = None
    review_required: bool = False
    overall_status: str = "PENDING"
    integrity_status: IntegrityStatus = IntegrityStatus.UNKNOWN
    trace: List[Dict[str, Any]] = []

    def to_json(self) -> str:
        return self.model_dump_json(indent=2)


def add_trace(
    result: DocumentResult,
    stage: str,
    status: str,
    details: Optional[Any] = None,
    component: str = "",
) -> None:
    result.trace.append({
        "timestamp": datetime.utcnow().isoformat(),
        "stage": stage,
        "component": component or stage,
        "status": status,
        "details": details,
    })
