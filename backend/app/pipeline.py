"""pipeline.py v4 — TruDoc OCR + extraction + validation + reconciliation + control plane.

OCR engine selection order: Tesseract -> EasyOCR -> PaddleOCR -> WSL Tesseract -> Fallback.
No fabricated OCR: if no engine runs, results are empty and statuses reflect it.
"""
from __future__ import annotations
import abc, hashlib, re, json, logging, subprocess, shlex
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image, ImageFilter, ImageOps

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OCR Provider abstraction
# ---------------------------------------------------------------------------
class OCRProvider(abc.ABC):
    name: str = "base"
    version: str = "unknown"
    req_perm: str = ""

    @abc.abstractmethod
    def is_available(self) -> bool: ...

    @abc.abstractmethod
    def run(self, image: Image.Image, page: int) -> "OCRResult": ...


class TesseractProvider(OCRProvider):
    """Windows Tesseract via pytesseract (probed first)."""
    name = "tesseract"

    def __init__(self):
        self._ok = False
        try:
            import pytesseract as _tess
            self._tess = _tess
            v = _tess.get_tesseract_version()
            self.version = str(v)
            self._ok = True
            log.info(f"Tesseract {v}: healthy")
        except Exception as e:
            log.warning(f"Tesseract unavailable: {e}")

    def is_available(self) -> bool:
        return self._ok

    def run(self, image: Image.Image, page: int) -> "OCRResult":
        data = self._tess.image_to_data(image, output_type=self._tess.Output.DICT)
        tokens: List[OCRToken] = []
        confs: List[float] = []
        for i, text in enumerate(data["text"]):
            if not str(text).strip():
                continue
            conf = max(0.0, float(data["conf"][i])) / 100.0
            bbox = [int(data["left"][i]), int(data["top"][i]),
                    int(data["left"][i] + data["width"][i]),
                    int(data["top"][i] + data["height"][i])]
            tokens.append(OCRToken(text=str(text), confidence=float(np.clip(conf, 0, 1)), bbox=bbox, page=page))
            confs.append(float(conf))
        return _make_result(page, tokens)


class EasyOCRProvider(OCRProvider):
    name = "easyocr"

    def __init__(self):
        self._ok = False
        try:
            import easyocr
            self._reader = easyocr.Reader(["en"], gpu=False, verbose=False)
            self.version = easyocr.__version__
            self._ok = True
            log.info(f"EasyOCR {self.version}: healthy")
        except Exception as e:
            log.warning(f"EasyOCR unavailable: {e}")

    def is_available(self) -> bool:
        return self._ok

    def run(self, image: Image.Image, page: int) -> "OCRResult":
        import numpy as _np
        arr = _np.array(image.convert("RGB"))
        results = self._reader.readtext(arr, detail=1, paragraph=False)
        tokens: List[OCRToken] = []
        confs: List[float] = []
        for (bbox_pts, text, conf) in (results or []):
            text = str(text).strip()
            if not text:
                continue
            xs = [int(p[0]) for p in bbox_pts]
            ys = [int(p[1]) for p in bbox_pts]
            bbox = [min(xs), min(ys), max(xs), max(ys)]
            tokens.append(OCRToken(text=text, confidence=float(conf), bbox=bbox, page=page))
            confs.append(float(conf))
        return _make_result(page, tokens)


class PaddleOCRProvider(OCRProvider):
    name = "paddleocr"

    def __init__(self):
        self._ok = False
        try:
            from paddleocr import PaddleOCR
            self._reader = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            import numpy as _np
            probe = _np.ones((64, 200, 3), dtype=_np.uint8) * 255
            self._reader.ocr(probe, cls=True)
            self.version = "3.x"
            self._ok = True
            log.info("PaddleOCR: healthy")
        except Exception as e:
            log.warning(f"PaddleOCR unavailable: {e}")

    def is_available(self) -> bool:
        return self._ok

    def run(self, image: Image.Image, page: int) -> "OCRResult":
        import numpy as _np
        arr = _np.array(image.convert("RGB"))
        raw = self._reader.ocr(arr, cls=True)
        tokens: List[OCRToken] = []
        confs: List[float] = []
        for line_group in (raw or []):
            for item in (line_group or []):
                if not item or len(item) < 2:
                    continue
                bbox_pts, (text, conf) = item[0], item[1]
                if not str(text).strip():
                    continue
                xs = [int(p[0]) for p in bbox_pts]
                ys = [int(p[1]) for p in bbox_pts]
                tokens.append(OCRToken(text=str(text), confidence=float(conf), bbox=[min(xs), min(ys), max(xs), max(ys)], page=page))
                confs.append(float(conf))
        return _make_result(page, tokens)


