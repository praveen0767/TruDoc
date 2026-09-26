import streamlit as st
from pathlib import Path

from backend.app.pipeline import (
    process_document, save_result, load_result,
    reconcile_documents, apply_correction, validate_fields, dispatch_tool,
)
from backend.app.models import (
    DocumentResult, FieldStatus, TamperStatus, DuplicateStatus,
    ReconciliationStatus, DocumentQualityStatus, ToolRequest,
)


st.set_page_config(page_title="Trusted Document Intelligence", layout="wide")


def _badge(s: str) -> str:
    s_up = s.upper()
    ok = {"VALID", "VERIFIED", "MATCH", "CLEAR", "GOOD"}
    warn = {"REVIEW_REQUIRED", "DEGRADED", "SUSPICIOUS", "MISMATCH", "MISSING", "AMBIGUOUS"}
    if any(x in s_up for x in ok): return "\u2705"
    if any(x in s_up for x in warn): return "\u26a0\ufe0f"
    return "\u274c"


def _rel_bar(r: float) -> str:
    pct = int(r * 100)
    color = "green" if r >= 0.7 else "orange" if r >= 0.4 else "red"
    return (f'<div style="background:#eee;border-radius:4px;height:10px;width:100%;">'
            f'<div style="background:{color};height:10px;border-radius:4px;width:{pct}%"></div></div>'
            f'<small>{pct}% reliability</small>')


# --- Sidebar infrastructure ---
with st.sidebar:
    st.header("Infrastructure")
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
        st.success("Tesseract: connected")
    except Exception as e:
        st.error(f"Tesseract: {e}")
    try:
        import redis as _redis
        _redis.Redis(host="localhost", port=6379, socket_connect_timeout=0.5).ping()
        st.success("Redis: connected")
    except Exception:
        st.warning("Redis: degraded (optional)")
    try:
        from qdrant_client import QdrantClient
        QdrantClient(host="localhost", port=6333, timeout=0.5).get_collections()
        st.success("Qdrant: connected")
    except Exception:
        st.warning("Qdrant: degraded (optional)")


st.title("\U0001f50d Trusted Document Intelligence Engine")
st.caption("Extract \u2192 Reason \u2192 Validate \u2192 Reconcile \u2192 Decide \u2192 Review \u2192 Verify")

uploaded_files = st.file_uploader(
    "Upload PO and / or Invoice  (PDF, PNG, JPG)",
    type=["pdf", "png", "jpg", "jpeg"],
    accept_multiple_files=True,
)

if not uploaded_files:
    st.info("Upload one or more documents to begin processing.")
    st.stop()

tmp_dir = Path(".tmp_uploads")
tmp_dir.mkdir(parents=True, exist_ok=True)

results: list = []
for uploaded in uploaded_files:
    fpath = tmp_dir / uploaded.name
    fpath.write_bytes(uploaded.getvalue())
    with st.spinner(f"Processing {uploaded.name} ..."):
        doc = process_document(fpath, filename=uploaded.name)
        save_result(doc)
    results.append(doc)


