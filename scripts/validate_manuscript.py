from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "02 원고" / "source"
TRANSLATED_DIR = ROOT / "02 원고" / "translated"
MASTER_PATH = ROOT / "02 원고" / "02_번역_마스터.md"
NOTE_RE = re.compile(r"\[\^(\d+)\]")
HEADING_RE = re.compile(r"^##\s+", re.MULTILINE)


def note_numbers(text: str) -> list[int]:
    return [int(match.group(1)) for match in NOTE_RE.finditer(text)]


def headings(text: str) -> list[str]:
    return [line for line in text.splitlines() if line.startswith("## ")]


def validate_chunk(source_name: str, translated_name: str) -> list[str]:
    source_text = (SOURCE_DIR / source_name).read_text(encoding="utf-8")
    translated_text = (TRANSLATED_DIR / translated_name).read_text(encoding="utf-8")
    errors: list[str] = []

    source_headings = headings(source_text)
    translated_headings = headings(translated_text)
    if len(source_headings) != len(translated_headings):
        errors.append(
            f"{translated_name}: heading count mismatch ({len(source_headings)} expected, {len(translated_headings)} found)"
        )

    source_notes = note_numbers(source_text)
    translated_notes = note_numbers(translated_text)
    if source_notes != translated_notes:
        errors.append(f"{translated_name}: note markers do not match source order")

    return errors


def validate_master() -> list[str]:
    text = MASTER_PATH.read_text(encoding="utf-8")
    errors: list[str] = []

    if "## 미주" not in text:
        errors.append("Master manuscript is missing the endnotes heading `## 미주`.")

    note_lines = [line for line in text.splitlines() if re.match(r"^\d+\.\s+", line)]
    expected = [str(number) for number in range(1, 30)]
    actual = [line.split(".", 1)[0] for line in note_lines[-29:]]
    if actual != expected:
        errors.append("Master manuscript endnote numbering is not a clean 1-29 sequence.")

    return errors


def main() -> None:
    pairs = [
        ("01_chunk_a_source.md", "01_chunk_a_translation.md"),
        ("02_chunk_b_source.md", "02_chunk_b_translation.md"),
        ("03_chunk_c_source.md", "03_chunk_c_translation.md"),
    ]

    errors: list[str] = []
    for source_name, translated_name in pairs:
        errors.extend(validate_chunk(source_name, translated_name))

    if MASTER_PATH.exists():
        errors.extend(validate_master())

    if errors:
        for error in errors:
            print(error)
        raise SystemExit(1)

    print("Validation passed.")


if __name__ == "__main__":
    main()
