"""콘텐츠 데이터 검사 — site/data/contents.json

실행: python pipeline/validate.py
규칙은 docs/데이터_모양.md에 있다. 가장 중요한 규칙:
  라이선스가 없거나 만료된 콘텐츠는 게시하지 않는다 (기능요구서 F-03, F-17).

표준 라이브러리만 쓴다 (설치할 것 없음).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"

ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
TOPICS = {"work", "travel", "daily", "food", "health", "science", "culture", "sports", "news"}
LICENSE_KINDS = {"public_domain", "cc_by", "cc_by_sa", "contract", "own"}
OVERLAP_MS = 150   # 문장 경계 허용 오차 (비기능 요구사항)


def validate(data: dict, site_dir: Path = SITE, today: str | None = None) -> list[str]:
    """문제 목록을 돌려준다. 비어 있으면 통과."""
    today = today or dt.date.today().isoformat()
    errors: list[str] = []
    err = errors.append

    if data.get("format") != 1:
        err("format은 1이어야 합니다")

    licenses = {}
    for i, lic in enumerate(data.get("licenses", [])):
        where = f"licenses[{i}]"
        for key in ("id", "name", "kind", "holder", "terms_url", "checked_at", "attribution"):
            if not lic.get(key):
                err(f"{where}: '{key}' 칸이 비어 있습니다")
        lid = lic.get("id", "")
        if lid and not ID_RE.match(lid):
            err(f"{where}: id '{lid}'는 영문 소문자·숫자·하이픈만 씁니다")
        if lid in licenses:
            err(f"{where}: id '{lid}'가 겹칩니다")
        if lic.get("kind") and lic["kind"] not in LICENSE_KINDS:
            err(f"{where}: kind '{lic['kind']}'는 {sorted(LICENSE_KINDS)} 중 하나여야 합니다")
        for key in ("checked_at", "expires_at"):
            if lic.get(key) and not DATE_RE.match(lic[key]):
                err(f"{where}: {key}는 YYYY-MM-DD 모양이어야 합니다")
        licenses[lid] = lic

    seen_ids = set()
    for i, c in enumerate(data.get("contents", [])):
        where = f"contents[{i}] ({c.get('id', '?')})"
        for key in ("id", "title", "title_ko", "level", "topics", "license_id", "source_url", "audio", "sentences", "added_at"):
            if not c.get(key):
                err(f"{where}: '{key}' 칸이 비어 있습니다")
        if "reviewed" not in c:
            err(f"{where}: 'reviewed' 칸이 없습니다 (사람 확인 여부)")

        cid = c.get("id", "")
        if cid and not ID_RE.match(cid):
            err(f"{where}: id는 영문 소문자·숫자·하이픈만 씁니다")
        if cid in seen_ids:
            err(f"{where}: id가 겹칩니다")
        seen_ids.add(cid)

        if c.get("level") and c["level"] not in LEVELS:
            err(f"{where}: level은 A1~C2 중 하나여야 합니다")
        topics = c.get("topics") or []
        if not 1 <= len(topics) <= 3 or any(t not in TOPICS for t in topics):
            err(f"{where}: topics는 관심사 id 1~3개여야 합니다 ({', '.join(sorted(TOPICS))})")

        # 가장 중요한 규칙: 라이선스
        lic = licenses.get(c.get("license_id"))
        if not lic:
            err(f"{where}: 라이선스 '{c.get('license_id')}'가 licenses에 없습니다. 라이선스 없는 콘텐츠는 게시할 수 없습니다")
        elif lic.get("expires_at") and lic["expires_at"] < today:
            err(f"{where}: 라이선스 '{lic['id']}'가 {lic['expires_at']}에 만료됐습니다")

        audio = c.get("audio") or {}
        duration = audio.get("duration_ms")
        if not isinstance(duration, int) or duration <= 0:
            err(f"{where}: audio.duration_ms는 양의 정수여야 합니다")
            duration = None
        src = audio.get("src", "")
        if not src.startswith("audio/"):
            err(f"{where}: audio.src는 audio/ 폴더 안이어야 합니다")
        elif not (site_dir / src).is_file():
            err(f"{where}: 음성 파일 {src}가 없습니다")

        prev_end = None
        for j, s in enumerate(c.get("sentences") or []):
            sw = f"{where} 문장 {j + 1}"
            for key in ("en", "ko"):
                if not s.get(key, "").strip():
                    err(f"{sw}: '{key}' 칸이 비어 있습니다")
            start, end = s.get("start_ms"), s.get("end_ms")
            if not isinstance(start, int) or not isinstance(end, int):
                err(f"{sw}: start_ms·end_ms는 정수여야 합니다")
                continue
            if end <= start:
                err(f"{sw}: end_ms가 start_ms보다 커야 합니다")
            if prev_end is not None and start < prev_end - OVERLAP_MS:
                err(f"{sw}: 앞 문장과 {prev_end - start}ms 겹칩니다 (허용 {OVERLAP_MS}ms)")
            if duration is not None and end > duration + OVERLAP_MS:
                err(f"{sw}: 음성 길이({duration}ms)를 넘습니다")
            prev_end = end
    return errors


def main() -> int:
    path = SITE / "data" / "contents.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"실패 contents.json을 읽지 못했습니다: {e}")
        return 1
    errors = validate(data)
    for e in errors:
        print("실패 " + e)
    n = len(data.get("contents", []))
    print(f"통과 콘텐츠 {n}편, 라이선스 {len(data.get('licenses', []))}개" if not errors else f"문제 {len(errors)}건")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