for doc in results:
    dt = str(doc.provenance.document_type).replace("DocumentType.", "").replace("_", " ").title()
    qs = str(doc.quality.status).replace("DocumentQualityStatus.", "")

    st.header(f"{_badge(doc.overall_status)} {dt} \u2014 ID: {doc.provenance.document_id[:8]}")

    c1, c2 = st.columns(2)
    with c1:
        st.metric("Document Type", dt)
        st.metric("Overall Status", doc.overall_status)
        st.metric("Classification", doc.provenance.classification_method)
    with c2:
        st.metric("Quality", qs)
        st.metric("Quality Score", f"{doc.quality.score:.2f}")
        st.metric("Pages", doc.provenance.page_count)

    # Fields
    with st.expander("\U0001f9fe Extracted Fields", expanded=True):
        for fname, fld in doc.fields.items():
            if "UNEXTRACTED" in str(fld.status):
                continue
            badge = _badge(str(fld.status))
            st.markdown(f"**{badge} {fname}**: `{fld.value or '(empty)'}` &nbsp; norm: `{fld.normalized_value}`")
            st.markdown(_rel_bar(fld.reliability), unsafe_allow_html=True)
            if fld.evidence:
                ev = fld.evidence[0]
                st.caption(f"Evidence: {ev.text[:120]} | OCR conf: {ev.ocr_confidence:.2f} | bbox: {ev.bbox}")
            if fld.reasons:
                st.caption(" | ".join(fld.reasons))
            st.divider()

    # Table
    if doc.table and doc.table.rows:
        with st.expander("\U0001f4cb Line-Item Table"):
            rows_data = []
            for row in doc.table.rows:
                rows_data.append({
                    "Item": row.item.value if row.item else "",
                    "Description": row.description.value if row.description else "",
                    "Qty": row.quantity.value if row.quantity else "",
                    "Unit Price": row.unit_price.value if row.unit_price else "",
                    "Line Total": row.line_total.value if row.line_total else "",
                    "Arith OK": "\u2705" if row.arithmetic_valid else f"\u274c {row.arithmetic_note}",
                })
            st.dataframe(rows_data, use_container_width=True)

    # Tamper
    tamper_status = str(doc.tamper.status).replace("TamperStatus.", "")
    with st.expander(f"\U0001f50e Tamper Signals ({tamper_status})"):
        if doc.tamper.signals:
            for sig in doc.tamper.signals:
                st.warning(f"**{sig.signal}** [{sig.severity}]: {sig.explanation}  \n_Evidence_: {sig.evidence}")
        else:
            st.success("No tamper signals detected.")

    # Duplicate
    dup_status = str(doc.duplicate.status).replace("DuplicateStatus.", "")
    with st.expander(f"\U0001f4da Duplicate Check ({dup_status})"):
        if "CLEAR" not in dup_status:
            st.error(f"Matched: {doc.duplicate.matched_document_id} | Similarity: {doc.duplicate.similarity:.2f}\n{doc.duplicate.evidence}")
        else:
            st.success("No duplicate detected.")

    # Trace
    with st.expander("\U0001f9e0 Agent Trace (Planner \u2192 Retriever \u2192 Reasoner \u2192 Validator)"):
        ok_statuses = {"COMPLETED", "VERIFIED", "PLAN", "RETRIEVE", "PROPOSE",
                       "completed", "field_found", "arithmetic_pass", "CLEAR", "found"}
        for step in doc.trace:
            comp = step.get("component", step.get("stage", ""))
            status = step.get("status", "")
            b = "\u2705" if status in ok_statuses else "\u26a0\ufe0f"
            ts = step.get("timestamp", "")[11:19]
            st.text(f"{b} [{ts}] {comp}: {status}")
            if step.get("details"):
                st.caption(str(step["details"])[:200])

    # Human Review
    review_fields = {k: v for k, v in doc.fields.items()
                     if "REVIEW_REQUIRED" in str(v.status)}
    if review_fields:
        with st.expander(f"\U0001f9d1 Human Review Queue ({len(review_fields)} fields)", expanded=True):
            for fname, fld in review_fields.items():
                st.markdown(f"**{fname}** \u2014 current: `{fld.value or '(empty)'}` | reliability: {fld.reliability:.2f}")
                if fld.evidence:
                    st.caption(f"Source: {fld.evidence[0].text[:100]}")
                if fld.reasons:
                    st.caption("Reasons: " + " | ".join(fld.reasons))
                new_val = st.text_input(
                    f"Correct value for {fname}",
                    value=fld.value,
                    key=f"corr_{doc.provenance.document_id}_{fname}",
                )
                if st.button(f"Submit correction for {fname}",
                             key=f"sub_{doc.provenance.document_id}_{fname}"):
                    req = ToolRequest(
                        tool_name="document.apply_correction",
                        document_id=doc.provenance.document_id,
                        payload={"field": fname, "value": new_val},
                        requester="human_reviewer",
                    )
                    res = dispatch_tool(req, doc)
                    if res.success:
                        dispatch_tool(ToolRequest(
                            tool_name="document.revalidate",
                            document_id=doc.provenance.document_id,
                            requester="agent"), doc)
                        save_result(doc)
                        st.success(f"{fname} corrected and revalidated.")
                        st.rerun()
                    else:
                        st.error(f"Correction failed: {res.error}")


st.divider()

# Cross-document reconciliation
if len(results) >= 2:
    st.header("\U0001f4cb Cross-Document Reconciliation")
    doc_a, doc_b = results[0], results[1]
    recon = reconcile_documents(doc_a, doc_b)
    for entry in recon.entries:
        st_str = str(entry.status).replace("ReconciliationStatus.", "")
        badge = _badge(st_str)
        diff = f" (diff: {entry.difference})" if entry.difference else ""
        st.write(f"{badge} **{entry.field}**: `{entry.doc_a_value}` vs `{entry.doc_b_value}`{diff} \u2014 {st_str} [{entry.severity}]")
        if entry.reason:
            st.caption(entry.reason)
    overall = str(recon.overall_status).replace("ReconciliationStatus.", "")
    if recon.requires_review:
        st.error(f"Reconciliation: **{overall}** \u2014 REVIEW REQUIRED")
    else:
        st.success(f"Reconciliation: **{overall}**")

