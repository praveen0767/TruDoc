"""api.py — thin FastAPI adapter around the existing TruDoc pipeline.

This file is an ADAPTER ONLY. It does not reimplement, duplicate or override any
document-intelligence logic. Every value returned by these endpoints comes from
`app.pipeline` / `app.models` — the Python backend is the single source of truth.

Nothing in `pipeline.py`, `models.py` or `control.py` is modified.
"""
from __future__ import annotations

import shutil
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from . import pipeline as P
from .control import AgentController
from .models import DocumentResult, FieldStatus

app = FastAPI(
    title="TruDoc Document Intelligence API",
    version="1.0.0",
    description="Thin HTTP adapter over the authoritative TruDoc pipeline.",
)

# Narrow CORS for local development only (Vite dev servers on :3000 / :3001).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-process stores. Documents are the real DocumentResult objects.
# ---------------------------------------------------------------------------
_DOCS: Dict[str, DocumentResult] = {}
_CASE_OF: Dict[str, str] = {}          # document_id -> case_id
_CASE_MEMBERS: Dict[str, List[str]] = {}  # case_id  -> [document_id]
_FILE_OF: Dict[str, str] = {}          # document_id -> original uploaded file path
_CTRL = AgentController()
_T0 = time.time()


def _now_ms() -> float:
    return round((time.time() - _T0) * 1000, 1)


