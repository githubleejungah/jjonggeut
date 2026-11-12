"""이용 조건 바뀜 감시 — 쫑긋이 쓰는 자료의 조건 페이지를 받아 지난번 글과 견준다.

실행
  python -I pipeline/watch_terms.py                 # 확인만. 바뀐 게 있으면 보고서를 쓴다
  python -I pipeline/watch_terms.py --accept <id>   # 사람이 보고서를 읽고 반영을 마친 뒤, 새 글을 기준으로 삼는다

하는 일
  1. pipeline/terms_watch.json의 페이지를 받아 글자만 뽑는다. start~end 사이만 견준다.
  2. pipeline/terms/<id>.txt(지난번 글)와 다르면 pipeline/reports/조건변화_<날짜>.md에 바뀐 줄을 쓴다.
  3. 기준 글은 저절로 바꾸지 않는다. 사람이 확인하고 --accept 할 때만 바꾼다 (제안 → 승인).
     --accept는 그 페이지에 연결된 라이선스의 checked_at(마지막 확인한 날)도 오늘로 고친다.
  4. 라이선스 checked_at이 180일 넘게 지났으면 보고서에 적는다.

이 도구는 법률 판단을 하지 않는다. 바뀐 곳을 찾아 사람에게 보여 줄 뿐이다.
표준 라이브러리만 쓴다. 종료 코드: 0 바뀐 것 없음, 1 바뀜·확인 필요, 2 페이지를 못 받음.
"""
from __future__ import annotations

import datetime as dt
import difflib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "pipeline" / "terms_watch.json"
SNAP = ROOT / "pipeline" / "terms"
REPORTS = ROOT / "pipeline" / "reports"
CONTENTS = ROOT / "site" / "data" / "contents.json"
STALE_DAYS = 180
UA = "Mozilla/5.0 (compatible; terms-watch)"


def page_text(raw: str) -> str:
    """HTML이면 태그를 지우고, 공백을 하나로 모은다."""
    raw = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", raw)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return re.sub(r"\s+", " ", html.unescape(raw)).strip()


def cut(text: str, start: str | None, end: str | None) -> str | None:
    """start~end 사이만 남긴다. 표시 문구를 못 찾으면 None (페이지 모양이 바뀐 것)."""
    a = 0
    if start:
        a = text.find(start)
        if a < 0:
            return None
    b = len(text)
    if end:
        b = text.find(end, a + len(start or ""))
        if b < 0:
            return None
    return text[a:b].strip()


def lines(text: str) -> list[str]:
    """견주기 쉽게 문장마다 한 줄로."""
    return [s for s in re.split(r"(?<=[.!?])\s+", text) if s]


def fetch(url: str) -> str:
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?=&%#"), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def stale_licenses(today: dt.date) -> list[str]:
    data = json.loads(CONTENTS.read_text(encoding="utf-8"))
    out = []
    for lic in data.get("licenses", []):
        checked = dt.date.fromisoformat(lic["checked_at"])
        if (today - checked).days > STALE_DAYS:
            out.append(f"- `{lic['id']}`: 마지막 확인 {lic['checked_at']} ({(today - checked).days}일 전). 조건 페이지를 사람이 다시 읽어 주세요.")
    return out


def check(sources: list[dict], today: dt.date) -> tuple[int, list[str]]:
    SNAP.mkdir(parents=True, exist_ok=True)
    code, out = 0, []
    for s in sources:
        snap = SNAP / f"{s['id']}.txt"
        try:
            body = cut(page_text(fetch(s["url"])) if not s["url"].endswith((".md", "LICENSE")) else
                       re.sub(r"\s+", " ", fetch(s["url"])), s.get("start"), s.get("end"))
        except Exception as e:  # noqa: BLE001 — 어떤 실패든 보고서에 남긴다
            out.append(f"## {s['name']}\n\n- 상태: **페이지를 받지 못함** ({type(e).__name__}: {e})\n"
                       f"- 주소: {s['url']}\n- 영향: {s['affects']}\n- 여러 번 이어지면 사이트가 닫혔거나 주소가 바뀐 것일 수 있다.\n")
            code = max(code, 2)
            continue
        if body is None:
            out.append(f"## {s['name']}\n\n- 상태: **페이지 모양이 바뀜** (표시 문구 '{s.get('start')}' 또는 '{s.get('end')}'를 못 찾음)\n"
                       f"- 주소: {s['url']}\n- 영향: {s['affects']}\n- 사람이 페이지를 직접 읽고, terms_watch.json의 start·end를 고친다.\n")
            code = max(code, 1)
            continue
        new = lines(body)
        if not snap.exists():
            snap.write_text("\n".join(new) + "\n", encoding="utf-8")
            print(f"처음 저장: {s['id']} ({len(new)}줄)")
            continue
        old = snap.read_text(encoding="utf-8").splitlines()
        if old == new:
            print(f"같음: {s['id']}")
            continue
        diff = "\n".join(difflib.unified_diff(old, new, "지난번", "이번", lineterm="", n=1))
        out.append(f"## {s['name']}\n\n- 상태: **바뀜**\n- 주소: {s['url']}\n- 영향: {s['affects']}\n"
                   f"- 반영을 마치면: `python -I pipeline/watch_terms.py --accept {s['id']}`\n\n```diff\n{diff}\n```\n")
        print(f"바뀜: {s['id']}")
        code = max(code, 1)
    return code, out


def accept(sources: list[dict], sid: str, today: dt.date) -> int:
    s = next((x for x in sources if x["id"] == sid), None)
    if not s:
        print(f"'{sid}'가 terms_watch.json에 없습니다")
        return 2
    (SNAP / f"{sid}.txt").unlink(missing_ok=True)
    code, out = check([s], today)
    if out:
        print("\n".join(out))
        return code
    if s.get("license_id"):
        data = json.loads(CONTENTS.read_text(encoding="utf-8"))
        for lic in data["licenses"]:
            if lic["id"] == s["license_id"]:
                lic["checked_at"] = today.isoformat()
        CONTENTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{s['license_id']} 마지막 확인한 날을 {today}로 고쳤습니다")
    return 0


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    today = dt.date.today()
    sources = json.loads(CONFIG.read_text(encoding="utf-8"))["sources"]
    if argv[:1] == ["--accept"] and len(argv) == 2:
        return accept(sources, argv[1], today)
    code, out = check(sources, today)
    out += stale_licenses(today)
    if out:
        REPORTS.mkdir(parents=True, exist_ok=True)
        rep = REPORTS / f"조건변화_{today}.md"
        rep.write_text(f"# 이용 조건 확인 {today}\n\n법률 판단이 아니다. 바뀐 곳만 모았다. 사람이 읽고 쫑긋에 반영할 것을 정한다.\n\n"
                       + "\n".join(out) + "\n", encoding="utf-8")
        print(f"확인 필요 → {rep.relative_to(ROOT)}")
    else:
        print("바뀐 것 없음")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
