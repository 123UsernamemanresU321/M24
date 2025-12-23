#!/usr/bin/env bash
set -euo pipefail

missing=0
optional_missing=0

check_cmd() {
  local name="$1"
  local desc="$2"
  if command -v "$name" >/dev/null 2>&1; then
    printf "[ok] %s (%s)\n" "$name" "$desc"
  else
    printf "[missing] %s (%s)\n" "$name" "$desc"
    missing=1
  fi
}

printf "Checking card art tooling...\n\n"

check_cmd "mpost" "MetaPost (part of TeX Live / MacTeX)"
check_cmd "python3" "Python 3 (SVG postprocess)"

if command -v latexmk >/dev/null 2>&1; then
  printf "[ok] latexmk (LaTeX build tool)\n"
elif command -v pdflatex >/dev/null 2>&1; then
  printf "[ok] pdflatex (LaTeX engine)\n"
elif command -v lualatex >/dev/null 2>&1; then
  printf "[ok] lualatex (LaTeX engine)\n"
else
  printf "[missing] latexmk/pdflatex/lualatex (LaTeX engine, PDF fallback only)\n"
  optional_missing=1
fi

if command -v pdf2svg >/dev/null 2>&1; then
  printf "[ok] pdf2svg (PDF -> SVG)\n"
elif command -v inkscape >/dev/null 2>&1; then
  printf "[ok] inkscape (PDF -> SVG)\n"
elif command -v dvisvgm >/dev/null 2>&1; then
  printf "[ok] dvisvgm (PDF -> SVG)\n"
elif command -v cairosvg >/dev/null 2>&1; then
  printf "[ok] cairosvg (PDF -> SVG)\n"
else
  printf "[missing] pdf2svg/inkscape/dvisvgm/cairosvg (PDF -> SVG, fallback only)\n"
  optional_missing=1
fi

if [ "$missing" -ne 0 ]; then
  printf "\nSome tools are missing. Install suggestions (macOS):\n"
  printf "- MacTeX (mpost, latexmk, dvisvgm): brew install --cask mactex\n"
  printf "- Python 3: brew install python\n"
  printf "- pdf2svg: brew install pdf2svg\n"
  printf "- Inkscape: brew install --cask inkscape\n"
  printf "- CairoSVG (python): pip3 install cairosvg\n"
  exit 1
fi

if [ "$optional_missing" -ne 0 ]; then
  printf "\nOptional tools are missing. The pipeline may still work if MetaPost outputs SVG directly.\n"
fi

printf "\nAll required tools found.\n"
