"""쫑긋 종합 점검 — 배포 전에 한 번에 확인한다.

실행: python pipeline/check.py   (Node.js 20 이상 필요)

확인하는 것
  1. 학습 규칙·음성 시험 (node --test)
  2. 자바스크립트 문법 (node --check): 글자 하나 잘못돼도 앱 전체가 안 뜨는 것을 막는다
  3. 오래된 아이폰이 모르는 정규식 "뒤를 보는 검사" (?<=…) (?<!…) 를 쓰지 않았는지
  4. 화면 문구 파일(i18n)이 올바른 JSON인지, app.js가 쓰는 문구 키가 모두 있는지
  5. index.html이 부르는 파일마다 캐시 버스팅 번호(?v=)가 붙어 있는지
  6. 화면 파일에 이모지가 없는지 (디자인 규칙: 이모지 대신 선 아이콘)
  7. 비밀 값처럼 보이는 글자가 없는지
  8. 콘텐츠 데이터 검사 (validate.py: 라이선스 없는 콘텐츠 차단, 문장 시각) + 그 시험 (unittest)

통과하면 0, 하나라도 실패하면 1로 끝난다 (GitHub Actions가 배포를 멈춘다).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
problems: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("통과 " if ok else "실패 ") + name + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        problems.append(name)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


# 1. 시험
tests = sorted(str(p.relative_to(ROOT)) for p in (ROOT / "tests").glob("*.test.js"))
r = run(["node", "--test", *tests])
summary = " ".join(l for l in r.stdout.splitlines() if l.startswith(("ℹ pass", "ℹ fail")))
check("학습 규칙·음성 시험", r.returncode == 0, summary or r.stderr[-500:])

# 8. 콘텐츠 데이터 (앞쪽에서 돌려 실패를 빨리 보이게 한다)
r = run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"])
check("콘텐츠 검사 시험", r.returncode == 0, r.stderr[-500:])
r = run([sys.executable, "pipeline/validate.py"])
check("콘텐츠 데이터", r.returncode == 0, r.stdout[-800:])

js_files = sorted(SITE.glob("js/*.js"))

# 2. 문법
for js in js_files:
    r = run(["node", "--check", str(js)])
    check(f"문법 {js.name}", r.returncode == 0, r.stderr[-300:])

# 3. 뒤를 보는 정규식
for js in js_files:
    bad = [i + 1 for i, line in enumerate(js.read_text(encoding="utf-8").splitlines())
           if "(?<=" in line or "(?<!" in line]
    check(f"뒤를 보는 정규식 없음 {js.name}", not bad, f"{bad}번째 줄")

# 4. 화면 문구
try:
    text = json.loads((SITE / "i18n" / "ko.json").read_text(encoding="utf-8"))
    check("화면 문구 JSON", True)
    app = (SITE / "js" / "app.js").read_text(encoding="utf-8")
    used = set(re.findall(r'\bt\("([a-z0-9_.]+)"', app))
    missing = sorted(k for k in used if k not in text)
    check("화면 문구 키", not missing, ", ".join(missing))
except json.JSONDecodeError as e:
    check("화면 문구 JSON", False, str(e))

# 5. 캐시 버스팅
index = (SITE / "index.html").read_text(encoding="utf-8")
refs = re.findall(r'(?:src|href)="((?:js|css)/[^"]+)"', index)
no_version = [r for r in refs if "?v=" not in r]
check("캐시 버스팅 번호", bool(refs) and not no_version, ", ".join(no_version))

# 6. 이모지
emoji = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
with_emoji = [str(p.relative_to(ROOT)) for p in SITE.rglob("*")
              if p.suffix in {".js", ".css", ".html", ".json"} and emoji.search(p.read_text(encoding="utf-8"))]
check("이모지 없음", not with_emoji, ", ".join(with_emoji))

# 7. 비밀 값
secret = re.compile(r"(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)")
leaked = [str(p.relative_to(ROOT)) for p in ROOT.rglob("*")
          if p.is_file() and ".git" not in p.parts and p.suffix in {".js", ".json", ".html", ".css", ".py", ".md", ".yml"}
          and secret.search(p.read_text(encoding="utf-8", errors="ignore"))]
check("비밀 값 없음", not leaked, ", ".join(leaked))

print()
print("모두 통과" if not problems else f"실패 {len(problems)}건: {', '.join(problems)}")
sys.exit(1 if problems else 0)