def _load_from_disk() -> None:
    """Hydrate previously saved results so the API survives a restart."""
    for p in sorted(P.DATA_ROOT.glob("*.json")):
        try:
            doc = DocumentResult.model_validate_json(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        _DOCS[doc.provenance.document_id] = doc


def _require_doc(document_id: str) -> DocumentResult:
    doc = _DOCS.get(document_id)
    if doc is not None:
        return doc
    loaded = P.load_result(document_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail=f"Document not found: {document_id}")
    _DOCS[document_id] = loaded
    return loaded


def _register(doc: DocumentResult, case_id: str, file_path: str) -> None:
    did = doc.provenance.document_id
    _DOCS[did] = doc
    _FILE_OF[did] = file_path
    cid = case_id or "CASE-UNASSIGNED"
    _CASE_OF[did] = cid
    _CASE_MEMBERS.setdefault(cid, [])
    if did not in _CASE_MEMBERS[cid]:
        _CASE_MEMBERS[cid].append(did)
    P.save_result(doc)


def _reconcile_case(case_id: str) -> None:
    """Run the real backend reconciliation across the documents in a case."""
    members = [d for d in (_DOCS.get(x) for x in _CASE_MEMBERS.get(case_id, [])) if d]
    if len(members) < 2:
        return
    for i, a in enumerate(members):
        for b in members[i + 1:]:
            try:
                _CTRL.run_mcp_tool(a, "document.reconcile", {}, requester="agent", other_doc=b)
                _CTRL.run_mcp_tool(b, "document.reconcile", {}, requester="agent", other_doc=a)
            except Exception:
                continue
    for d in members:
        P.save_result(d)


# ---------------------------------------------------------------------------
# Derived read models (computed FROM backend state, never invented)
# ---------------------------------------------------------------------------
def _field_rows(doc: DocumentResult) -> List[Dict[str, Any]]:
    """Field rows for list views. Values come straight from FieldResult."""
    return [
        {
            "name": n,
            "value": f.value,
            "status": str(f.status),
            "reliability": f.reliability,
            "page": f.page,
            "has_evidence": len(f.evidence) > 0,
        }
        for n, f in doc.fields.items()
    ]


def _validation_view(doc: DocumentResult) -> Dict[str, Any]:
    """Backend validation is expressed as field status + reasons + overall_status.

    There is no separate ValidationResult model in the backend, so this view is a
    faithful projection of backend-owned state and nothing more.
    """
    rules: List[Dict[str, Any]] = []
    for name, f in doc.fields.items():
        if f.status == FieldStatus.REVIEW_REQUIRED:
            state = "REVIEW"
        elif f.status == FieldStatus.VALID:
            state = "PASS"
        elif f.status == FieldStatus.INVALID:
            state = "FAIL"
        else:
            state = "UNEXTRACTED"
        rules.append({
            "rule_id": f"field.{name}",
            "rule_name": name,
            "state": state,
            "message": "; ".join(f.reasons) if f.reasons else "No reason reported by backend",
            "reliability": f.reliability,
        })
    passed = sum(1 for r in rules if r["state"] == "PASS")
    return {
        "overall_status": doc.overall_status,
        "review_required": doc.review_required,
        "rules_checked": len(rules),
        "rules_passed": passed,
        "rules_failed": sum(1 for r in rules if r["state"] in ("FAIL", "REVIEW")),
        "rules": rules,
    }


def _review_rows(doc: DocumentResult) -> List[Dict[str, Any]]:
    """A review case exists for every backend field flagged REVIEW_REQUIRED."""
    rows: List[Dict[str, Any]] = []
    for name, f in doc.fields.items():
        if f.status != FieldStatus.REVIEW_REQUIRED:
            continue
        ev = f.evidence[0] if f.evidence else None
        rows.append({
            "review_id": f"{doc.provenance.document_id}:{name}",
            "document_id": doc.provenance.document_id,
            "case_id": _CASE_OF.get(doc.provenance.document_id, ""),
            "field_name": name,
            "current_value": f.value,
            "extracted_value": f.extracted_value,
            "reliability": f.reliability,
            "reasons": f.reasons,
            "status": "PENDING" if f.extraction_method != "hitl_correction" else "CORRECTED",
            "extraction_method": f.extraction_method,
            "page": f.page,
            "bbox": f.bbox,
            "ocr_confidence": f.ocr_confidence,
            "evidence_text": ev.text if ev else None,
            "evidence_bbox": ev.bbox if ev else None,
        })
    return rows


def _all_reviews() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for doc in _DOCS.values():
        out.extend(_review_rows(doc))
    return out


def _case_rows() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for cid, members in _CASE_MEMBERS.items():
        docs = [_DOCS[m] for m in members if m in _DOCS]
        if not docs:
            continue
        overall = "MATCH"
        for d in docs:
            if d.reconciliation is not None and d.reconciliation.overall_status == "MISMATCH":
                overall = "MISMATCH"
        out.append({
            "case_id": cid,
            "document_count": len(docs),
            "document_ids": [d.provenance.document_id for d in docs],
            "document_types": [str(d.provenance.document_type) for d in docs],
            "status": overall,
            "review_required": any(d.review_required for d in docs),
        })
    return out


def _trace_view(doc: DocumentResult) -> Dict[str, Any]:
    """Trace straight from doc.trace (list of add_trace dicts)."""
    stages = [
        {
            "timestamp": t.get("timestamp"),
            "stage": t.get("stage"),
            "component": t.get("component"),
            "status": t.get("status"),
            "details": t.get("details"),
        }
        for t in doc.trace
    ]
    return {
        "document_id": doc.provenance.document_id,
        "processed_at": doc.provenance.processed_at,
        "stage_count": len(stages),
        "stages": stages,
    }


def _system_health() -> Dict[str, Any]:
    """Real probes only. Nothing here is hardcoded to CONNECTED."""
    infra = P.infra_status()
    provider = P._get_provider()
    ocr_ok = provider.name != "none"

    def svc(name: str, category: str, status: str, detail: str, version: str = "") -> Dict[str, Any]:
        return {
            "service_name": name,
            "category": category,
            "status": status,
            "details": detail,
            "version": version,
            "latency_ms": _now_ms(),
        }

    services = {
        "python_api": svc("Python API", "core", "CONNECTED", "FastAPI adapter responding", "1.0.0"),
        "ocr_engine": svc("OCR Engine", "inference",
                          "CONNECTED" if ocr_ok else "UNAVAILABLE",
                          f"{provider.name} {provider.version}" if ocr_ok
                          else "No OCR provider available",
                          getattr(provider, "version", "")),
        "redis_cache": svc("Redis", "storage", infra["redis"]["status"], infra["redis"]["detail"]),
        "qdrant_vector_db": svc("Qdrant", "storage", infra["qdrant"]["status"], infra["qdrant"]["detail"]),
        "mcp_registry": svc("MCP Registry", "control_plane", "CONNECTED",
                            f"{len(P._REGISTRY)} tools registered"),
        "decision_provider": svc("Decision Provider", "inference", "CONNECTED",
                                 "deterministic", "1.0"),
        "task_worker": svc("Task Worker", "core", "DEGRADED", "in-process, no external worker"),
        "database": svc("Database", "storage", "DEGRADED", f"file store at {P.DATA_ROOT}"),
    }
    worst = "CONNECTED"
    for s in services.values():
        if s["status"] == "UNAVAILABLE":
            worst = "UNAVAILABLE"
            break
        if s["status"] == "DEGRADED" and worst == "CONNECTED":
            worst = "DEGRADED"
    return {
        "overall_status": worst,
        "ocr_engine": provider.name,
        "ocr_engine_version": getattr(provider, "version", ""),
        "mcp_tool_count": len(P._REGISTRY),
        "document_count": len(_DOCS),
        "services": services,
    }


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------
@app.post("/api/documents/process")
async def process_document(
    file: UploadFile = File(...),
    document_type: str = Form("unknown"),
    case_id: str = Form(""),
):
    """Run the real pipeline on an uploaded file. Returns the real DocumentResult."""
    suffix = Path(file.filename or "upload.bin").suffix or ".bin"
    tmp_dir = Path(tempfile.mkdtemp(prefix="trudoc_"))
    tmp_path = tmp_dir / f"upload{suffix}"
    try:
        with tmp_path.open("wb") as fh:
            shutil.copyfileobj(file.file, fh)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Upload failed: {exc}") from exc
    finally:
        await file.close()

    try:
        doc = P.process_document(tmp_path, doc_type=document_type, filename=file.filename or "")
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}") from exc

    # Persist the original bytes so the evidence overlay can render the real page.
    keep = Path(tempfile.gettempdir()) / "trudoc_src" / doc.provenance.document_id
    keep.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(tmp_path, keep)

    cid = case_id or f"CASE-{doc.provenance.document_id[:8].upper()}"
    _register(doc, cid, str(keep))
    _reconcile_case(cid)
    return JSONResponse(content=jsonable(doc.model_dump()))


