"""문장 시각 맞추기: 원음(MP3) + 원문(대본) → 문장마다 start_ms·end_ms

실행 (faster-whisper가 깔린 .venv의 파이썬으로):
  .venv/Scripts/python.exe pipeline/align.py words  site/audio/파일.mp3      # 단어 시각을 뽑아 캐시
  .venv/Scripts/python.exe pipeline/align.py match  site/audio/파일.mp3 원문.txt [--from 줄 --to 줄]

방법
  1. faster-whisper(오픈소스 음성 인식, MIT)로 음성을 받아쓰며 단어마다 시각을 얻는다.
  2. 원문을 문장으로 나눈다. "이름: 말" 모양이면 말하는 사람도 남긴다.
  3. 원문 단어와 받아쓴 단어를 순서대로 맞춘다(difflib). 받아쓰기가 틀린 단어가 있어도
     앞뒤 단어가 맞으면 문장 경계를 찾을 수 있다.
  4. 문장마다 맞은 단어의 첫 시각·끝 시각을 쓴다. 맞은 비율(match)이 낮은 문장은 사람이 확인한다.

결과는 pipeline/candidates/에 JSON으로 쓴다. 공개 데이터(site/data)는 바꾸지 않는다.
번역을 붙이고 사람이 승인한 뒤 import 단계에서 contents.json에 넣는다.
"""
from __future__ import annotations

import difflib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "inbox" / "words"
OUT = ROOT / "pipeline" / "candidates"
MODEL = "base.en"


def words_path(mp3: Path) -> Path:
    return CACHE / (mp3.stem + ".words.json")


def decode(mp3: Path):
    """MP3를 16kHz 단일 채널 소리 배열로 푼다.
    faster-whisper 1.2.1의 기본 디코더는 av 15 이상과 맞지 않아서(open()의 metadata_errors 인자 제거)
    av로 직접 풀어 넘긴다 (2026-11-12)."""
    import av
    import numpy as np
    chunks = []
    with av.open(str(mp3)) as box:
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in box.decode(audio=0):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    return np.concatenate(chunks).astype(np.float32) / 32768.0


def transcribe(mp3: Path) -> dict:
    from faster_whisper import WhisperModel   # 무거운 부품이라 필요할 때만 불러온다
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(decode(mp3), language="en", word_timestamps=True, vad_filter=False)
    words = [{"w": w.word.strip(), "s": round(w.start * 1000), "e": round(w.end * 1000)}
             for seg in segments for w in (seg.words or [])]
    data = {"file": mp3.name, "model": MODEL, "duration_ms": round(info.duration * 1000), "words": words}
    CACHE.mkdir(parents=True, exist_ok=True)
    words_path(mp3).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


SPEAKER_RE = re.compile(r"^([A-Z][A-Za-z. ]{1,30}):\s+(.*)$")
# 문장 끝: . ? ! (따옴표·괄호가 뒤따를 수 있음) 다음 빈칸. Mr. Ms. Dr. 같은 줄임말에서는 자르지 않는다.
ABBR = ("Mr.", "Ms.", "Mrs.", "Dr.", "St.", "U.S.", "a.m.", "p.m.", "e.g.", "i.e.")


def split_sentences(text: str) -> list[str]:
    # 말줄임표(... …)는 문장 끝으로 보지 않는다: "someone ... who isn't."가 한 문장이 되게
    out, start = [], 0
    for m in re.finditer(r"(?<!\.)[.?!](?!\.)[\"'”’)]*\s+", text):
        piece = text[start:m.end()].strip()
        if piece.endswith(ABBR):
            continue
        out.append(piece)
        start = m.end()
    tail = text[start:].strip()
    if tail:
        out.append(tail)
    # 글자가 없는 조각("..." "?")은 앞 문장에 붙인다
    merged: list[str] = []
    for p in out:
        if merged and not re.search(r"[A-Za-z0-9]", p):
            merged[-1] += " " + p
        else:
            merged.append(p)
    return merged


