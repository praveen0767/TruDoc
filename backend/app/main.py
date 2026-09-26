import uuid
from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, Field
import os
from datetime import datetime
import json

def generate_id() -> str:
    return str(uuid.uuid4())

# Constants (control-plane demo vocabulary — preserved from prior state)
RESTART_SERVICE = 'restart_service'
NOOP = 'noop'
LOCAL_LOG = 'local_log'
SERVICE_NAME = 'service_name'
SVC = 'svc'
RESTARTED = 'restarted'
ALREADY_EXECUTED = 'already_executed'
UNKNOWN_TOOL = 'unknown tool'
HIGH = 'HIGH'
LOW = 'LOW'
DENY = 'DENY'
ALLOW = 'ALLOW'

class RunState(str, Enum):
    RECEIVED = 'RECEIVED'
    PLANNING = 'PLANNING'
    RETRIEVING = 'RETRIEVING'
    REASONING = 'REASONING'
    POLICY_CHECK = 'POLICY_CHECK'
    EXECUTING = 'EXECUTING'
    VALIDATING = 'VALIDATING'
    RESOLVED = 'RESOLVED'
    REJECTED = 'REJECTED'
    FAILED = 'FAILED'
    ESCALATED = 'ESCALATED'

class TraceEvent(BaseModel):
    timestamp: str
    component: str
    state: RunState
    status: str
    details: Optional[Any] = None

class Run(BaseModel):
    run_id: str = Field(default_factory=generate_id)
    state: RunState = RunState.RECEIVED
    trace: List[TraceEvent] = Field(default_factory=list)
    plan: Optional[Any] = None
    evidence: Optional[Any] = None
    decision: Optional[Any] = None
    tool_request: Optional[Any] = None
    tool_result: Optional[Any] = None
    validation: Optional[Any] = None

class Plan(BaseModel):
    description: str
    action: str
    requires_approval: bool = False

class Evidence(BaseModel):
    evidence_id: str = Field(default_factory=generate_id)
    source: str
    content: str

class DecisionResult(BaseModel):
    decision: Any = None
    provider: str
    provider_version: str
    latency_ms: Optional[float] = None
    fallback_used: bool = False

import time
from abc import ABC, abstractmethod

class DecisionProvider(ABC):
    @abstractmethod
    def decide(self, run: Run, plan: Plan, evidence: List[Evidence]) -> DecisionResult:
        pass

class DeterministicDecisionProvider(DecisionProvider):
    def __init__(self):
        self.provider_name = 'deterministic'
        self.provider_version = '1.0'

    def decide(self, run: Run, plan: Plan, evidence: List[Evidence]) -> DecisionResult:
        start = time.time()
        confidence = 0.95 if plan.action != NOOP else 0.5
        risk = HIGH if plan.action == RESTART_SERVICE else LOW
        decision = {
            "action": plan.action, "confidence": confidence, "evidence": [e.content for e in evidence],
            "risk": risk, "provider": self.provider_name, "provider_version": self.provider_version,
        }
        result = DecisionResult(decision=decision, provider=self.provider_name,
                                provider_version=self.provider_version,
                                latency_ms=(time.time() - start) * 1000, fallback_used=False)
        run.decision = decision
        return result

def get_decision_provider() -> DecisionProvider:
    provider_type = os.getenv('DECISION_PROVIDER', 'deterministic').lower()
    return DeterministicDecisionProvider()

class ToolRequest(BaseModel):
    request_id: str = Field(default_factory=generate_id)
    tool_name: str
    parameters: dict
    idempotency_key: str = Field(default_factory=generate_id)

class ToolResult(BaseModel):
    request_id: str
    success: bool
    output: Optional[Any] = None
    error: Optional[str] = None

IDEMPOTENCY_STORE = set()

def planner(run: Run, request_text: str) -> Plan:
    action = RESTART_SERVICE if 'restart' in request_text.lower() else NOOP
    plan = Plan(description="Generated plan based on request", action=action)
    run.plan = plan
    return plan

def retriever(run: Run, plan: Plan) -> List[Evidence]:
    ev = Evidence(source=LOCAL_LOG, content='service status: stopped')
    run.evidence = [ev]
    return [ev]

