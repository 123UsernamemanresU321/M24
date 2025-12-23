#!/usr/bin/env python3
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET


DOT_COLORS = {
    "red",
    "#ff0000",
    "#d00000",
    "#e85d04",
    "#f29f05",
    "#f6d32d",
}
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)


def parse_style(style_value: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in style_value.split(";"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        result[key.strip()] = value.strip()
    return result


def normalize_color(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower()


def is_dot_color(value: str | None) -> bool:
    normalized = normalize_color(value)
    if not normalized:
        return False
    if normalized in DOT_COLORS:
        return True
    if normalized.startswith("rgb("):
        numbers = parse_numbers(normalized)
        if len(numbers) >= 3:
            r, g, b = numbers[0], numbers[1], numbers[2]
            if r >= 80 and b <= 30:
                return True
    return False


def parse_numbers(value: str) -> list[float]:
    return [float(num) for num in re.findall(r"-?\d+(?:\.\d+)?", value)]


def bbox_from_path(d: str) -> tuple[float, float] | None:
    numbers = parse_numbers(d)
    if len(numbers) < 4:
        return None
    xs = numbers[0::2]
    ys = numbers[1::2]
    if not xs or not ys:
        return None
    return max(xs) - min(xs), max(ys) - min(ys)


def strip_ns(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def has_dot_marker(element: ET.Element) -> bool:
    marker = (element.get("id") or "") + " " + (element.get("class") or "")
    return "dot" in marker.lower()


def ensure_viewbox(root: ET.Element) -> None:
    if root.get("viewBox"):
        return
    width = root.get("width")
    height = root.get("height")
    if not width or not height:
        return
    w = parse_numbers(width)
    h = parse_numbers(height)
    if not w or not h:
        return
    root.set("viewBox", f"0 0 {w[0]} {h[0]}")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: postprocess-card-template.py <svg>")
        return 1

    svg_path = Path(sys.argv[1])
    text = svg_path.read_text(encoding="utf-8")

    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        print("Warning: SVG parse failed; skipping postprocess.")
        return 0

    view_box = root.get("viewBox", "0 0 100 100").split()
    try:
        width = float(view_box[2])
        height = float(view_box[3])
    except (ValueError, IndexError):
        width = 100.0
        height = 100.0
    dot_max = min(width, height) * 0.06

    removed = 0
    suspicious = 0

    for parent in root.iter():
        for child in list(parent):
            tag = strip_ns(child.tag)
            if tag == "g" and has_dot_marker(child):
                parent.remove(child)
                removed += 1
                continue
            if tag == "text":
                parent.remove(child)
                removed += 1
                continue

            if tag not in {"circle", "path"}:
                continue

            fill = child.get("fill")
            style = parse_style(child.get("style", "")) if child.get("style") else {}
            fill = fill or style.get("fill")
            if not is_dot_color(fill):
                continue

            is_dot = False
            if tag == "circle":
                r_value = child.get("r")
                if r_value:
                    numbers = parse_numbers(r_value)
                    if numbers and numbers[0] * 2 <= dot_max:
                        is_dot = True
            else:
                d_value = child.get("d")
                if d_value:
                    bbox = bbox_from_path(d_value)
                    if bbox and bbox[0] <= dot_max and bbox[1] <= dot_max:
                        is_dot = True

            if is_dot:
                parent.remove(child)
                removed += 1

    ensure_viewbox(root)

    cleaned = ET.tostring(root, encoding="unicode")
    svg_path.write_text(cleaned, encoding="utf-8")

    # Re-scan to ensure no dot-like elements remain.
    try:
        root = ET.fromstring(cleaned)
    except ET.ParseError:
        print("Warning: SVG parse failed after cleanup.")
        return 0

    for child in root.iter():
        tag = strip_ns(child.tag)
        if tag not in {"circle", "path"}:
            continue
        fill = child.get("fill")
        style = parse_style(child.get("style", "")) if child.get("style") else {}
        fill = fill or style.get("fill")
        if not is_dot_color(fill):
            continue
        if tag == "circle":
            r_value = child.get("r")
            if r_value:
                numbers = parse_numbers(r_value)
                if numbers and numbers[0] * 2 <= dot_max:
                    suspicious += 1
        else:
            d_value = child.get("d")
            if d_value:
                bbox = bbox_from_path(d_value)
                if bbox and bbox[0] <= dot_max and bbox[1] <= dot_max:
                    suspicious += 1

    if suspicious > 0:
        print("Dot-like circles remain in the template SVG.")
        print("Update assets-src/card-template.mp or adjust dot removal rules.")
        return 2

    if removed == 0:
        print("Postprocess complete. No dot elements removed.")
    else:
        print(f"Postprocess complete. Removed {removed} dot/text elements.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
