"""콘텐츠 넣기: 미리보기 → 승인 → 적용 (필드워드의 기존 항목 고치기 흐름과 같다)

  python pipeline/import_content.py voa-lle2-02-interview voa-travel-airports --preview
      → pipeline/reports/번역미리보기_날짜.md (사람이 읽고 승인)
  python pipeline/import_content.py voa-lle2-02-interview voa-travel-airports --apply
      → site/data/contents.json에 넣고 validate.py로 검사. 실패하면 되돌린다.

입력 (이름이 같아야 한다)
  pipeline/candidates/<이름>.aligned.json  문장 시각 (align.py가 만든다)
  pipeline/candidates/<이름>.ko.json       제목·수준·관심사·라이선스·한국어 번역
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAND = ROOT / "pipeline" / "candidates"
REPORTS = ROOT / "pipeline" / "reports"
DATA = ROOT / "site" / "data" / "contents.json"
sys.path.insert(0, str(ROOT / "pipeline"))
from validate import validate  # noqa: E402


def build(name: str, today: str) -> dict:
    aligned = json.loads((CAND / f"{name}.aligned.json").read_text(encoding="utf-8"))
    meta = json.loads((CAND / f"{name}.ko.json").read_text(encoding="utf-8"))
    sents, ko = aligned["sentences"], meta["ko"]
    if len(sents) != len(ko):
        raise ValueError(f"{name}: 영어 문장 {len(sents)}개와 번역 {len(ko)}개의 수가 다릅니다")
    sentences = []
    for s, k in zip(sents, ko):
        item = {"start_ms": s["start_ms"], "end_ms": s["end_ms"], "en": s["en"], "ko": k}
        if s.get("speaker"):
            item = {"start_ms": s["start_ms"], "end_ms": s["end_ms"], "speaker": s["speaker"], "en": s["en"], "ko": k}
        sentences.append(item)
    return {
        "id": name, "title": meta["title"], "title_ko": meta["title_ko"], "level": meta["level"],
        "topics": meta["topics"], "license_id": meta["license_id"], "source_url": meta["source_url"],
        "audio": {"src": aligned["audio"], "duration_ms": aligned["duration_ms"]},
        "added_at": today, "reviewed": True, "sentences": sentences,
    }


def ms(t: int) -> str:
    return f"{t // 60000}:{t // 1000 % 60:02d}.{t % 1000 // 100}"


def preview(names: list[str], today: str) -> Path:
    lines = [f"# 번역 미리보기 ({today})", "",
             "영어 원문(VOA)과 한국어 번역 초안, 문장 시각이다. 읽고 고칠 곳을 말해 주면 고친 뒤 넣는다.",
             "번역은 Claude 초안이다. 시각은 faster-whisper(base.en) 단어 시각을 원문에 맞춘 것이다.", ""]
    for name in names:
        c = build(name, today)
        lines += [f"## {c['title_ko']} — {c['title']}", "",
                  f"- 수준 {c['level']} · 관심사 {', '.join(c['topics'])} · 길이 {ms(c['audio']['duration_ms'])} · 문장 {len(c['sentences'])}개",
                  f"- 원문: {c['source_url']}", "",
                  "| # | 시각 | 화자 | 영어 | 한국어 초안 |", "|---|---|---|---|---|"]
        for i, s in enumerate(c["sentences"], 1):
            row = [str(i), ms(s["start_ms"]), s.get("speaker", ""), s["en"].replace("|", "/"), s["ko"].replace("|", "/")]
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = REPORTS / f"번역미리보기_{today}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def apply(names: list[str], today: str) -> int:
    before = DATA.read_text(encoding="utf-8")
    data = json.loads(before)
    by_id = {c["id"]: i for i, c in enumerate(data["contents"])}
    for name in names:
        c = build(name, today)
        if c["id"] in by_id:
            data["contents"][by_id[c["id"]]] = c       # 같은 id면 바꿔 넣는다
        else:
            data["contents"].append(c)
    errors = validate(data)
    if errors:
        print("검사 실패 — contents.json을 바꾸지 않았습니다")
        for e in errors:
            print("  " + e)
        return 1
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"넣었습니다: {', '.join(names)} (콘텐츠 {len(data['contents'])}편)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    names = [a for a in args if not a.startswith("--")]
    today = dt.date.today().isoformat()
    if "--preview" in args:
        print(preview(names, today).relative_to(ROOT))
    elif "--apply" in args:
        sys.exit(apply(names, today))
    else:
        print(__doc__)
