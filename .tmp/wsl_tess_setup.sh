#!/bin/bash
exec > /tmp/tess_setup.log 2>&1
set -x
apt-get update
apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng
echo "INSTALL_RC=$?"
which tesseract
tesseract --version
tesseract --list-langs
echo "SCRIPT_DONE"