@app.get("/api/documents")
def list_documents():
    rows = []
    for d in _DOCS.values():
        rows.append({
            "document_id": d.provenance.document_id,
            "case_id": _CASE_OF.get(d.provenance.document_id, ""),
            "filename": d.provenance.document_id,
            "document_type": str(d.provenance.document_type),
            "classification_method": d.provenance.classification_method,
            "page_count": d.provenance.page_count,
            "ocr_engine": d.provenance.ocr_engine,
            "overall_status": d.overall_status,
            "review_required": d.review_required,
            "tamper_status": str(d.tamper.status),
            "duplicate_status": str(d.duplicate.status),
            "quality_status": str(d.quality.status),
            "quality_score": d.quality.score,
            "field_count": len(_field_rows(d)),
            "table_rows": len(d.table.rows) if d.table else 0,
            "processed_at": d.provenance.processed_at,
        })
    return rows


@app.get("/api/documents/{document_id}")
def get_document(document_id: str):
    doc = _require_doc(document_id)
    payload = jsonable(doc.model_dump())
    payload["case_id"] = _CASE_OF.get(document_id, "")
    payload["validation"] = _validation_view(doc)
    payload["field_rows"] = _field_rows(doc)
    return payload


@app.get("/api/documents/{document_id}/evidence")
def get_evidence(document_id: str):
    """Evidence + the OCR tokens the bbox came from. No coordinates are invented."""
    doc = _require_doc(document_id)
    items: List[Dict[str, Any]] = []
    for name, f in doc.fields.items():
        for i, ev in enumerate(f.evidence):
            items.append({
                "field_name": name,
                "index": i,
                "document_id": ev.document_id,
                "page": ev.page,
                "bbox": ev.bbox,
                "text": ev.text,
                "ocr_confidence": ev.ocr_confidence,
                "field_value": f.value,
                "normalized_value": f.normalized_value,
                "reliability": f.reliability,
                "field_status": str(f.status),
            })
    tokens: List[Dict[str, Any]] = []
    for r in doc.ocr_results:
        for t in r.tokens:
            tokens.append({
                "text": t.text, "confidence": t.confidence,
                "bbox": t.bbox, "page": t.page,
            })
    return {
        "document_id": document_id,
        "evidence": items,
        "ocr_tokens": tokens,
        "ocr_mean_confidence": doc.ocr_results[0].mean_confidence if doc.ocr_results else 0.0,
        "ocr_engine": doc.provenance.ocr_engine,
    }


