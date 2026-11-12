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
EXPR_TYPES = {"phrasal_verb", "idiom", "chunk", "word"}
MAX_EXPR_PER_SCENE = 4
SCENE_MAX_MS = {"A1": 30000, "A2": 30000, "B1": 60000, "B2": 120000, "C1": 120000, "C2": 120000}  # scenes.py와 같게


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

        # 장면: 빈틈없이 문장 전체를 순서대로 덮어야 한다. 한 장면은 수준별 최대 길이 이하
        # (한 문장이 최대보다 긴 경우만 예외). 규칙은 pipeline/scenes.py
        scenes = c.get("scenes")
        sents = c.get("sentences") or []
        if not scenes:
            err(f"{where}: 'scenes' 칸이 비어 있습니다")
        else:
            expect = 0
            max_ms = SCENE_MAX_MS.get(c.get("level"), 60000)
            for k, sc in enumerate(scenes):
                a, b = sc.get("from"), sc.get("to")
                if a != expect or not isinstance(b, int) or b < a or b >= len(sents):
                    err(f"{where} 장면 {k + 1}: 문장 {expect + 1}번부터 이어져야 합니다")
                    break
                length = sents[b]["end_ms"] - sents[a]["start_ms"]
                if length > max_ms and a != b:
                    err(f"{where} 장면 {k + 1}: {length / 1000:.0f}초로 {c.get('level')} 최대 {max_ms // 1000}초를 넘습니다")
                expect = b + 1
            else:
                if expect != len(sents):
                    err(f"{where}: 장면이 마지막 문장까지 덮지 않습니다")

        # 표현 익히기 (있을 때만). 장면마다 최대 4개: 작업 기억이 한 번에 다루는 덩어리 약 4개 (Cowan, 2001)
        per_scene: dict[int, int] = {}
        for e_i, ex in enumerate(c.get("expressions") or []):
            ew = f"{where} 표현 {e_i + 1} ({ex.get('text', '?')})"
            k, si = ex.get("scene"), ex.get("sentence")
            if not isinstance(k, int) or not scenes or not 0 <= k < len(scenes):
                err(f"{ew}: 장면 번호가 없습니다")
                continue
            if not isinstance(si, int) or not scenes[k]["from"] <= si <= scenes[k]["to"]:
                err(f"{ew}: 문장 번호가 그 장면 안에 없습니다")
            elif ex.get("match", "") not in sents[si]["en"]:
                err(f"{ew}: '{ex.get('match')}'가 문장에 그대로 없습니다")
            if ex.get("type") not in EXPR_TYPES:
                err(f"{ew}: 종류는 {sorted(EXPR_TYPES)} 중 하나여야 합니다")
            for key in ("text", "meaning_ko", "note_ko"):
                if not str(ex.get(key, "")).strip():
                    err(f"{ew}: '{key}' 칸이 비어 있습니다")
            exs = ex.get("examples") or []
            if not 1 <= len(exs) <= 3 or any(not x.get("en") or not x.get("ko") for x in exs):
                err(f"{ew}: 예문은 영어·한국어가 있는 1~3개여야 합니다")
            per_scene[k] = per_scene.get(k, 0) + 1
        for k, n_ex in per_scene.items():
            if n_ex > MAX_EXPR_PER_SCENE:
                err(f"{where} 장면 {k + 1}: 표현이 {n_ex}개입니다 (최대 {MAX_EXPR_PER_SCENE}개)")
        for word, g in (c.get("glossary") or {}).items():
            if not g.get("ko") or g.get("cefr") not in LEVELS:
                err(f"{where} 단어 '{word}': 뜻(ko)과 등급(cefr)이 있어야 합니다")
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
