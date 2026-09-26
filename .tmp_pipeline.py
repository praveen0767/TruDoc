"""pipeline.py v2 — Document Intelligence Engine."""
from __future__ import annotations
import hashlib, re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from PIL import Image, ImageFilter, ImageOps

try:
    import pytesseract
    _OCR_AVAILABLE = True
    OCR_ENGINE = "pytesseract"
    try: OCR_ENGINE_VERSION = str(pytesseract.get_tesseract_version())
    except: OCR_ENGINE_VERSION = "unknown"
except:
    _OCR_AVAILABLE = False
    OCR_ENGINE = "none"
    OCR_ENGINE_VERSION = "0"

try:
    import fitz
    _PDF_AVAILABLE = True
except:
    _PDF_AVAILABLE = False

from .models import (
    DocumentProvenance, DocumentQuality, DocumentQualityStatus,
    DocumentResult, DocumentType, DuplicateResult, DuplicateStatus,
    EvidenceSource, FieldResult, FieldSignal, FieldStatus,
    OCRResult, OCRToken, QualitySignal, ReconciliationEntry,
    ReconciliationResult, ReconciliationStatus, RiskLevel,
    TableCell, TableResult, TableRow, TamperResult, TamperSignal,
    TamperStatus, ToolDefinition, ToolRequest, ToolResult,
    add_trace, compute_reliability,
)