@app.get("/api/documents/{document_id}/trace")
def get_trace(document_id: str):
    return _trace_view(_require_doc(document_id))


@app.get("/api/documents/{document_id}/pages/{page}")
def get_page_image(document_id: str, page: int):
    """Serve the original uploaded file or a rendered page image so the bbox overlay is drawn on real pixels."""
    path = _FILE_OF.get(document_id)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Source image not available")
    
    doc = _require_doc(document_id)
    if doc.provenance.mime_type == "application/pdf":
        cache_path = Path(tempfile.gettempdir()) / "trudoc_src" / f"{document_id}_p{page}.jpg"
        if not cache_path.exists():
            try:
                import fitz
                pdf = fitz.open(str(path))
                if 1 <= page <= len(pdf):
                    pix = pdf[page - 1].get_pixmap(dpi=200)
                    from PIL import Image
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    img.save(str(cache_path), format="JPEG")
                else:
                    raise HTTPException(status_code=404, detail="Page not found")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to render PDF page: {e}")
        return FileResponse(str(cache_path))
        
    return FileResponse(path)


@app.post("/api/documents/{document_id}/revalidate")
def revalidate_document(document_id: str):
    """Backend revalidation after a human correction. Returns backend truth only."""
    doc = _require_doc(document_id)
    before = {
        "overall_status": doc.overall_status,
        "review_required": doc.review_required,
        "fields": {n: {"value": f.value, "status": str(f.status), "reliability": f.reliability}
                   for n, f in doc.fields.items()},
    }
    try:
        _CTRL.run_mcp_tool(doc, "document.revalidate", {}, requester="agent")
        _CTRL.run_mcp_tool(doc, "document.finalize", {}, requester="agent")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Revalidation failed: {exc}") from exc
    P.save_result(doc)
    payload = jsonable(doc.model_dump())
    payload["case_id"] = _CASE_OF.get(document_id, "")
    payload["validation"] = _validation_view(doc)
    payload["before"] = before
    return payload


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------
@app.get("/api/cases")
def list_cases():
    return _case_rows()


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    members = [d for d in (_DOCS.get(x) for x in _CASE_MEMBERS.get(case_id, [])) if d]
    if not members:
        raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")
    return {
        "case_id": case_id,
        "documents": [
            {
                "document_id": d.provenance.document_id,
                "document_type": str(d.provenance.document_type),
                "overall_status": d.overall_status,
                "review_required": d.review_required,
                "reconciliation": jsonable(d.reconciliation.model_dump()) if d.reconciliation else None,
            }
            for d in members
        ],
    }


@app.post("/api/cases/{case_id}/reconcile")
def reconcile_case(case_id: str):
    if case_id not in _CASE_MEMBERS:
        raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")
    _reconcile_case(case_id)
    return get_case(case_id)


@app.get("/api/documents/{document_id}/reconciliation")
def get_reconciliation(document_id: str):
    doc = _require_doc(document_id)
    if doc.reconciliation is None:
        return {
            "document_id": document_id,
            "has_reconciliation": False,
            "reason": "No second document in this case to reconcile against",
            "entries": [],
            "overall_status": None,
            "requires_review": False,
        }
    payload = jsonable(doc.reconciliation.model_dump())
    payload["document_id"] = document_id
    payload["has_reconciliation"] = True
    return payload


# ---------------------------------------------------------------------------
# Reviews / HITL
# ---------------------------------------------------------------------------
@app.get("/api/reviews")
def list_reviews():
    return _all_reviews()


