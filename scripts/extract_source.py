from __future__ import annotations

import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup, NavigableString, Tag


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "02 원고" / "source"
TRANSLATED_DIR = ROOT / "02 원고" / "translated"
URL = "https://darioamodei.com/essay/machines-of-loving-grace"


def normalize_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:?!])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"\s+([’”])", r"\1", text)
    text = re.sub(r"([“‘])\s+", r"\1", text)
    return text.strip()


def render_inline(node: Tag | NavigableString, *, footnote_mode: bool = False) -> str:
    if isinstance(node, NavigableString):
        return str(node)

    if node.name == "sup":
        number = normalize_text(node.get_text(" ", strip=True))
        return f"[^{number}]" if number.isdigit() else ""

    if node.name == "br":
        return "\n"

    if node.name == "a":
        label = normalize_text("".join(render_inline(child, footnote_mode=footnote_mode) for child in node.children))
        href = (node.get("href") or "").strip()
        if footnote_mode and href:
            if label and label != href:
                return f"{label} ({href})"
            return href
        return label or href

    pieces = [render_inline(child, footnote_mode=footnote_mode) for child in node.children]
    return "".join(pieces)


def render_list(tag: Tag, *, footnote_mode: bool = False) -> list[str]:
    items: list[str] = []
    ordered = tag.name == "ol"
    for index, item in enumerate(tag.find_all("li", recursive=False), start=1):
        prefix = f"{index}. " if ordered else "- "
        items.append(prefix + normalize_text(render_inline(item, footnote_mode=footnote_mode)))
    return items


def render_blocks(main_content: Tag) -> list[str]:
    lines: list[str] = [
        "# Machines of Loving Grace[^1]",
        "",
        "How AI Could Transform the World for the Better",
        "",
        "October 2024",
        "",
    ]

    for child in main_content.find_all(recursive=False):
        if child.name == "p":
            lines.extend([normalize_text(render_inline(child)), ""])
        elif child.name == "h2":
            lines.extend([f"## {normalize_text(render_inline(child))}", ""])
        elif child.name in {"ul", "ol"}:
            lines.extend(render_list(child))
            lines.append("")

    return lines


def render_afterword(afterword: Tag) -> list[str]:
    lines = ["* * *", ""]
    for child in afterword.find_all(recursive=False):
        if child.name == "p":
            lines.extend([normalize_text(render_inline(child)), ""])
    return lines


def render_footnotes(footnote_container: Tag) -> list[str]:
    lines = ["## Footnotes", ""]
    note_list = footnote_container.find("ol")
    if note_list is None:
        raise RuntimeError("Could not find footnote list in the official source page.")
    lines.extend(render_list(note_list, footnote_mode=True))
    lines.append("")
    return lines


def trim_trailing_blank_lines(lines: list[str]) -> list[str]:
    while lines and not lines[-1]:
        lines.pop()
    lines.append("")
    return lines


def write_text(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(trim_trailing_blank_lines(lines)), encoding="utf-8")


def split_chunks(lines: list[str]) -> dict[str, list[str]]:
    heading_two = "## 2. Neuroscience and mind"
    heading_four = "## 4. Peace and governance"

    try:
        split_b = lines.index(heading_two)
        split_c = lines.index(heading_four)
    except ValueError as exc:
        raise RuntimeError("Could not find expected chunk split headings in source output.") from exc

    return {
        "01_chunk_a_source.md": lines[:split_b],
        "02_chunk_b_source.md": lines[split_b:split_c],
        "03_chunk_c_source.md": lines[split_c:],
    }


def ensure_translation_stubs() -> None:
    placeholders = {
        "01_chunk_a_translation.md": [
            "# 사랑과 은총의 기계들[^1]",
            "",
            "AI가 세계를 더 나은 곳으로 바꿀 수 있는 방법",
            "",
            "2024년 10월",
            "",
            "<!-- 번역 A가 이 파일을 채웁니다. -->",
            "",
        ],
        "02_chunk_b_translation.md": [
            "<!-- 번역 B가 이 파일을 채웁니다. -->",
            "",
        ],
        "03_chunk_c_translation.md": [
            "<!-- 번역 C가 이 파일을 채웁니다. -->",
            "",
        ],
    }

    for name, lines in placeholders.items():
        path = TRANSLATED_DIR / name
        if not path.exists():
            write_text(path, lines)


def main() -> None:
    response = requests.get(URL, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.content.decode("utf-8"), "html.parser")

    container = soup.select_one("article > div.container.cc-narrow > section")
    if container is None:
        raise RuntimeError("Could not find article container in the official source page.")

    rich_text_blocks = container.select("div.rich-text.w-richtext")
    if len(rich_text_blocks) < 2:
        raise RuntimeError("Could not find expected body/afterword blocks in the official source page.")

    body_block = rich_text_blocks[0]
    afterword_block = rich_text_blocks[1]
    footnote_block = soup.select_one("div.rich-text.cc-footnotes.w-richtext")
    if footnote_block is None:
        raise RuntimeError("Could not find footnotes block in the official source page.")

    lines = []
    lines.extend(render_blocks(body_block))
    lines.extend(render_afterword(afterword_block))
    lines.extend(render_footnotes(footnote_block))

    write_text(SOURCE_DIR / "00_original_master.md", lines)

    for name, chunk_lines in split_chunks(lines).items():
        write_text(SOURCE_DIR / name, chunk_lines)

    ensure_translation_stubs()


if __name__ == "__main__":
    main()
