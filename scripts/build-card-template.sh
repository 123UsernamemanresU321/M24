#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/assets-src"
BUILD_DIR="$SRC_DIR/build"
OUT_DIR="$ROOT_DIR/client/src/assets"
OUT_SVG="$OUT_DIR/card-template.svg"

mkdir -p "$BUILD_DIR"
mkdir -p "$OUT_DIR"

if [ ! -f "$SRC_DIR/card-template.mp" ]; then
  echo "Missing $SRC_DIR/card-template.mp"
  exit 1
fi

if [ ! -f "$SRC_DIR/card-template.tex" ]; then
  echo "Missing $SRC_DIR/card-template.tex"
  exit 1
fi

if ! command -v mpost >/dev/null 2>&1; then
  echo "mpost not found. Run scripts/check-card-tooling.sh for install hints."
  exit 1
fi

cd "$SRC_DIR"

# Generate MetaPost output (.mps) as SVG when supported
mpost -s 'outputformat="svg"' card-template.mp

MPS="$BUILD_DIR/card-template-1.mps"
if [ ! -f "$MPS" ]; then
  echo "Expected MetaPost output not found: $MPS"
  exit 1
fi

if head -n 2 "$MPS" | grep -Fq "<?xml" || head -n 2 "$MPS" | grep -Fq "<svg"; then
  cp "$MPS" "$OUT_SVG"
else
  # Build PDF via LaTeX if MetaPost output isn't SVG.
  PDF="$BUILD_DIR/card-template.pdf"
  if command -v latexmk >/dev/null 2>&1; then
    latexmk -pdf -interaction=nonstopmode -output-directory="$BUILD_DIR" card-template.tex >/dev/null
  elif command -v pdflatex >/dev/null 2>&1; then
    pdflatex -interaction=nonstopmode -output-directory="$BUILD_DIR" card-template.tex >/dev/null
  elif command -v lualatex >/dev/null 2>&1; then
    lualatex -interaction=nonstopmode -output-directory="$BUILD_DIR" card-template.tex >/dev/null
  else
    echo "No LaTeX engine found. Run scripts/check-card-tooling.sh for install hints."
    exit 1
  fi

  if [ ! -f "$PDF" ]; then
    echo "Expected PDF not found: $PDF"
    exit 1
  fi

  # Convert PDF to SVG using the best available tool
  if command -v pdf2svg >/dev/null 2>&1; then
    pdf2svg "$PDF" "$OUT_SVG"
  elif command -v inkscape >/dev/null 2>&1; then
    inkscape "$PDF" --export-type=svg --export-filename="$OUT_SVG" >/dev/null
  elif command -v dvisvgm >/dev/null 2>&1; then
    dvisvgm --pdf --output="$OUT_SVG" "$PDF" >/dev/null
  elif command -v cairosvg >/dev/null 2>&1; then
    cairosvg "$PDF" -o "$OUT_SVG"
  else
    echo "No PDF->SVG converter found. Run scripts/check-card-tooling.sh for install hints."
    exit 1
  fi
fi

python3 "$ROOT_DIR/scripts/postprocess-card-template.py" "$OUT_SVG"

printf "Card template SVG written to %s\n" "$OUT_SVG"