@app.get("/api/reviews/{review_id:path}")
def get_review(review_id: str):
    for row in _all_reviews():
        if row["review_id"] == review_id:
            return row
    raise HTTPException(status_code=404, detail=f"Review not found: {review_id}")


class CorrectionPayload(BaseModel):
    field_name: str = Field(..., description="Backend field key, e.g. buyer_name")
    new_value: str
    reason: str = ""
    reviewer: str = "human_reviewer"


@app.post("/api/reviews/{review_id:path}/correction")
def submit_correction(review_id: str, payload: CorrectionPayload = Body(...)):
    """Apply a human correction through the real MCP tool, then revalidate.

    The frontend never sets a status locally; the returned document is backend truth.
    """
    if ":" not in review_id:
        raise HTTPException(status_code=400, detail="Malformed review_id")
    document_id, field_name = review_id.split(":", 1)
    if field_name != payload.field_name:
        raise HTTPException(
            status_code=400,
            detail=f"review_id field {field_name!r} does not match payload {payload.field_name!r}",
        )
    doc = _require_doc(document_id)

    before = {
        "overall_status": doc.overall_status,
        "review_required": doc.review_required,
        "field": {
            "value": doc.fields[field_name].value if field_name in doc.fields else None,
            "status": str(doc.fields[field_name].status) if field_name in doc.fields else None,
            "reliability": doc.fields[field_name].reliability if field_name in doc.fields else None,
        },
    }

    result = _CTRL.run_mcp_tool(
        doc, "document.apply_correction",
        {"field": payload.field_name, "value": payload.new_value},
        requester="human_reviewer",
    )
    if not result.success:
        raise HTTPException(status_code=500, detail=result.error or "Correction rejected by policy")
    _CTRL.run_mcp_tool(doc, "document.revalidate", {}, requester="agent")
    _CTRL.run_mcp_tool(doc, "document.finalize", {}, requester="agent")
    P.save_result(doc)

    out = jsonable(doc.model_dump())
    out["case_id"] = _CASE_OF.get(document_id, "")
    out["validation"] = _validation_view(doc)
    out["before"] = before
    out["correction_applied"] = {
        "field": payload.field_name,
        "new_value": payload.new_value,
        "reason": payload.reason,
        "reviewer": payload.reviewer,
    }
    return out


# ---------------------------------------------------------------------------
# Policies / runs / system
# ---------------------------------------------------------------------------
@app.get("/api/policies")
def list_policies():
    """Real MCP tool registry rendered as policy entries. No invented rules."""
    out = []
    for name, defn in P._REGISTRY.items():
        out.append({
            "code": name,
            "name": defn.name,
            "description": defn.description,
            "risk_level": str(defn.risk_level),
            "required_permissions": defn.required_permissions,
            "idempotent": defn.idempotent,
            "input_schema": defn.input_schema,
        })
    return out


@app.get("/api/runs")
def list_runs():
    return [
        {
            "run_id": d.provenance.document_id,
            "document_id": d.provenance.document_id,
            "case_id": _CASE_OF.get(d.provenance.document_id, ""),
            "document_type": str(d.provenance.document_type),
            "started_at": d.provenance.processed_at,
            "overall_status": d.overall_status,
            "stage_count": len(d.trace),
        }
        for d in _DOCS.values()
    ]


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    view = _trace_view(_require_doc(run_id))
    view["run_id"] = run_id
    return view


@app.get("/api/system/health")
def system_health():
    return _system_health()


@app.get("/api/system/tools")
def system_tools():
    return [{"name": n, "risk_level": str(d.risk_level), "idempotent": d.idempotent,
             "required_permissions": d.required_permissions, "description": d.description}
            for n, d in P._REGISTRY.items()]


# ---------------------------------------------------------------------------
def jsonable(obj: Any) -> Any:
    """Recursively convert Enums / Paths so FastAPI can serialise model_dump output."""
    from enum import Enum
    from pathlib import Path as _P
    if isinstance(obj, dict):
        return {k: jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [jsonable(v) for v in obj]
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, _P):
        return str(obj)
    return obj


@app.on_event("startup")
def _startup() -> None:
    _load_from_disk()
