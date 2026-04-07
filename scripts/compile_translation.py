from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRANSLATED_DIR = ROOT / "02 원고" / "translated"
OUTPUT_PATH = ROOT / "02 원고" / "02_번역_마스터.md"
CHUNKS = [
    "01_chunk_a_translation.md",
    "02_chunk_b_translation.md",
    "03_chunk_c_translation.md",
]


def main() -> None:
    parts = []
    for name in CHUNKS:
        path = TRANSLATED_DIR / name
        if not path.exists():
            raise FileNotFoundError(f"Missing translation chunk: {path}")
        parts.append(path.read_text(encoding="utf-8").strip())

    OUTPUT_PATH.write_text("\n\n".join(parts).strip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