class WSLTesseractProvider(OCRProvider):
    """WSL Tesseract fallback (opt-in if WSL distro has tesseract installed)."""
    name = "wsl_tesseract"
    DISTRO = "Ubuntu"

    def __init__(self):
        self._ok = False
        try:
            probe = subprocess.run(
                ["wsl", "-d", self.DISTRO, "--", "tesseract", "--version"],
                capture_output=True, text=True, timeout=20,
            )
            if probe.returncode == 0:
                first = (probe.stdout or probe.stderr).splitlines()[0]
                self.version = first
                self._ok = True
        except Exception as e:
            log.warning(f"WSL Tesseract unavailable: {e}")

    def is_available(self) -> bool:
        return self._ok

    def run(self, image: Image.Image, page: int) -> "OCRResult":
        import tempfile, os
        arr = np.array(image.convert("RGB"))
        with tempfile.TemporaryDirectory() as td:
            png = os.path.join(td, "in.png")
            tsv = os.path.join(td, "out")
            Image.fromarray(arr).save(png)
            mnt = png.replace("\\", "/").replace("C:", "/mnt/c").replace(":", "")
            mnt_out = tsv.replace("\\", "/").replace("C:", "/mnt/c").replace(":", "")
            cmd = ["wsl", "-d", self.DISTRO, "--", "tesseract", mnt, mnt_out, "--psm", "6", "tsv"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            ts = os.path.join(tsv + ".tsv")
            if not os.path.exists(ts) or r.returncode != 0:
                return _make_result(page, [])
            tokens, confs = [], []
            for i, line in enumerate(open(ts, encoding="utf-8")):
                if i == 0:
                    continue
                parts = line.rstrip("\n").split("\t")
                if len(parts) < 12:
                    continue
                try:
                    text, conf = parts[11], float(parts[10])
                except Exception:
                    continue
                if not str(text).strip() or conf < 0:
                    continue
                bbox = [int(parts[6]), int(parts[7]), int(parts[6]) + int(parts[8]), int(parts[7]) + int(parts[9])]
                tokens.append(OCRToken(text=str(text), confidence=float(conf) / 100.0, bbox=bbox, page=page))
                confs.append(float(conf) / 100.0)
            return _make_result(page, tokens)


class FallbackProvider(OCRProvider):
    """Last-resort: empty result, engine reported as 'none'."""
    name = "none"
    version = "0"

    def is_available(self) -> bool:
        return True

    def run(self, image: Image.Image, page: int) -> "OCRResult":
        return OCRResult(page_number=page, raw_text="", mean_confidence=0.0)


def _make_result(page: int, tokens: List["OCRToken"]) -> "OCRResult":
    confs = [t.confidence for t in tokens]
    return OCRResult(page_number=page, tokens=tokens,
                     raw_text=" ".join(t.text for t in tokens),
                     mean_confidence=round(float(np.mean(confs)), 3) if confs else 0.0)


def _select_provider() -> OCRProvider:
    """Probe in spec order: Tesseract → EasyOCR → PaddleOCR → WSL Tesseract → Fallback."""
    for cls in [TesseractProvider, EasyOCRProvider, PaddleOCRProvider, WSLTesseractProvider]:
        try:
            p = cls()
            if p.is_available():
                log.info(f"OCR provider selected: {p.name} {p.version}")
                return p
        except Exception as e:
            log.warning(f"{cls.__name__} probe failed: {e}")
    log.error("No OCR engine available — using FallbackProvider")
    return FallbackProvider()


_PROVIDER: Optional[OCRProvider] = None

def _get_provider() -> OCRProvider:
    global _PROVIDER
    if _PROVIDER is None:
        _PROVIDER = _select_provider()
    return _PROVIDER


OCR_ENGINE: str = "pending"
OCR_ENGINE_VERSION: str = "pending"

try:
    import fitz as _fitz
    _PDF_AVAILABLE = True
except Exception:
    _PDF_AVAILABLE = False


from .models import (
    DocumentProvenance, DocumentQuality, DocumentQualityStatus,
    DocumentResult, DocumentType, DuplicateResult, DuplicateStatus,
    EvidenceSource, FieldResult, FieldSignal, FieldStatus,
    IntegrityStatus,
    OCRResult, OCRToken, QualitySignal, ReconciliationEntry,
    ReconciliationResult, ReconciliationStatus, RiskLevel,
    TableCell, TableResult, TableRow, TamperResult, TamperSignal,
    TamperStatus, ToolDefinition, ToolRequest, ToolResult,
    add_trace, compute_reliability,
)

# ---------------------------------------------------------------------------
# MCP Tool Registry (in-process tool boundary)
# ---------------------------------------------------------------------------
_REGISTRY: Dict[str, ToolDefinition] = {}

def _reg(name: str, desc: str, risk: RiskLevel, perms: List[str] = [],
         idempotent: bool = True, schema: Optional[Dict[str, Any]] = None) -> None:
    _REGISTRY[name] = ToolDefinition(name=name, description=desc, risk_level=risk,
        required_permissions=perms, idempotent=idempotent,
        input_schema=schema or {})

_reg("document.ingest", "Ingest raw bytes, hash, register document", RiskLevel.LOW)
_reg("document.assess_quality", "Assess image quality", RiskLevel.LOW)
_reg("document.classify", "Classify document type", RiskLevel.LOW)
_reg("document.ocr", "Run OCR", RiskLevel.LOW, schema={"text": True})
_reg("document.extract_fields", "Extract schema fields", RiskLevel.LOW)
_reg("document.extract_table", "Extract line-item table", RiskLevel.LOW)
_reg("document.validate", "Validate fields & arithmetic", RiskLevel.LOW)
_reg("document.detect_tamper", "Detect tamper signals", RiskLevel.LOW)
_reg("document.detect_duplicate", "Detect duplicates", RiskLevel.LOW)
_reg("document.reconcile", "PO ↔ Invoice reconciliation", RiskLevel.MEDIUM)
_reg("document.apply_correction", "Apply human correction", RiskLevel.HIGH, perms=["human_reviewer"], idempotent=False, schema={"field": True, "value": True})
_reg("document.revalidate", "Revalidate after correction", RiskLevel.MEDIUM)
_reg("document.verify_integrity", "Verify SHA-256 against stored hash", RiskLevel.LOW)
_reg("document.finalize", "Compute backend final status", RiskLevel.LOW)


# ---- Policy -----------------------------------------------------------------
def _policy_verdict(req: ToolRequest, defn: ToolDefinition, doc: DocumentResult) -> Tuple[bool, str]:
    if req.document_id != doc.provenance.document_id:
        return False, "Document ownership mismatch"
    risk = defn.risk_level
    case = req.requester or "agent"
    if risk == RiskLevel.HIGH and case not in (defn.required_permissions or []) + ["human_reviewer"]:
        return False, f"Policy denied: HIGH risk tool requires {defn.required_permissions or ['human_reviewer']}"
    if risk == RiskLevel.MEDIUM and case == "anonymous":
        return False, "Policy denied: MEDIUM risk tool requires authenticated requester"
    if defn.required_permissions and case not in defn.required_permissions and case != "agent":
        ok = case in defn.required_permissions
        if not ok:
            return False, f"Policy denied: missing permission {defn.required_permissions}"
    return True, "allowed"


def _validate_input(defn: ToolDefinition, payload: Dict[str, Any]) -> Optional[str]:
    for key, required in defn.input_schema.items():
        if required and key not in payload:
            return f"Missing required parameter: {key}"
    return None


def execute_tool_control(req: ToolRequest, doc: DocumentResult, **kwargs) -> ToolResult:
    """MCP execution chain, in-process:
       Tool Request → Registry → Input Schema Validation → Ownership/Case check
       → Risk Classification → Policy Revalidation → Execution → Result
    """
    t0 = datetime.utcnow()

    # 1. Registry
    defn = _REGISTRY.get(req.tool_name)
    if defn is None:
        add_trace(doc, "reject", "REJECTED", {"reason": "unknown_tool", "tool": req.tool_name}, component="Registry")
        return ToolResult(tool_name=req.tool_name, document_id=req.document_id, success=False, error=f"Unknown tool: {req.tool_name}")

    # 2. Input schema validation
    schema_err = _validate_input(defn, req.payload)
    if schema_err:
        add_trace(doc, "reject", "SCHEMA_INVALID", {"tool": req.tool_name, "error": schema_err}, component="Registry")
        return ToolResult(tool_name=req.tool_name, document_id=req.document_id, success=False, error=schema_err)

    # 3. Ownership / case check + 4. Risk classification + 5. Policy revalidation
    allow, deny_reason = _policy_verdict(req, defn, doc)
    if not allow:
        add_trace(doc, "reject", "POLICY_DENIED", {"reason": deny_reason, "risk": str(defn.risk_level)}, component="Policy")
        return ToolResult(tool_name=req.tool_name, document_id=req.document_id, success=False, error=deny_reason)
    add_trace(doc, "policy", "ALLOWED", {"tool": req.tool_name, "risk": str(defn.risk_level)}, component="Policy")

    # 6. Execution
    try:
        result = _execute_tool(req, doc, defn, **kwargs)
    except Exception as exc:
        add_trace(doc, "exec", "ERROR", {"tool": req.tool_name, "error": str(exc)}, component="Executor")
        return ToolResult(tool_name=req.tool_name, document_id=req.document_id, success=False, error=str(exc))
    ms = (datetime.utcnow() - t0).total_seconds() * 1000
    add_trace(doc, "exec", "COMPLETED", {"tool": req.tool_name, "latency_ms": round(ms, 1)}, component="Executor")
    return result


# Back-compat alias used by old callers/UI.
def dispatch_tool(req: ToolRequest, doc: DocumentResult, **kwargs) -> ToolResult:
    return execute_tool_control(req, doc, **kwargs)


def _execute_tool(req: ToolRequest, doc: DocumentResult, defn: ToolDefinition, **kwargs) -> ToolResult:
    ok = lambda out=None: ToolResult(tool_name=req.tool_name, document_id=req.document_id, success=True, output=out)
    n = req.tool_name
    if n == "document.classify":
        dt, method = classify_document(req.payload.get("text", ""), req.payload.get("filename", ""))
        doc.provenance.document_type = dt
        doc.provenance.classification_method = method
        return ok({"type": str(dt), "method": method})
    if n == "document.assess_quality":
        img = kwargs.get("image")
        if img is None:
            raise ValueError("image kwarg required")
        qs = assess_quality(img)
        status, score = classify_quality(qs)
        doc.quality.signals = qs
        doc.quality.status = status
        doc.quality.score = score
        return ok({"status": str(status), "score": score})
    if n == "document.ocr":
        img = kwargs.get("image")
        page = kwargs.get("page", 1)
        res = perform_ocr(img, page)
        doc.ocr_results.append(res)
        return ok({"tokens": len(res.tokens), "mean_conf": res.mean_confidence})
    if n == "document.extract_fields":
        extract_fields(kwargs.get("ocr_tokens", []), doc)
        return ok({"fields": list(doc.fields.keys())})
    if n == "document.extract_table":
        extract_table(doc)
        return ok({"rows": len(doc.table.rows) if doc.table else 0})
    if n == "document.validate":
        validate_fields(doc)
        return ok({"review_required": doc.review_required})
    if n == "document.detect_tamper":
        detect_tamper(doc)
        return ok({"status": str(doc.tamper.status)})
    if n == "document.detect_duplicate":
        detect_duplicate(doc, kwargs.get("seen_hashes"))
        return ok({"status": str(doc.duplicate.status)})
    if n == "document.reconcile":
        other = kwargs.get("other_doc")
        if other is None:
            raise ValueError("other_doc kwarg required")
        res = reconcile_documents(doc, other)
        doc.reconciliation = res
        return ok({"overall": str(res.overall_status)})
    if n == "document.apply_correction":
        apply_correction(doc, req.payload.get("field"), req.payload.get("value"))
        return ok({"field": req.payload.get("field")})
    if n == "document.revalidate":
        validate_fields(doc)
        return ok({"review_required": doc.review_required})
    if n == "document.verify_integrity":
        verify_integrity(doc, kwargs.get("file_path"))
        return ok({"status": str(doc.integrity_status)})
    if n == "document.finalize":
        finalize(doc)
        return ok({"status": doc.overall_status})
    return ok()


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
_PO_SIGNALS = [
    re.compile(r"\bpurchase\s+order\b", re.I),
    re.compile(r"\bpo\s*(?:number|no|#)[:\s]", re.I),
    re.compile(r"\bpo[-\s]?\d{3,}\b", re.I),
    re.compile(r"\border\s+date\b", re.I),
    re.compile(r"\bdelivery\s+date\b", re.I),
]
_INV_SIGNALS = [
    re.compile(r"\binvoice\b", re.I),
    re.compile(r"\binvoice\s*(?:number|no|#)[:\s]", re.I),
    re.compile(r"\binv[-\s]?\d{3,}\b", re.I),
    re.compile(r"\bbill\s+to\b", re.I),
    re.compile(r"\bdue\s+date\b", re.I),
]

def classify_document(text: str, filename: str = "") -> Tuple[DocumentType, str]:
    po_score = sum(1 for p in _PO_SIGNALS if p.search(text))
    inv_score = sum(1 for p in _INV_SIGNALS if p.search(text))
    fn = filename.lower()
    if "po" in fn or "purchase" in fn: po_score += 2
    if "invoice" in fn or "inv" in fn: inv_score += 2
    if po_score == 0 and inv_score == 0:
        return DocumentType.UNKNOWN, "no_signals"
    if po_score > inv_score:
        return DocumentType.PURCHASE_ORDER, "deterministic_signals"
    if inv_score > po_score:
        return DocumentType.INVOICE, "deterministic_signals"
    return DocumentType.UNKNOWN, "ambiguous_signals"


# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------
def assess_quality(image: Image.Image) -> QualitySignal:
    gray = ImageOps.grayscale(image)
    arr = np.array(gray, dtype=np.float32)
    contrast = float(np.std(arr))
    resolution = arr.shape[0] * arr.shape[1]
    lap = arr[:-1, :-1] - arr[1:, 1:]
    lap_var = float(np.var(lap))
    return QualitySignal(blur=lap_var, contrast=contrast, resolution=resolution,
                         readability=contrast / (lap_var + 1e-5))


def classify_quality(qs: QualitySignal) -> Tuple[DocumentQualityStatus, float]:
    score = 1.0
    if qs.resolution < 150_000: score -= 0.3
    if qs.contrast < 22: score -= 0.3
    if qs.blur < 60: score -= 0.2
    score = max(0.0, min(1.0, score))
    if score < 0.45: return DocumentQualityStatus.POOR, round(score, 3)
    if score < 0.75: return DocumentQualityStatus.DEGRADED, round(score, 3)
    return DocumentQualityStatus.GOOD, round(score, 3)


def preprocess_image(image: Image.Image) -> Image.Image:
    img = ImageOps.grayscale(image)
    if max(img.size) > 2000:
        scale = 2000 / max(img.size)
        img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    img = img.filter(ImageFilter.MedianFilter(size=3))
    return ImageOps.autocontrast(img)


def perform_ocr(page_image: Image.Image, page_number: int) -> OCRResult:
    """Route through the active OCRProvider. Bbox/confidence refer to the source image."""
    global OCR_ENGINE, OCR_ENGINE_VERSION
    provider = _get_provider()
    if OCR_ENGINE == "pending":
        OCR_ENGINE = provider.name
        OCR_ENGINE_VERSION = provider.version
    return provider.run(page_image, page_number)


def render_pages(file_path: Path) -> List[Image.Image]:
    if file_path.suffix.lower() == ".pdf" and _PDF_AVAILABLE:
        doc = _fitz.open(str(file_path))
        imgs = []
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            imgs.append(Image.frombytes("RGB", [pix.width, pix.height], pix.samples))
        return imgs
    return [Image.open(str(file_path)).convert("RGB")]


# ---------------------------------------------------------------------------
# Geometry helpers: group OCR tokens into reading-order lines
# ---------------------------------------------------------------------------
def _tok_center_y(t: OCRToken) -> float:
    return (t.bbox[1] + t.bbox[3]) / 2.0


def _build_lines(tokens: List[OCRToken]) -> List[List[OCRToken]]:
    if not tokens:
        return []
    toks = sorted(tokens, key=lambda t: (_tok_center_y(t), t.bbox[0]))
    heights = [max(1, t.bbox[3] - t.bbox[1]) for t in toks]
    median_h = float(np.median(heights))
    gap = max(3.0, median_h * 0.65)
    lines: List[List[OCRToken]] = [[toks[0]]]
    cur_y = _tok_center_y(toks[0])
    for t in toks[1:]:
        yc = _tok_center_y(t)
        if abs(yc - cur_y) > gap:
            lines.append([t])
            cur_y = yc
        else:
            lines[-1].append(t)
            cur_y = (cur_y + yc) / 2.0
    for ln in lines:
        ln.sort(key=lambda t: t.bbox[0])
    return lines


def _line_text(ln: List[OCRToken]) -> str:
    return " ".join(t.text for t in ln).strip()


def _tokens_union(ts: List[OCRToken]) -> Tuple[List[int], float, str]:
    if not ts:
        return [0, 0, 0, 0], 0.0, ""
    xs0 = min(t.bbox[0] for t in ts); ys0 = min(t.bbox[1] for t in ts)
    xs1 = max(t.bbox[2] for t in ts); ys1 = max(t.bbox[3] for t in ts)
    conf = float(np.mean([t.confidence for t in ts]))
    text = " ".join(t.text for t in ts).strip()
    return [xs0, ys0, xs1, ys1], conf, text


# ---------------------------------------------------------------------------
# Numeric / date parsing (deterministic, conservative)
# ---------------------------------------------------------------------------
_MONEY_RE = re.compile(r"\d[\d,\.Oo]{1,}")
_OCR_O = str.maketrans({"O": "0", "o": "0"})
_DATE_RE = re.compile(r"\d{1,2}[/-]\d{1,2}[/-]\d{2,4}")
_PURE_INT_RE = re.compile(r"^\d{1,4}$")
_MONEY_FMT_RE = re.compile(r"^\d{1,3}(?:,\d{3})+(?:\.\d{2})?$|^[\dOo]+(?:\.\d{2})?$|^\d{1,3},\d{3},\d{2}$")


def _looks_like_money(s: str) -> bool:
    return bool(_MONEY_FMT_RE.match(s.strip()))


def _parse_money(s: str) -> Tuple[Optional[float], bool]:
    """Return (value, ambiguous). Never guesses beyond a documented rule."""
    s = _clean_digits(s.strip())
    if not s:
        return None, False
    if "," not in s and "." not in s:
        try:
            return float(int(s)), False
        except Exception:
            return None, False
    if "." not in s:
        parts = s.split(",")
        # trailing 2-digit group treated as decimal (Indian/OCR convention) → ambiguous
        if len(parts) >= 2 and len(parts[-1]) == 2 and len(parts[0]) <= 3:
            try:
                return float(int("".join(parts[:-1])) + int(parts[-1]) / 100.0), True
            except Exception:
                pass
        try:
            return float(int(s.replace(",", ""))), False
        except Exception:
            return None, False
    if s.count(".") > 1:
        return None, False
    ipart, frac = s.split(".")
    if len(frac) > 2:
        return None, False
    try:
        return float(int(ipart.replace(",", "")) + int(frac or "0") / 100.0), False
    except Exception:
        return None, False


def _clean_digits(s: str) -> str:
    # Only map O→0 inside an otherwise numeric token (e.g. "40OO0.00")
    if re.fullmatch(r"[\dOo][\dOo,\.]+", s) and "O" in s.upper():
        return s.translate(_OCR_O)
    return s


def _extract_money(text: str) -> List[Tuple[float, bool, str]]:
    out = []
    for m in _MONEY_RE.finditer(text):
        grp = m.group(0)
        if len(grp) < 2 or grp.count(".") > 1:
            continue
        v, amb = _parse_money(grp)
        if v is not None:
            out.append((v, amb, grp))
    return out


def _extract_date(text: str) -> Optional[str]:
    t = text.replace(",", "/").replace(".", "/")
    m = _DATE_RE.search(t)
    return m.group(0) if m else None


def _normalize_value(name: str, raw: str) -> str:
    raw = raw.strip()
    if name in ("subtotal", "tax", "grand_total"):
        for v, _amb, _g in _extract_money(raw):
            return f"{v:.2f}"
        return ""
    if "date" in name:
        return _extract_date(raw) or raw
    if name in ("po_number",):
        m = re.search(r"\d[0-9\-]{3,}", raw)
        return m.group(0) if m else raw
    if name in ("invoice_number",):
        m = re.search(r"[A-Z0-9\-]{4,}", raw, re.I)
        return m.group(0) if m else raw
    return raw.strip().rstrip(":")
_PO_NUM_RAW = [r"\bPO\s*(?:Number|No|#)\s*[:]?\s*([A-Z0-9\-]+)", r"\b(PO[-\s]?\d{3,})\b"]
_INV_NUM_RAW = [r"Invoice\s*(?:Number|No|#|Na)[:\s]*([A-Z0-9\-]+)", r"\b(INV[-\s]?\d{3,})\b"]


# ---------------------------------------------------------------------------
# Label → value extraction (geometry + context boundaries)
# ---------------------------------------------------------------------------
def _entity_value(lines: List[List[OCRToken]], label_pat, forbid: List[str],
                  page: int) -> Optional[Dict[str, Any]]:
    """Independent vendor/buyer extraction with label boundaries."""
    best = None
    for li, ln in enumerate(lines):
        text = _line_text(ln)
        lbl = None
        for pat in label_pat:
            m = re.match(pat, text, re.I)
            if m:
                lbl = text[:m.end()]
                break
        if lbl is None:
            continue
        # collect value tokens right of the label within the same line
        label_end = len(lbl)
        consumed = 0
        val_toks: List[OCRToken] = []
        for t in ln:
            n = len(t.text)
            if consumed < label_end:
                # token overlaps label region
                overlap = min(consumed + n, label_end) - max(consumed, 0)
                if overlap > 0 and n - overlap > 1:
                    # merged token: "Vendor: ACME Supplies Ltd:" → take suffix
                    cut = label_end - consumed
                    suffix = t.text[cut:]
                    if suffix.strip():
                        val_toks.append(OCRToken(text=suffix.strip(), confidence=t.confidence, bbox=t.bbox, page=t.page))
                consumed += n + 1
                continue
            val_toks.append(t)
        if not val_toks:
            # look at the next non-address line (name tokens have no digits)
            if li + 1 < len(lines):
                nxt = lines[li + 1]
                cand = [t for t in nxt if not re.search(r"\d", t.text)]
                cand = [t for t in cand if len(t.text.strip(":,")) >= 2]
                if cand:
                    val_toks = cand
        if not val_toks:
            continue
        raw = " ".join(t.text for t in val_toks).strip().rstrip(":")
        if len(raw) < 2:
            continue
        ambig = False
        low = raw.lower()
        for f in forbid:
            if f in low:
                split_i = low.find(f)
                raw = raw[:split_i].strip().rstrip(":")
                ambig = True
                val_toks = [t for t in val_toks if t.text.lower() not in (f, f + ":")]
                break
        bbox, conf, _ = _tokens_union(val_toks)
        candidate = {"value": raw, "raw_text": raw, "bbox": bbox, "page": page,
                     "ocr_conf": round(conf, 3), "ambig": ambig,
                     "label": lbl, "line_index": li}
        if best is None or (not candidate["ambig"] and best["ambig"]):
            best = candidate
        elif not candidate["ambig"] and not best["ambig"]:
            # multiple clean label lines: ambiguous (e.g., duplicate vendor blocks)
            best["ambig"] = True
    return best


_ENTITY_FORBID = ["buyer", "bill to", "bill ta", "vendor", "supplier", "from", "ship to",
                  "po number", "po no", "order date", "delivery date", "subtotal", "tax",
                  "grand total", "terms", "invoice", "due date"]


def _date_value(lines, label_pat, page) -> Optional[Dict[str, Any]]:
    for ln in lines:
        text = _line_text(ln)
        if not any(re.search(p, text, re.I) for p in label_pat):
            continue
        d = _extract_date(text)
        if not d:
            continue
        bbox = [0, 0, 0, 0]
        conf = 0.0
        for t in ln:
            if _extract_date(t.text):
                bbox, conf = t.bbox, t.confidence
                break
        if not bbox[2]:
            bbox, conf, _ = _tokens_union(ln)
        return {"value": d, "raw_text": text, "bbox": bbox, "page": page,
                "ocr_conf": round(conf, 3), "ambig": False}
    return None


def _money_value(lines, label_pats, page) -> Optional[Dict[str, Any]]:
    """Right-hand-side money extraction after a totals label. Prefers same line, falls to next."""
    for li, ln in enumerate(lines):
        text = _line_text(ln)
        if not any(re.search(p, text, re.I) for p in label_pats):
            continue
        cands = sorted(_extract_money(text), key=lambda x: -text.rfind(x[2]))
        if not cands and li + 1 < len(lines):
            next_text = _line_text(lines[li + 1])
            cands = sorted(_extract_money(next_text), key=lambda x: -next_text.rfind(x[2]))
            text = next_text
        if not cands:
            continue
        v, amb, grp = cands[0]
        # bbox/conf of the token containing the value
        bbox = [0, 0, 0, 0]
        conf = 0.0
        for t in ln:
            if grp.split(".")[0][:3] in t.text or grp[:4] in t.text:
                bbox, conf = t.bbox, t.confidence
                break
        rate = None
        for m in re.finditer(r"(\d{1,2})\s*%", text, re.I):
            rate = float(m.group(1))
            break
        return {"value": f"{v:.2f}", "raw_text": grp, "bbox": bbox, "page": page,
                "ocr_conf": round(conf, 3), "ambig": amb,
                "reason": "ambiguous money format" if amb else "", "rate": rate,
                "token_line": text}
    return None


def _code_value(lines, raw_text, patterns, page, is_po: bool) -> Optional[Dict[str, Any]]:
    for pat in patterns:
        m = re.search(pat, raw_text, re.I)
        if m:
            raw = m.group(0)
            bbox, conf = _find_bbox(raw.split()[-1] if raw.split() else raw, [t for ln in lines for t in ln])
            return {"value": _normalize_value("po_number" if is_po else "invoice_number", raw),
                    "raw_text": raw, "bbox": bbox, "page": page, "ocr_conf": round(conf, 3), "ambig": False}
    return None


def _find_bbox(search: str, tokens: List[OCRToken]) -> Tuple[List[int], float]:
    s = search.strip().upper()
    best = ([0, 0, 0, 0], 0.0)
    for tok in tokens:
        if s and not tok.text.upper().isdigit():
            if s in tok.text.upper() or tok.text.upper() in s:
                best = (tok.bbox, tok.confidence)
                break
    return best


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
_PO_LABELS = {
    "vendor_name": [r"\bVendor\s*[:]?", r"\bSupplier\s*[:]?", r"\bSold\s*by\s*[:]?", r"\bFrom\s*[:]?"],
    "buyer_name": [r"\bBuyer\s*[:]?", r"\bBill\s*T[oa]\s*[:]?", r"\bBilled\s*To\s*[:]?", r"\bShip\s*To\s*[:]?", r"\bTo\s*[:]?"],
    "order_date": [r"\bOrder\s*Date\s*[:]?"],
    "delivery_date": [r"\bDelivery\s*Date\s*[:]?", r"\bDue\s*Date\s*[:]?", r"\bShip\s*Date\s*[:]?"],
    "subtotal": [r"\bSub\s*[-\s]*[Tt]otal\s*[:]?"],
    "tax": [r"\bTax\b", r"\bGST\b", r"\bVAT\b", r"\bHST\b", r"\bSales\s*[Tt]ax\b"],
    "grand_total": [r"\bGrand\s*[Tt]otal\s*[:]?", r"\b[Tt]otal\s*[Aa]mount\s*[:]?", r"\bAmount\s*Due\s*[:]?"],
}
_INV_LABELS = {
    "vendor_name": _PO_LABELS["vendor_name"],
    "buyer_name": _PO_LABELS["buyer_name"],
    "invoice_date": [r"\bInvoice\s*Date\s*[:]?"],
    "due_date": [r"\bDue\s*Date\s*[:]?", r"\bPayment\s*Due\s*[:]?"],
    "subtotal": _PO_LABELS["subtotal"],
    "tax": _PO_LABELS["tax"],
    "grand_total": _PO_LABELS["grand_total"],
}


def _set_field(doc: DocumentResult, name: str, value: Optional[Dict[str, Any]],
               qscore: float, extra_reasons: List[str] = None,
               business_valid: bool = True, method: str = "rule_based") -> None:
    extra = extra_reasons or []
    if value is None or not value.get("value"):
        is_mand = name in _MANDATORY.get(doc.provenance.document_type, [])
        sig = FieldSignal(ocr=0.0, format_valid=False, business_rule_valid=not is_mand,
                          quality_penalty=1.0 - qscore)
        doc.fields[name] = FieldResult(
            name=name, value="", reliability=0.0, signals=sig,
            status=FieldStatus.REVIEW_REQUIRED if is_mand else FieldStatus.UNEXTRACTED,
            reasons=["Not found in document"] + (["MANDATORY field missing"] if is_mand else []),
            extraction_method="none", page=1)
        if is_mand:
            doc.review_required = True
        return
    raw = value["value"]
    normalized = _normalize_value(name, raw)
    ambig = bool(value.get("ambig"))
    sig = FieldSignal(ocr=float(value.get("ocr_conf", 0.0)),
                      format_valid=bool(normalized),
                      business_rule_valid=business_valid,
                      quality_penalty=1.0 - qscore,
                      ambiguity_penalty=0.3 if ambig else 0.0)
    rel = compute_reliability(sig, qscore)
    reasons: List[str] = list(value.get("reasons", [])) if value.get("reasons") else []
    if ambig:
        reasons.append("Ambiguous extraction — verify against document")
    if value.get("ocr_conf", 0.0) < 0.7:
        reasons.append(f"Low OCR confidence ({value.get('ocr_conf', 0.0):.2f})")
    status = FieldStatus.VALID
    if not normalized:
        status = FieldStatus.REVIEW_REQUIRED
        reasons.append("Could not normalize extracted value")
    elif ambig or rel < 0.55:
        status = FieldStatus.REVIEW_REQUIRED
        reasons.append(f"Reliability {rel:.2f} below {0.55:.2f} threshold" if rel < 0.55 else "")
        reasons = [r for r in reasons if r]
    ev = EvidenceSource(document_id=doc.provenance.document_id, page=value.get("page", 1),
                        bbox=value.get("bbox", [0, 0, 0, 0]), text=value.get("raw_text", raw),
                        ocr_confidence=float(value.get("ocr_conf", 0.0)))
    doc.fields[name] = FieldResult(
        name=name, value=raw, normalized_value=normalized,
        raw_text=value.get("raw_text", raw), reliability=rel, signals=sig,
        status=status, evidence=[ev], reasons=reasons[:6],
        bbox=value.get("bbox", [0, 0, 0, 0]), page=value.get("page", 1),
        ocr_confidence=float(value.get("ocr_conf", 0.0)),
        extraction_method=method, extracted_value=raw)
    add_trace(doc, "extract", "field_found",
              {"field": name, "value": raw, "reliability": rel, "status": str(status)},
              component="Extractor")


def extract_fields(ocr_tokens: List[OCRToken], doc: DocumentResult) -> None:
    dt = doc.provenance.document_type
    if dt == DocumentType.UNKNOWN:
        add_trace(doc, "extract", "SKIPPED", {"reason": "document_type_unknown"}, component="Extractor")
        return
    qscore = doc.quality.score
    all_tokens: List[OCRToken] = []
    for r in doc.ocr_results:
        all_tokens.extend(r.tokens)
    if ocr_tokens:
        all_tokens = ocr_tokens
    all_text = doc.ocr_results[0].raw_text if doc.ocr_results else ""
    lines = _build_lines(all_tokens)
    labels = _PO_LABELS if dt == DocumentType.PURCHASE_ORDER else _INV_LABELS

    def set_from(name, extractor_fn, **kw):
        v = extractor_fn(name, labels[name], **kw)
        _set_field(doc, name, v, qscore)

    for name in labels.keys():
        if dt == DocumentType.PURCHASE_ORDER and name in ("invoice_date", "due_date"):
            continue
        if dt == DocumentType.INVOICE and name in ("order_date", "delivery_date"):
            continue
        if name in ("vendor_name", "buyer_name"):
            set_from(name, _extract_entity, lines=lines, page=1)
        elif "date" in name:
            set_from(name, _extract_labeldate, lines=lines, page=1)
        elif name in ("subtotal", "tax", "grand_total"):
            set_from(name, _extract_labelmoney, lines=lines, page=1)
        elif name == "po_number":
            v = _code_value(lines, all_text, _PO_NUM_RAW, 1, is_po=True)
            _set_field(doc, name, v, qscore)
        elif name == "invoice_number":
            v = _code_value(lines, all_text, _INV_NUM_RAW, 1, is_po=False)
            _set_field(doc, name, v, qscore)

    # vendor / buyer cross-ambiguity: if vendor value == buyer value → both REVIEW
    vv, bv = doc.fields.get("vendor_name"), doc.fields.get("buyer_name")
    if vv and bv and vv.value and bv.value and vv.normalized_value and bv.normalized_value:
        a, b = vv.normalized_value.lower(), bv.normalized_value.lower()
        if a == b:
            for f in (vv, bv):
                f.signals.ambiguity_penalty = 0.6
                f.reliability = compute_reliability(f.signals, qscore)
                f.status = FieldStatus.REVIEW_REQUIRED
                f.reasons.append("Vendor and buyer extracted identical — ambiguous")
                doc.review_required = True
    add_trace(doc, "extract", "completed", {"fields": len(doc.fields)}, component="Extractor")


def _extract_entity(name, pats, lines=None, page=1):
    return _entity_value(lines, pats, _ENTITY_FORBID, page)


def _extract_labeldate(name, pats, lines=None, page=1):
    return _date_value(lines, pats, page)


def _extract_labelmoney(name, pats, lines=None, page=1):
    return _money_value(lines, pats, page)


_MANDATORY: Dict = {
    DocumentType.PURCHASE_ORDER: ["po_number", "vendor_name", "grand_total"],
    DocumentType.INVOICE: ["invoice_number", "vendor_name", "grand_total"],
    DocumentType.UNKNOWN: [],
}


# ---------------------------------------------------------------------------
# Table extraction (geometry-based, column-anchored)
# ---------------------------------------------------------------------------
_TABLE_LABEL_EXCLUDE = re.compile(
    r"(?i)(sub\s*total|grand\s*total|tax|gst|vat|total\s*amount|payment|bank|account|terms|"
    r"authorized|signature|reference|shipping|special|instructions|invoice|delivery|due|order\s*date|"
    r"vend|buyer|bill|from|tel|email|phone|page|net\s*\d+|date)")
_HEADER_RE = re.compile(r"(?i)(item|description|desc|qty|quantity|oty|unit\s*price|unit|total|line\s*total|price)")


def extract_table(doc: DocumentResult) -> None:
    all_tokens: List[OCRToken] = []
    for r in doc.ocr_results:
        all_tokens.extend(r.tokens)
    if not all_tokens:
        return
    lines = _build_lines(all_tokens)

    started = False
    data_lines: List[List[OCRToken]] = []
    for ln in lines:
        text = _line_text(ln)
        if not started:
            if _HEADER_RE.search(text) and re.search(r"(?i)(item|desc|qty|quantity|oty|unit)", text):
                started = True
            continue
        data_lines.append(ln)

    rows: List[TableRow] = []
    for ln in data_lines:
        text = _line_text(ln)
        if _TABLE_LABEL_EXCLUDE.search(text):
            continue
        toks = [t for t in ln if not _HEADER_RE.fullmatch(t.text.strip())]
        numeric = sorted([t for t in toks if re.search(r"\d", t.text)], key=lambda t: t.bbox[0])
        if not numeric:
            continue
        first_num_x = numeric[0].bbox[0]
        desc_toks = [t for t in toks if t.bbox[2] < first_num_x]
        num_toks = [t for t in toks if t.bbox[0] >= first_num_x]
        if not desc_toks:
            continue

        monies: List[TableCell] = []
        for t in sorted(num_toks, key=lambda x: x.bbox[0]):
            for v, amb, g in _extract_money(t.text):
                raw_show = g
                if amb:
                    raw_show = f"{g}*"
                monies.append(TableCell(value=f"{v:.2f}", raw_text=raw_show,
                                        confidence=round(t.confidence, 3), bbox=t.bbox))
        if len(monies) < 2:
            continue
        total_cell = monies[-1]
        unit_cell = monies[-2]

        qty_cell = None
        for t in sorted(num_toks, key=lambda x: x.bbox[0]):
            if _PURE_INT_RE.match(t.text.strip()) and t.bbox[0] < unit_cell.bbox[0]:
                qty_cell = TableCell(value=t.text.strip(), raw_text=t.text.strip(),
                                     confidence=round(t.confidence, 3), bbox=t.bbox)
                break

        desc_text = " ".join(t.text for t in desc_toks).strip()
        desc_conf = float(np.mean([t.confidence for t in desc_toks])) if desc_toks else 0.0
        desc_cell = TableCell(value=desc_text, raw_text=desc_text, confidence=round(desc_conf, 3),
                              bbox=[min(t.bbox[0] for t in desc_toks), min(t.bbox[1] for t in desc_toks),
                                    max(t.bbox[2] for t in desc_toks), max(t.bbox[3] for t in desc_toks)])

        unit = float(unit_cell.value.replace(",", ""))
        total = float(total_cell.value.replace(",", ""))
        arith_ok = True
        arith_note = ""
        qty_num = None
        if qty_cell:
            qty_num = float(qty_cell.value)
        elif unit > 0 and abs(total / unit - round(total / unit)) < 1e-6:
            qty_num = round(total / unit)
            qty_cell = TableCell(value=str(qty_num), raw_text=f"derived {total}/{unit}",
                                 confidence=0.0, bbox=unit_cell.bbox, derived=True)
        else:
            arith_ok = False
            arith_note = "qty unreadable and total not divisible by unit price"
        if qty_num is not None:
            lv = round(qty_num * unit, 2)
            if abs(lv - total) > max(0.5, total * 0.02):
                arith_ok = False
                arith_note = f"qty*unit={lv:.2f} != line={total:.2f}"
        rows.append(TableRow(
            item=TableCell(value=str(len(rows) + 1), raw_text=str(len(rows) + 1),
                           confidence=0.0, bbox=desc_cell.bbox, derived=True),
            description=desc_cell, quantity=qty_cell, unit_price=unit_cell,
            line_total=total_cell, arithmetic_valid=arith_ok, arithmetic_note=arith_note))
    if rows:
        doc.table = TableResult(page=1, rows=rows, evidence_text=f"{len(rows)} rows extracted")
        add_trace(doc, "extract", "table_rows", {"rows": len(rows)}, component="TableExtractor")
    else:
        add_trace(doc, "extract", "table_no_rows", {}, component="TableExtractor")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def _fnum(doc: DocumentResult, name: str) -> Optional[float]:
    fld = doc.fields.get(name)
    if not fld:
        return None
    try:
        return float((fld.normalized_value or fld.value).replace(",", ""))
    except Exception:
        return None


def validate_fields(doc: DocumentResult) -> None:
    add_trace(doc, "validate", "started", {}, component="Validator")
    if doc.provenance.document_type == DocumentType.UNKNOWN:
        doc.review_required = True
        add_trace(doc, "validate", "unknown_type", {}, component="Validator")
    sub, tax, grand = _fnum(doc, "subtotal"), _fnum(doc, "tax"), _fnum(doc, "grand_total")

    # grand_total = subtotal + tax
    if all(x is not None for x in (sub, tax, grand)):
        computed = round(sub + tax, 2)
        tol = max(0.05, grand * 0.005)
        if abs(computed - grand) > tol:
            f = doc.fields["grand_total"]
            _flag_money_field(f, sub, tax, grand, computed)
            doc.review_required = True
            add_trace(doc, "validate", "arithmetic_fail",
                      {"computed": computed, "reported": grand}, component="Validator")
        else:
            add_trace(doc, "validate", "arithmetic_pass", {"computed": computed}, component="Validator")
    elif sub is not None and tax is not None and grand is None:
        _set_field(doc, "grand_total",
                   {"value": f"{sub + tax:.2f}", "raw_text": "derived", "bbox": [0, 0, 0, 0],
                    "page": 1, "ocr_conf": 0.0, "ambig": False, "reason": "derived from subtotal+tax"},
                   doc.quality.score, method="derived_arithmetic")
        doc.fields["grand_total"].extracted_value = ""
        add_trace(doc, "validate", "grand_total_derived", {"value": sub + tax}, component="Validator")

    # tax consistent with subtotal when rate known
    rate = None
    if "tax" in doc.fields:
        rawtax = doc.fields["tax"].raw_text or doc.fields["tax"].value
        m = re.search(r"(\d{1,2})\s*%", rawtax, re.I) or re.search(r"(\d{1,2})\s*%",
                       (doc.ocr_results[0].raw_text if doc.ocr_results else ""))
        if m:
            rate = float(m.group(1))
    if all(x is not None for x in (sub, tax)) and rate and rate > 0:
        expected = round(sub * rate / 100.0, 2)
        if abs(expected - tax) > max(0.5, expected * 0.005):
            doc.fields["tax"].reasons.append(
                f"Tax {tax:.2f} inconsistent with {rate:.0f}% of subtotal ({expected:.2f})")
            doc.review_required = True
            add_trace(doc, "validate", "tax_rate_mismatch", {"rate": rate, "expected": expected, "actual": tax},
                      component="Validator")

    # subtotal = sum(line totals)
    if doc.table and doc.table.rows and sub is not None:
        table_sum = 0.0
        for row in doc.table.rows:
            if not row.arithmetic_valid:
                doc.review_required = True
            if row.line_total:
                try:
                    table_sum += float(row.line_total.value.replace(",", ""))
                except Exception:
                    pass
        if table_sum > 0 and abs(table_sum - sub) > max(0.5, sub * 0.005):
            doc.fields["subtotal"].reasons.append(
                f"Table sum={table_sum:.2f} vs subtotal={sub:.2f}")
            doc.review_required = True
            add_trace(doc, "validate", "subtotal_table_mismatch",
                      {"table_sum": table_sum, "subtotal": sub}, component="Validator")

    for fld in doc.fields.values():
        if fld.status == FieldStatus.REVIEW_REQUIRED:
            doc.review_required = True
    add_trace(doc, "validate", "completed", {"review_required": doc.review_required}, component="Validator")


def _flag_money_field(f: FieldResult, sub, tax, grand: float, computed: float) -> None:
    f.status = FieldStatus.REVIEW_REQUIRED
    f.signals.business_rule_valid = False
    f.reliability = compute_reliability(f.signals, 1.0)
    f.reasons.append(f"Arithmetic mismatch: {sub:.2f}+{tax:.2f}={computed:.2f} vs {grand:.2f}")


# ---------------------------------------------------------------------------
# Tamper detection
# ---------------------------------------------------------------------------
def detect_tamper(doc: DocumentResult) -> None:
    signals: List[TamperSignal] = []
    today = datetime.utcnow()
    for fname in ("order_date", "invoice_date", "delivery_date", "due_date"):
        fld = doc.fields.get(fname)
        if fld and fld.value:
            try:
                parts = re.split(r"[/\-]", fld.value)
                if len(parts) == 3:
                    yr = int(parts[2]) if len(parts[2]) == 4 else int("20" + parts[2])
                    d = datetime(yr, int(parts[1]), int(parts[0]))
                    if fname in ("order_date", "invoice_date") and d > today:
                        signals.append(TamperSignal(
                            signal="FUTURE_DATE", severity="MEDIUM",
                            evidence=fld.value,
                            explanation=f"{fname} is in the future - suspicious"))
            except Exception:
                pass
    sub, tax, grand = _fnum(doc, "subtotal"), _fnum(doc, "tax"), _fnum(doc, "grand_total")
    if all(x is not None for x in (sub, tax, grand)) and abs((sub + tax) - grand) > grand * 0.05:
        signals.append(TamperSignal(
            signal="INCONSISTENT_TOTALS", severity="HIGH",
            evidence=f"sub={sub} tax={tax} grand={grand}",
            explanation="Grand total does not match subtotal+tax by >5%"))
    if doc.quality.status == DocumentQualityStatus.POOR and any(
            f.reliability > 0.85 for f in doc.fields.values()):
        signals.append(TamperSignal(
            signal="QUALITY_CONFIDENCE_MISMATCH", severity="LOW",
            evidence="poor quality image but high reliability",
            explanation="Image quality is poor but field confidence is high"))
    doc.tamper = TamperResult(status=TamperStatus.SUSPICIOUS if signals else TamperStatus.CLEAR,
                              signals=signals)
    add_trace(doc, "tamper_check", str(doc.tamper.status), {"signals": len(signals)}, component="TamperGuard")


# ---------------------------------------------------------------------------
# Integrity Verification
# ---------------------------------------------------------------------------
def verify_integrity(doc: DocumentResult, file_path: Path) -> None:
    if not file_path or not file_path.exists():
        doc.integrity_status = IntegrityStatus.UNKNOWN
        add_trace(doc, "verify_integrity", "UNKNOWN", {"reason": "File not found"}, component="IntegrityGuard")
        return
    current_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
    if current_hash == doc.provenance.content_hash:
        doc.integrity_status = IntegrityStatus.CLEAR
        add_trace(doc, "verify_integrity", "CLEAR", {}, component="IntegrityGuard")
    else:
        doc.integrity_status = IntegrityStatus.CHANGED
        doc.review_required = True
        doc.tamper.status = TamperStatus.SUSPICIOUS
        doc.tamper.signals.append(TamperSignal(
            signal="CONTENT_HASH_CHANGED", severity="HIGH",
            evidence=f"{current_hash[:8]}... != {doc.provenance.content_hash[:8]}...",
            explanation="The document bytes have changed since ingestion."
        ))
        add_trace(doc, "verify_integrity", "CHANGED", {"new_hash": current_hash}, component="IntegrityGuard")


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------
_SEEN: Dict[str, str] = {}


def detect_duplicate(doc: DocumentResult, seen_hashes: Optional[Dict[str, str]] = None) -> None:
    store = seen_hashes if seen_hashes is not None else _SEEN
    h = doc.provenance.content_hash
    existing = store.get(h)
    if existing and existing != doc.provenance.document_id:
        doc.duplicate = DuplicateResult(status=DuplicateStatus.EXACT, matched_document_id=existing,
                                         similarity=1.0, evidence="SHA-256 hash collision")
        doc.review_required = True
        add_trace(doc, "duplicate_check", "EXACT_DUPLICATE", {"matched": existing}, component="DuplicateGuard")
    else:
        store[h] = doc.provenance.document_id
        doc.duplicate = DuplicateResult(status=DuplicateStatus.CLEAR)
        add_trace(doc, "duplicate_check", "CLEAR", {}, component="DuplicateGuard")


# ---------------------------------------------------------------------------
# Reconciliation
# ---------------------------------------------------------------------------
_RECON_FIELDS = [
    ("po_number", "HIGH", True), ("vendor_name", "MEDIUM", True),
    ("buyer_name", "LOW", False), ("subtotal", "HIGH", True),
    ("tax", "MEDIUM", True), ("grand_total", "HIGH", True),
]


def _fval(doc: DocumentResult, fname: str) -> str:
    fld = doc.fields.get(fname)
    return (fld.normalized_value or fld.value or "").strip() if fld else ""


def _flag_for_review(doc: DocumentResult, fname: str, va: str, vb: str, status: ReconciliationStatus) -> None:
    fld = doc.fields.get(fname)
    if not fld:
        return
    fld.signals.cross_document_match = False
    fld.reliability = compute_reliability(fld.signals, doc.quality.score)
    if fld.status == FieldStatus.VALID:
        fld.status = FieldStatus.REVIEW_REQUIRED
        fld.reasons.append(f"Reconciliation {status}: {va} vs {vb}")
    fld.reasons.append(f"Recon {status}: {va} vs {vb}")


def _table_signature(doc: DocumentResult) -> List[Dict[str, str]]:
    if not doc.table:
        return []
    sig = []
    for row in doc.table.rows:
        sig.append({
            "description": (row.description.value if row.description else "").strip().lower(),
            "qty": row.quantity.value if row.quantity else "",
            "unit_price": row.unit_price.value if row.unit_price else "",
            "line_total": row.line_total.value if row.line_total else "",
        })
    return sig


def reconcile_documents(doc_a: DocumentResult, doc_b: DocumentResult) -> ReconciliationResult:
    entries: List[ReconciliationEntry] = []
    has_mismatch = False
    for fname, severity, numeric in _RECON_FIELDS:
        va, vb = _fval(doc_a, fname), _fval(doc_b, fname)
        if not va and not vb:
            continue
        diff_str = ""
        if not va or not vb:
            entries.append(ReconciliationEntry(field=fname, doc_a_value=va, doc_b_value=vb,
                                               status=ReconciliationStatus.MISSING,
                                               severity=severity, reason="Value missing on one side"))
            has_mismatch = True
            _flag_for_review(doc_a, fname, va, vb, ReconciliationStatus.MISSING)
            _flag_for_review(doc_b, fname, va, vb, ReconciliationStatus.MISSING)
            continue
        match = False
        if numeric:
            try:
                na, nb = float(va.replace(",", "")), float(vb.replace(",", ""))
                diff = abs(na - nb)
                match = diff <= max(0.05, max(abs(na), abs(nb)) * 0.005)
                diff_str = f"{diff:.2f}"
            except Exception:
                match = va.lower() == vb.lower()
        else:
            match = va.lower() == vb.lower()
        status = ReconciliationStatus.MATCH if match else ReconciliationStatus.MISMATCH
        entries.append(ReconciliationEntry(field=fname, doc_a_value=va, doc_b_value=vb,
                                           status=status, difference=diff_str, severity=severity,
                                           reason="" if match else "Values differ"))
        if match:
            for d in (doc_a, doc_b):
                fld = d.fields.get(fname)
                if fld:
                    fld.signals.cross_document_match = True
                    fld.reliability = compute_reliability(fld.signals, d.quality.score)
                    fld.reasons.append(f"Recon MATCH against {d.provenance.document_id[:8]}")
        else:
            has_mismatch = True
            _flag_for_review(doc_a, fname, va, vb, ReconciliationStatus.MISMATCH)
            _flag_for_review(doc_b, fname, va, vb, ReconciliationStatus.MISMATCH)

    # line-item reconciliation
    sig_a, sig_b = _table_signature(doc_a), _table_signature(doc_b)
    if sig_a and sig_b:
        detail = []
        mism = False
        for i, (sa, sb) in enumerate(zip(sig_a, sig_b), 1):
            if sa["description"] != sb["description"]:
                mism = True
                detail.append(f"row{i} desc differs: {sa['description']!r} vs {sb['description']!r}")
            for k in ("qty", "unit_price", "line_total"):
                if sa[k] != sb[k]:
                    mism = True
                    detail.append(f"row{i}.{k}: {sa[k]} vs {sb[k]}")
        status = ReconciliationStatus.MISMATCH if mism else (
            ReconciliationStatus.MATCH if len(sig_a) == len(sig_b) else ReconciliationStatus.AMBIGUOUS)
        if len(sig_a) != len(sig_b):
            detail.append(f"row counts differ: {len(sig_a)} vs {len(sig_b)}")
            mism = has_mismatch = True
        entries.append(ReconciliationEntry(
            field="line_items", doc_a_value=f"{len(sig_a)} rows", doc_b_value=f"{len(sig_b)} rows",
            status=status, severity="HIGH",
            reason="; ".join(detail) or "identical line items"))
        if status != ReconciliationStatus.MATCH:
            has_mismatch = True
    elif bool(sig_a) != bool(sig_b):
        entries.append(ReconciliationEntry(
            field="line_items", doc_a_value=f"{len(sig_a)} rows", doc_b_value=f"{len(sig_b)} rows",
            status=ReconciliationStatus.MISSING, severity="MEDIUM", reason="Table present on one side only"))
        has_mismatch = True

    if has_mismatch:
        overall = ReconciliationStatus.MISMATCH
    else:
        overall = ReconciliationStatus.MATCH
    result = ReconciliationResult(entries=entries, overall_status=overall, requires_review=has_mismatch)
    for d in (doc_a, doc_b):
        d.reconciliation = result
        d.review_required = d.review_required or has_mismatch
        add_trace(d, "reconcile", str(overall), {"pairs": len(entries)}, component="Reconciler")
        if has_mismatch:
            if d.overall_status == "VERIFIED":
                d.overall_status = "REVIEW_REQUIRED"
            add_trace(d, "review", "REVIEW_REQUIRED",
                      {"reason": f"reconciliation {overall}"}, component="HITL")
    return result


# ---------------------------------------------------------------------------
# Human correction
# ---------------------------------------------------------------------------
def apply_correction(doc: DocumentResult, field_name: str, new_value: str) -> None:
    fld = doc.fields.get(field_name)
    if fld is None:
        fld = FieldResult(name=field_name, value="", reliability=0.0,
                          status=FieldStatus.UNEXTRACTED)
        doc.fields[field_name] = fld
    old = fld.value
    fld.extracted_value = fld.extracted_value or old
    fld.value = new_value
    fld.normalized_value = _normalize_value(field_name, new_value)
    fld.signals.ocr = 1.0
    fld.signals.format_valid = bool(fld.normalized_value)
    fld.signals.business_rule_valid = True
    fld.signals.ambiguity_penalty = 0.0
    fld.reliability = compute_reliability(fld.signals, doc.quality.score)
    fld.status = FieldStatus.VALID if fld.normalized_value else FieldStatus.REVIEW_REQUIRED
    fld.reasons.append(f"Human corrected: {old!r} -> {new_value!r}")
    fld.extraction_method = "hitl_correction"
    doc.review_required = False  # self flag clear; validation re-evaluates
    add_trace(doc, "review", "correction_applied",
              {"field": field_name, "old": old, "new": new_value}, component="HITL")


# ---------------------------------------------------------------------------
# Finalize
# ---------------------------------------------------------------------------
def finalize(doc: DocumentResult) -> None:
    dt = doc.provenance.document_type
    if dt == DocumentType.UNKNOWN or (
            not doc.ocr_results or not doc.ocr_results[0].tokens):
        doc.overall_status = "REVIEW_REQUIRED" if doc.ocr_results and doc.ocr_results[0].tokens else "REJECTED"
        add_trace(doc, "finalize", str(doc.overall_status),
                  {"reason": "unknown document type or empty OCR"}, component="Validator")
        return
    mandatory = _MANDATORY.get(dt, [])
    missing = [f for f in mandatory if not doc.fields.get(f) or not doc.fields[f].value]
    if missing:
        doc.review_required = True
        doc.overall_status = "REVIEW_REQUIRED"
        add_trace(doc, "finalize", "REVIEW_REQUIRED", {"missing_mandatory": missing}, component="Validator")
        return
    any_review = doc.review_required or any(
        doc.fields.get(f, FieldResult(name=f)).status == FieldStatus.REVIEW_REQUIRED
        for f in mandatory)
    if any_review:
        doc.overall_status = "REVIEW_REQUIRED"
        add_trace(doc, "finalize", "REVIEW_REQUIRED", {"review_required": doc.review_required}, component="Validator")
        return
    doc.overall_status = "VERIFIED"
    doc.review_required = False
    add_trace(doc, "finalize", "VERIFIED", {"reason": "all backend gates passed"}, component="Validator")


def run_agent_loop(doc: DocumentResult) -> None:
    add_trace(doc, "finalize", "RUN", {"stage": "agent_loop"}, component="Planner")
    finalize(doc)


# ---------------------------------------------------------------------------
# Pipeline entry point
# ---------------------------------------------------------------------------
def process_document(file_path, doc_type: str = "unknown", filename: str = "") -> DocumentResult:
    file_path = Path(file_path)
    if not filename:
        filename = file_path.name
    data = file_path.read_bytes()
    content_hash = hashlib.sha256(data).hexdigest()
    doc_id = content_hash[:16]
    prov = DocumentProvenance(
        document_id=doc_id,
        content_hash=content_hash,
        ocr_engine=OCR_ENGINE,
        ocr_engine_version=OCR_ENGINE_VERSION,
        mime_type="application/pdf" if file_path.suffix.lower() == ".pdf" else "image",
    )
    doc = DocumentResult(provenance=prov)
    add_trace(doc, "ingest", "completed", {"file": filename, "size": len(data)}, component="Ingest")
    pages = render_pages(file_path)
    doc.provenance.page_count = len(pages)
    all_tokens: List[OCRToken] = []
    all_text = ""
    for idx, img in enumerate(pages, 1):
        if idx == 1:
            dispatch_tool(ToolRequest(tool_name="document.assess_quality",
                                      document_id=doc_id, requester="agent"), doc, image=img)
            add_trace(doc, "quality", str(doc.quality.status),
                      {"score": doc.quality.score}, component="QualityGate")
        pre = preprocess_image(img)
        add_trace(doc, "preprocess", "completed", {"page": idx}, component="Preprocessor")
        ocr_res = perform_ocr(img, idx)
        doc.ocr_results.append(ocr_res)
        all_tokens.extend(ocr_res.tokens)
        all_text += " " + ocr_res.raw_text
        add_trace(doc, "ocr", "completed",
                  {"page": idx, "tokens": len(ocr_res.tokens), "mean_conf": ocr_res.mean_confidence},
                  component="OCR")
    if not all_tokens:
        add_trace(doc, "ocr", "EMPTY", {"engine": OCR_ENGINE}, component="OCR")
    all_text = all_text.strip()
    doc.provenance.ocr_engine = OCR_ENGINE
    doc.provenance.ocr_engine_version = OCR_ENGINE_VERSION

    dispatch_tool(ToolRequest(tool_name="document.classify", document_id=doc_id,
                              payload={"text": all_text, "filename": filename},
                              requester="agent"), doc)
    add_trace(doc, "classify", "completed",
              {"type": str(doc.provenance.document_type),
               "method": doc.provenance.classification_method}, component="Classifier")
    dispatch_tool(ToolRequest(tool_name="document.extract_fields", document_id=doc_id,
                              payload={}, requester="agent"),
                  doc, ocr_tokens=all_tokens)
    dispatch_tool(ToolRequest(tool_name="document.extract_table", document_id=doc_id,
                              payload={}, requester="agent"), doc)
    dispatch_tool(ToolRequest(tool_name="document.validate", document_id=doc_id,
                              payload={}, requester="agent"), doc)
    dispatch_tool(ToolRequest(tool_name="document.detect_tamper", document_id=doc_id,
                              payload={}, requester="agent"), doc)
    dispatch_tool(ToolRequest(tool_name="document.detect_duplicate", document_id=doc_id,
                              payload={}, requester="agent"), doc)
    run_agent_loop(doc)
    return doc


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
DATA_ROOT = Path(".data")
DATA_ROOT.mkdir(exist_ok=True)


def save_result(doc_res: DocumentResult) -> Path:
    out = DATA_ROOT / f"{doc_res.provenance.document_id}.json"
    out.write_text(doc_res.to_json(), encoding="utf-8")
    return out


def load_result(document_id: str) -> Optional[DocumentResult]:
    p = DATA_ROOT / f"{document_id}.json"
    if not p.exists():
        return None
    return DocumentResult.model_validate_json(p.read_text())


# ---------------------------------------------------------------------------
# Optional adapters (Redis / Qdrant) — never block the demo
# ---------------------------------------------------------------------------
def infra_status() -> Dict[str, Any]:
    status = {"redis": {"status": "DEGRADED", "detail": "server not probed (optional)"},
              "qdrant": {"status": "DEGRADED", "detail": "server not probed (optional)"},
              "vector_store": "none"}
    try:
        import redis as _r
        r = _r.Redis(host="localhost", port=6379, socket_connect_timeout=0.5)
        ping = r.ping()
        status["redis"] = {"status": "READY" if ping else "DEGRADED",
                           "detail": "ping ok" if ping else "ping failed"}
    except Exception as e:
        status["redis"] = {"status": "DEGRADED", "detail": str(e.__class__.__name__)}
    try:
        from qdrant_client import QdrantClient
        q = QdrantClient(host="localhost", port=6333, timeout=0.5)
        q.get_collections()
        status["qdrant"] = {"status": "READY", "detail": "collections ok"}
    except Exception as e:
        status["qdrant"] = {"status": "DEGRADED", "detail": str(e.__class__.__name__)}
    return status