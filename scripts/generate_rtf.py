from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "02 원고" / "02_번역_마스터.md"
OUTPUT_PATH = ROOT / "02 원고" / "03_인디자인용_RTF.rtf"
NOTE_RE = re.compile(r"\[\^(\d+)\]")


def escape_text(text: str) -> str:
    text = text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")
    chunks: list[str] = []
    for char in text:
        code = ord(char)
        if code <= 0x7F:
            chunks.append(char)
        else:
            signed = code if code < 0x8000 else code - 0x10000
            chunks.append(f"\\u{signed}?")
    return "".join(chunks)


def render_inline(text: str) -> str:
    pieces: list[str] = []
    cursor = 0
    for match in NOTE_RE.finditer(text):
        pieces.append(escape_text(text[cursor:match.start()]))
        pieces.append(r"\super " + escape_text(match.group(1)) + r"\nosupersub ")
        cursor = match.end()
    pieces.append(escape_text(text[cursor:]))
    return "".join(pieces)


def style_name_to_id() -> dict[str, int]:
    return {
        "Title": 1,
        "Subtitle": 2,
        "SectionHead": 3,
        "Body": 4,
        "List": 5,
        "EndnoteHead": 6,
        "EndnoteBody": 7,
    }


def paragraph(style: str, text: str) -> str:
    style_id = style_name_to_id()[style]
    return rf"\pard\s{style_id} {render_inline(text)}\par" + "\n"


def parse_markdown(lines: list[str]) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    buffered: list[str] = []
    front_matter_index = 0
    in_endnotes = False

    def flush_buffer() -> None:
        nonlocal front_matter_index
        if not buffered:
            return
        text = " ".join(part.strip() for part in buffered).strip()
        buffered.clear()
        if not text:
            return
        if front_matter_index == 0:
            blocks.append(("Subtitle", text))
        elif front_matter_index == 1:
            blocks.append(("Subtitle", text))
        else:
            blocks.append(("Body", text))
        front_matter_index += 1

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            flush_buffer()
            continue

        if stripped.startswith("# "):
            flush_buffer()
            blocks.append(("Title", stripped[2:].strip()))
            front_matter_index = 0
            continue

        if stripped.startswith("## "):
            flush_buffer()
            heading = stripped[3:].strip()
            if heading == "미주":
                in_endnotes = True
                blocks.append(("EndnoteHead", heading))
            else:
                blocks.append(("SectionHead", heading))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            flush_buffer()
            blocks.append(("EndnoteBody" if in_endnotes else "List", stripped))
            continue

        if stripped.startswith("- "):
            flush_buffer()
            blocks.append(("List", stripped))
            continue

        buffered.append(stripped)

    flush_buffer()
    return blocks


def build_rtf(blocks: list[tuple[str, str]]) -> str:
    header = r"""{\rtf1\ansi\deff0
{\fonttbl
{\f0\fnil\fcharset129 Malgun Gothic;}
}
{\stylesheet
{\s0 Normal;}
{\s1\sb240\sa180\b\fs40 Title;}
{\s2\sb120\sa120\i\fs24 Subtitle;}
{\s3\sb240\sa120\b\fs28 SectionHead;}
{\s4\sb120\sa120\fs22 Body;}
{\s5\li360\sb60\sa60\fs22 List;}
{\s6\sb240\sa120\b\fs24 EndnoteHead;}
{\s7\li360\sb60\sa60\fs20 EndnoteBody;}
}
\viewkind4\uc1
"""
    body = "".join(paragraph(style, text) for style, text in blocks)
    return header + body + "}\n"


def main() -> None:
    blocks = parse_markdown(INPUT_PATH.read_text(encoding="utf-8").splitlines())
    OUTPUT_PATH.write_text(build_rtf(blocks), encoding="utf-8")


if __name__ == "__main__":
    main()