def reasoner(run: Run, plan: Plan, evidence: List[Evidence]) -> dict:
    confidence = 0.95 if plan.action != NOOP else 0.5
    risk = HIGH if plan.action == RESTART_SERVICE else LOW
    decision = {"action": plan.action, "confidence": confidence,
                "evidence": [e.content for e in evidence], "risk": risk}
    run.decision = decision
    return decision

def policy_engine(decision: dict) -> str:
    return DENY if decision.get("risk") == HIGH else ALLOW

def tool_gateway(request: ToolRequest) -> ToolResult:
    if request.idempotency_key in IDEMPOTENCY_STORE:
        return ToolResult(request_id=request.request_id, success=True, output=ALREADY_EXECUTED)
    IDEMPOTENCY_STORE.add(request.idempotency_key)
    if request.tool_name == RESTART_SERVICE:
        target = f'd:/velloe/tmp/{request.parameters.get(SERVICE_NAME, SVC)}_restarted.txt'
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'w') as f:
            f.write(RESTARTED)
        return ToolResult(request_id=request.request_id, success=True, output=target)
    return ToolResult(request_id=request.request_id, success=False, error=UNKNOWN_TOOL)

def executor(run: Run, decision: dict) -> ToolResult:
    req = ToolRequest(tool_name=decision["action"], parameters={SERVICE_NAME: 'demo'})
    run.tool_request = req
    result = tool_gateway(req)
    run.tool_result = result
    return result

def validator(run: Run) -> str:
    if getattr(run.tool_result, 'success', False):
        run.state = RunState.RESOLVED
        return 'VALID'
    else:
        run.state = RunState.FAILED
        return 'INVALID'

def run_workflow(request_text: str):
    run = Run()
    run.state = RunState.PLANNING
    plan = planner(run, request_text)
    run.state = RunState.RETRIEVING
    evidence = retriever(run, plan)
    run.state = RunState.REASONING
    decision = reasoner(run, plan, evidence)
    run.state = RunState.POLICY_CHECK
    verdict = policy_engine(decision)
    if verdict == DENY:
        run.state = RunState.REJECTED
        print('Policy denied execution')
        return run
    run.state = RunState.EXECUTING
    executor(run, decision)
    run.state = RunState.VALIDATING
    validation = validator(run)
    return run


# ===========================================================================
# TruDoc acceptance demo — PO + Invoice + degraded document
# ===========================================================================
from pathlib import Path
from backend.app import pipeline as P
from backend.app.control import AgentController
from backend.app.models import (
    DocumentResult, FieldStatus,
)

BASE = Path("D:/velloe")


def _fields_report(doc: DocumentResult) -> List[str]:
    lines = []
    for name, fld in doc.fields.items():
        if fld.status == FieldStatus.UNEXTRACTED and not fld.value:
            continue
        lines.append(
            f"  {name}: value={fld.value!r} raw={fld.raw_text[:40]!r} "
            f"bbox={fld.bbox} page={fld.page} ocr_conf={fld.ocr_confidence} "
            f"reliability={fld.reliability} status={fld.status}"
            + (f" | { ' | '.join(fld.reasons[:2]) }" if fld.reasons else "")
        )
    return lines


def _trace_stages(doc: DocumentResult) -> List[str]:
    return [f"{t.get('stage')}:{t.get('status')}" for t in doc.trace]


