from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = ROOT / "02 원고" / "02_번역_마스터.md"
OUTPUT_PATH = ROOT / "web" / "data" / "manuscript.json"

NOTE_REF_RE = re.compile(r"\[\^(\d+)\]")
ORDERED_LIST_RE = re.compile(r"^(\d+)\.\s+(.*)$")
UNORDERED_LIST_RE = re.compile(r"^-\s+(.*)$")
TRAILING_URL_PUNCT = set(',.;!?:\'"”’')
URL_SAFE_CHARS = set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    "._~:/?#[]@!$&'()*+,;=%-"
)


def append_text(tokens: list[dict[str, object]], text: str) -> None:
    if not text:
        return
    if tokens and tokens[-1]["type"] == "text":
        tokens[-1]["text"] = f"{tokens[-1]['text']}{text}"
        return
    tokens.append({"type": "text", "text": text})


def trim_url(raw_url: str) -> tuple[str, str]:
    url = raw_url
    trailing = ""

    while url:
        last = url[-1]
        should_trim = False

        if last in TRAILING_URL_PUNCT:
            should_trim = True
        elif last == ")" and url.count("(") < url.count(")"):
            should_trim = True
        elif last == "]" and url.count("[") < url.count("]"):
            should_trim = True

        if not should_trim:
            break

        trailing = last + trailing
        url = url[:-1]

    return url, trailing


def find_next_url(text: str, start_index: int) -> tuple[int, int, str] | None:
    candidates = [
        index
        for index in (text.find("https://", start_index), text.find("http://", start_index))
        if index != -1
    ]
    if not candidates:
        return None

    start = min(candidates)
    end = start
    while end < len(text):
        char = text[end]
        if ord(char) >= 128 or char not in URL_SAFE_CHARS:
            break
        end += 1

    return start, end, text[start:end]


def tokenize_inline(text: str) -> list[dict[str, object]]:
    tokens: list[dict[str, object]] = []
    cursor = 0

    while cursor < len(text):
        note_match = NOTE_REF_RE.search(text, cursor)
        url_match = find_next_url(text, cursor)

        next_kind = None
        next_match = None

        if note_match and url_match:
            if note_match.start() <= url_match[0]:
                next_kind = "note"
                next_match = note_match
            else:
                next_kind = "url"
                next_match = url_match
        elif note_match:
            next_kind = "note"
            next_match = note_match
        elif url_match:
            next_kind = "url"
            next_match = url_match

        if next_match is None:
            append_text(tokens, text[cursor:])
            break

        next_start = next_match.start() if next_kind == "note" else next_match[0]
        append_text(tokens, text[cursor:next_start])

        if next_kind == "note":
            number = int(next_match.group(1))
            tokens.append(
                {
                    "type": "noteRef",
                    "text": str(number),
                    "noteNumber": number,
                }
            )
            cursor = next_match.end()
            continue

        _, next_end, raw_url = next_match
        clean_url, trailing = trim_url(raw_url)
        tokens.append(
            {
                "type": "link",
                "text": clean_url,
                "href": clean_url,
            }
        )
        append_text(tokens, trailing)
        cursor = next_end

    return tokens


def next_nonempty(lines: list[str], start_index: int) -> tuple[int, str]:
    for index in range(start_index, len(lines)):
        line = lines[index].strip()
        if line:
            return index, line
    raise ValueError("Expected a non-empty line in manuscript.")


def make_block(block_type: str, block_id: str, **extra: object) -> dict[str, object]:
    block: dict[str, object] = {"type": block_type, "id": block_id}
    block.update(extra)
    return block


def parse_blocks(lines: Iterable[str]) -> list[dict[str, object]]:
    blocks: list[dict[str, object]] = []
    in_endnotes = False
    asterism_index = 0
    section_index = 0
    block_index = 0

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith("## "):
            heading_text = line[3:].strip()
            if heading_text == "미주":
                in_endnotes = True
                blocks.append(
                    make_block(
                        "endnoteHeading",
                        "endnotes",
                        text=heading_text,
                        tokens=tokenize_inline(heading_text),
                    )
                )
                continue

            section_index += 1
            blocks.append(
                make_block(
                    "section",
                    f"section-{section_index}",
                    text=heading_text,
                    tokens=tokenize_inline(heading_text),
                )
            )
            continue

        if line == "* * *":
            asterism_index += 1
            blocks.append(make_block("asterism", f"asterism-{asterism_index}", text=line))
            continue

        if in_endnotes:
            match = ORDERED_LIST_RE.match(line)
            if not match:
                raise ValueError(f"Unexpected endnote line: {line}")

            note_number = int(match.group(1))
            blocks.append(
                make_block(
                    "endnote",
                    f"note-{note_number}",
                    noteNumber=note_number,
                    tokens=tokenize_inline(match.group(2)),
                )
            )
            continue

        unordered_match = UNORDERED_LIST_RE.match(line)
        ordered_match = ORDERED_LIST_RE.match(line)

        if unordered_match:
            block_index += 1
            blocks.append(
                make_block(
                    "listItem",
                    f"block-{block_index}",
                    ordered=False,
                    marker="-",
                    tokens=tokenize_inline(unordered_match.group(1)),
                )
            )
            continue

        if ordered_match:
            block_index += 1
            ordinal = int(ordered_match.group(1))
            blocks.append(
                make_block(
                    "listItem",
                    f"block-{block_index}",
                    ordered=True,
                    ordinal=ordinal,
                    marker=f"{ordinal}.",
                    tokens=tokenize_inline(ordered_match.group(2)),
                )
            )
            continue

        block_index += 1
        blocks.append(
            make_block(
                "paragraph",
                f"block-{block_index}",
                tokens=tokenize_inline(line),
            )
        )

    return blocks


def build_payload(markdown: str) -> dict[str, object]:
    lines = markdown.splitlines()
    title_index, title_line = next_nonempty(lines, 0)
    if not title_line.startswith("# "):
        raise ValueError("The manuscript title line must start with '# '.")

    subtitle_index, subtitle_line = next_nonempty(lines, title_index + 1)
    date_index, date_line = next_nonempty(lines, subtitle_index + 1)

    payload = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "source": str(SOURCE_PATH.relative_to(ROOT)).replace("\\", "/"),
        },
        "cover": {
            "titleTokens": tokenize_inline(title_line[2:].strip()),
            "subtitleTokens": tokenize_inline(subtitle_line),
            "dateTokens": tokenize_inline(date_line),
            "coverImage": "assets/cover.png",
        },
        "blocks": parse_blocks(lines[date_index + 1 :]),
    }
    return payload


def main() -> None:
    manuscript = SOURCE_PATH.read_text(encoding="utf-8")
    payload = build_payload(manuscript)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Wrote {OUTPUT_PATH}")
    print(f"Blocks: {len(payload['blocks'])}")


if __name__ == "__main__":
    main()
