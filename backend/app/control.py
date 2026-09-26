"""control.py — thin in-process agentic/control-plane layer around the TruDoc pipeline.

Layers: Planner, Retriever, Reasoner, MCPToolRegistry, PolicyEngine, Executor, Validator.
All in-process. Costly infrastructure (k8s/Temporal/OPA server) is intentionally absent.
LLM providers are optional advisors only — they can propose candidate values, but may never
override evidence, policy, or validation.
"""
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from . import pipeline as P
from .models import (
    DocumentResult, DocumentType, FieldStatus, ToolDefinition,
    ToolRequest, ToolResult,
)


# ---------------------------------------------------------------------------
# Optiona provider hook (deterministic by default; LLM may propose only)
# ---------------------------------------------------------------------------
class SuggestionProvider:
    name = "none"
    version = "0"

    def propose(self, doc: DocumentResult, field: str) -> Optional[str]:
        return None


class DeterministicSuggestionProvider(SuggestionProvider):
    name = "deterministic"
    version = "1.0"


def _get_suggestion_provider() -> SuggestionProvider:
    return DeterministicSuggestionProvider()


# ---------------------------------------------------------------------------
# Planner
# ---------------------------------------------------------------------------
@dataclass
class Plan:
    id: str
    document_id: str
    steps: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)

    def add(self, tool: str, note: str) -> "Plan":
        self.steps.append({"tool": tool, "note": note})
        return self


def _classify_plan(doc: DocumentResult) -> Plan:
    plan = Plan(id="pipeline-v4", document_id=doc.provenance.document_id)
    dt = doc.provenance.document_type
    plan.add("document.ingest", "hash + provenance")
    plan.add("document.assess_quality", "image quality gate")
    plan.add("document.ocr", "real OCR engine")
    plan.add("document.classify", "deterministic type signals")
    plan.add("document.extract_fields", "schema extraction")
    plan.add("document.extract_table", "line-item table")
    plan.add("document.validate", "arithmetic rules")
    plan.add("document.detect_tamper", "tamper signals")
    plan.add("document.detect_duplicate", "duplicate signals")
    plan.add("document.reconcile", "cross-document match (when pair given)")
    if dt == DocumentType.UNKNOWN:
        plan.notes.append("document type unknown — mandatory gate blocks VERIFIED")
    return plan


class Planner:
    def plan(self, doc: DocumentResult) -> Plan:
        return _classify_plan(doc)


# ---------------------------------------------------------------------------
# Retriever
# ---------------------------------------------------------------------------
@dataclass
class EvidenceBundle:
    document_id: str
    ocr_mean_conf: float = 0.0
    token_count: int = 0
    review_fields: List[str] = field(default_factory=list)
    infra: Dict[str, Any] = field(default_factory=dict)
    quality_score: float = 0.0
    notes: List[str] = field(default_factory=list)


class Retriever:
    def retrieve(self, doc: DocumentResult) -> EvidenceBundle:
        ocr = doc.ocr_results[0] if doc.ocr_results else None
        bundle = EvidenceBundle(
            document_id=doc.provenance.document_id,
            ocr_mean_conf=ocr.mean_confidence if ocr else 0.0,
            token_count=sum(len(r.tokens) for r in doc.ocr_results),
            review_fields=[k for k, f in doc.fields.items() if f.status == FieldStatus.REVIEW_REQUIRED],
            quality_score=doc.quality.score,
        )
        try:
            bundle.infra = P.infra_status()
        except Exception:
            bundle.infra = {"status": "DEGRADED"}
        return bundle


# ---------------------------------------------------------------------------
# Reasoner (recommends; never overrides)
# ---------------------------------------------------------------------------
@dataclass
class Suggestion:
    field: str
    candidate: Optional[str]
    provider: str
    confidence: float
    basis: str

    def as_value(self) -> Optional[str]:
        return self.candidate


class Reasoner:
    def __init__(self, provider: Optional[SuggestionProvider] = None):
        self.provider = provider or _get_suggestion_provider()

    def propose(self, doc: DocumentResult, evidence: EvidenceBundle) -> List[Suggestion]:
        out: List[Suggestion] = []
        for name, fld in doc.fields.items():
            if fld.status == FieldStatus.REVIEW_REQUIRED:
                candidate = self.provider.propose(doc, name)
                out.append(Suggestion(field=name, candidate=candidate,
                                      provider=self.provider.name, confidence=0.0,
                                      basis="optional provider suggestion — requires policy+validation"))
        return out


# ---------------------------------------------------------------------------
# MCPToolRegistry
# ---------------------------------------------------------------------------
class MCPToolRegistry:
    def list_tools(self) -> List[ToolDefinition]:
        return list(P._REGISTRY.values())

    def get(self, name: str) -> Optional[ToolDefinition]:
        return P._REGISTRY.get(name)


# ---------------------------------------------------------------------------
# PolicyEngine
# ---------------------------------------------------------------------------
class PolicyEngine:
    def validate_input(self, defn: ToolDefinition, payload: Dict[str, Any]) -> Optional[str]:
        return P._validate_input(defn, payload)

    def authorize(self, req: ToolRequest, defn: ToolDefinition, doc: DocumentResult) -> Tuple[bool, str]:
        return P._policy_verdict(req, defn, doc)


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------
class Executor:
    def execute(self, req: ToolRequest, doc: DocumentResult, **kwargs) -> ToolResult:
        return P.execute_tool_control(req, doc, **kwargs)


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------
class Validator:
    def run(self, doc: DocumentResult) -> str:
        P.validate_fields(doc)
        P.finalize(doc)
        return doc.overall_status


# ---------------------------------------------------------------------------
# Orchestration entry (kept in-process)
# ---------------------------------------------------------------------------
class AgentController:
    def __init__(self):
        self.planner = Planner()
        self.retriever = Retriever()
        self.reasoner = Reasoner()
        self.registry = MCPToolRegistry()
        self.policy = PolicyEngine()
        self.executor = Executor()
        self.validator = Validator()

    def run_mcp_tool(self, doc: DocumentResult, tool_name: str, payload: Dict[str, Any],
                     requester: str = "agent", **kwargs) -> ToolResult:
        req = ToolRequest(tool_name=tool_name, document_id=doc.provenance.document_id,
                          payload=payload, requester=requester)
        return self.executor.execute(req, doc, **kwargs)

    def propose_corrections(self, doc: DocumentResult, evidence: EvidenceBundle) -> List[Suggestion]:
        suggestions = self.reasoner.propose(doc, evidence)
        P.add_trace(doc, "review", "REASONER_PROPOSALS",
                    {"count": len([s for s in suggestions if s.candidate]),
                     "provider": self.reasoner.provider.name}, component="Reasoner")
        return suggestions