def run_demo() -> None:
    print("=" * 78)
    print("TRUDOC DEMO RUN — real OCR + deterministic validation (no hard-coded success)")
    print("=" * 78)
    print(f"Infrastructure: {P.infra_status()}")
    ctrl = AgentController()

    po = P.process_document(BASE / "samples/purchase_order.png", filename="purchase_order.png")
    print(f"OCR engine active: {P.OCR_ENGINE} {P.OCR_ENGINE_VERSION}")
    inv = P.process_document(BASE / "samples/invoice.png", filename="invoice.png")
    degraded = P.process_document(BASE / ".tmp_uploads/test.jped.jpeg", filename="test.jped.jpeg")
    for d in (po, inv, degraded):
        P.save_result(d)

    print("\n--- TRACE STAGES (document 1 PO) ---")
    print("  " + "\n  ".join(_trace_stages(po)))
    print("\n--- TRACE STAGES (document 2 INVOICE) ---")
    print("  " + "\n  ".join(_trace_stages(inv)))

    print(f"\n--- PO RESULT ({po.provenance.document_type}) quality={po.quality.status} score={po.quality.score} ---")
    print("\n".join(_fields_report(po)))
    if po.table:
        print("  TABLE ROWS:", len(po.table.rows))
        for r in po.table.rows:
            print(f"    [{r.item.value}] {r.description.value!r} qty={r.quantity.value} unit={r.unit_price.value} total={r.line_total.value} arith_ok={r.arithmetic_valid} {r.arithmetic_note}")

    print(f"\n--- INVOICE RESULT ({inv.provenance.document_type}) quality={inv.quality.status} score={inv.quality.score} ---")
    print("\n".join(_fields_report(inv)))
    if inv.table:
        print("  TABLE ROWS:", len(inv.table.rows))
        for r in inv.table.rows:
            print(f"    [{r.item.value}] {r.description.value!r} qty={r.quantity.value} unit={r.unit_price.value} total={r.line_total.value} arith_ok={r.arithmetic_valid} {r.arithmetic_note}")

    # Primary reconciliation: PO ↔ Invoice
    print("\n--- RECONCILIATION: PO ↔ Invoice (primary pair) ---")
    res = P.reconcile_documents(po, inv)
    for e in res.entries:
        print(f"  {e.field}: {e.doc_a_value} vs {e.doc_b_value} -> {e.status} [{e.severity}] {e.reason}")
    print(f"  OVERALL: {res.overall_status} requires_review={res.requires_review}")

    # Conflict reconciliation: PO ↔ degraded document (real second source)
    print("\n--- RECONCILIATION: PO ↔ degraded doc (same PO-number claim) ---")
    res2 = P.reconcile_documents(po, degraded)
    for e in res2.entries:
        print(f"  {e.field}: {e.doc_a_value} vs {e.doc_b_value} -> {e.status} [{e.severity}] {e.reason}")
    print(f"  OVERALL: {res2.overall_status} requires_review={res2.requires_review}")
    print("  PO status after recon:", po.overall_status)
    print("  Degraded status after recon:", degraded.overall_status)

    # HITL review + correction on the degraded document's ambiguous buyer field
    print("\n--- HITL REVIEW (degraded doc) ---")
    buyer = degraded.fields.get("buyer_name")
    print(f"  UNCERTAIN FIELD: buyer_name value={buyer.value if buyer else None!r} "
          f"reliability={buyer.reliability if buyer else 0} status={buyer.status if buyer else None}")
    if buyer and buyer.evidence:
        print(f"  EVIDENCE: text={buyer.evidence[0].text[:60]!r} bbox={buyer.evidence[0].bbox} "
              f"ocr_conf={buyer.evidence[0].ocr_confidence}")
    corrected = "XYZ Industries Pvt Ltd"
    print(f"  CORRECTION via MCP tool document.apply_correction (requester=human_reviewer): {corrected!r}")
    cres = ctrl.run_mcp_tool(degraded, "document.apply_correction",
                             {"field": "buyer_name", "value": corrected}, requester="human_reviewer")
    print(f"  correction result success={cres.success} error={cres.error}")
    print("  REVALIDATE after correction (document.revalidate)")
    rv = ctrl.run_mcp_tool(degraded, "document.revalidate", {}, requester="agent")
    print(f"  revalidate -> review_required={degraded.review_required} ({rv.output})")
    ctrl.run_mcp_tool(degraded, "document.finalize", {}, requester="agent")

    print("\n--- FINAL BACKEND STATUS ---")
    for label, d in (("PO", po), ("Invoice", inv), ("Degraded", degraded)):
        print(f"  {label}: {d.provenance.document_type} overall_status={d.overall_status} "
              f"review_required={d.review_required} tamper={d.tamper.status} dup={d.duplicate.status}")
    print(f"  Rule: VERIFIED only after backend validation (& reconciliation, when conflicted → REVIEW_REQUIRED)")

    print("\n--- EXACT RUN COMMAND ---")
    print("  py -3.12 -m backend.app.main --demo")
    print("  streamlit run backend/app/ui.py")


if __name__ == "__main__":
    import sys
    args = sys.argv[1:]
    if "--demo" in args or "-d" in args:
        run_demo()
    else:
        request = args[0] if args else "restart my service"
        run_workflow(request)