def sentences_from(lines: list[str]) -> list[dict]:
    result = []
    for line in lines:
        m = SPEAKER_RE.match(line)
        speaker, body = (m.group(1), m.group(2)) if m else (None, line)
        for s in split_sentences(body):
            result.append({"speaker": speaker, "en": s})
    return result


def norm(token: str) -> str:
    return re.sub(r"[^a-z0-9']", "", token.lower().replace("’", "'"))


def match(words: list[dict], sentences: list[dict]) -> list[dict]:
    asr = [norm(w["w"]) for w in words]
    ref, owner = [], []
    for i, s in enumerate(sentences):
        for tok in s["en"].split():
            n = norm(tok)
            if n:
                ref.append(n)
                owner.append(i)
    hit = {}   # 원문 단어 번호 → 받아쓴 단어 번호
    sm = difflib.SequenceMatcher(None, ref, asr, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            hit[a + k] = b + k
    totals = {}
    for i in range(len(sentences)):
        idx = [j for j, o in enumerate(owner) if o == i]
        got = [hit[j] for j in idx if j in hit]
        totals[i] = (len(idx), got)
    out = []
    for i, s in enumerate(sentences):
        n, got = totals[i]
        item = dict(s)
        item["match"] = round(len(got) / n, 2) if n else 0
        if got:
            item["start_ms"] = words[min(got)]["s"]
            item["end_ms"] = words[max(got)]["e"]
        out.append(item)
    return out


def main(argv: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    cmd, mp3 = argv[0], Path(argv[1])
    if cmd == "words":
        data = transcribe(mp3)
        print(f"{mp3.name}: 단어 {len(data['words'])}개, 길이 {data['duration_ms'] / 1000:.1f}초")
        return 0
    if cmd == "match":
        data = json.loads(words_path(mp3).read_text(encoding="utf-8"))
        lines = Path(argv[2]).read_text(encoding="utf-8").splitlines()
        lo = int(argv[argv.index("--from") + 1]) if "--from" in argv else 1
        hi = int(argv[argv.index("--to") + 1]) if "--to" in argv else len(lines)
        sents = match(data["words"], sentences_from([l for l in lines[lo - 1:hi] if l.strip()]))
        # 음성에 없는 문장(소제목, 영상에만 있는 말 등)은 뺀다. 무엇을 뺐는지는 화면에 남긴다.
        dropped = [s for s in sents if s["match"] < 0.3 or "start_ms" not in s]
        sents = [s for s in sents if s not in dropped]
        # 한 단어 문장은 받아쓰기가 길이 0으로 잡을 때가 있다("Congratulations!").
        # 끝 시각을 다음 문장 시작 전까지, 최대 0.4초 늘린다.
        for k, s in enumerate(sents):
            if s["end_ms"] <= s["start_ms"]:
                limit = sents[k + 1]["start_ms"] if k + 1 < len(sents) else data["duration_ms"]
                s["end_ms"] = min(s["start_ms"] + 400, max(limit, s["start_ms"] + 1))
        for s in dropped:
            print(f"  음성에 없어 뺌: {s['en'][:70]}")
        OUT.mkdir(parents=True, exist_ok=True)
        out = OUT / (mp3.stem + ".aligned.json")
        out.write_text(json.dumps({"audio": f"audio/{mp3.name}", "duration_ms": data["duration_ms"],
                                   "sentences": sents}, ensure_ascii=False, indent=1), encoding="utf-8")
        low = [s for s in sents if s["match"] < 0.6]
        print(f"{mp3.name}: 문장 {len(sents)}개, 맞은 비율 낮은 문장 {len(low)}개 → {out.relative_to(ROOT)}")
        for s in low:
            print(f"  확인 필요 ({s['match']}): {s['en'][:70]}")
        return 0
    print("사용법: align.py words|match ...")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
