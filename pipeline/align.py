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


def tokens(text: str) -> list[str]:
    """단어로 나눈다. 하이픈·대시에서도 나눈다 (2026-11-12).
    받아쓰기는 "check-in"을 "check" + "-in."처럼 따로 내놓는데, 원문은 한 단어라
    "checkin"과 "check"가 서로 맞지 않았다 → 문장 끝이 "with"에서 끊겼다."""
    return [n for part in re.split(r"[\s\-‐‑‒–—]+", text) if (n := norm(part))]


def match(words: list[dict], sentences: list[dict]) -> list[dict]:
    asr, asr_word = [], []          # 받아쓴 단어 조각, 그 조각이 나온 단어 번호
    for wi, w in enumerate(words):
        for n in tokens(w["w"]):
            asr.append(n)
            asr_word.append(wi)
    ref, owner = [], []
    for i, s in enumerate(sentences):
        for n in tokens(s["en"]):
            ref.append(n)
            owner.append(i)
    hit = {}   # 원문 조각 번호 → 받아쓴 조각 번호
    sm = difflib.SequenceMatcher(None, ref, asr, autojunk=False)
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            hit[a + k] = b + k
    spans = []   # 문장마다 (원문 조각 수, 맞은 받아쓴 조각들, 앞쪽 못 맞춘 수, 뒤쪽 못 맞춘 수)
    for i in range(len(sentences)):
        idx = [j for j, o in enumerate(owner) if o == i]
        got = [hit[j] for j in idx if j in hit]
        lead = next((n for n, j in enumerate(idx) if j in hit), len(idx))
        tail = next((n for n, j in enumerate(reversed(idx)) if j in hit), len(idx))
        spans.append((len(idx), got, lead, tail))
    out = []
    for i, s in enumerate(sentences):
        n, got, lead, tail = spans[i]
        item = dict(s)
        item["match"] = round(len(got) / n, 2) if n else 0
        if got:
            lo, hi = min(got), max(got)
            # 문장 처음·끝 단어를 못 맞췄으면(받아쓰기가 다르게 적음), 이웃 문장에 속하지 않은
            # 받아쓴 조각을 그 수만큼 끌어온다. 끝이 잘리지 않게 하려는 것.
            prev_hi = max(spans[i - 1][1], default=-1) if i else -1
            next_lo = min(spans[i + 1][1], default=len(asr)) if i + 1 < len(spans) else len(asr)
            lo = max(lo - lead, prev_hi + 1, 0)
            hi = min(hi + tail, next_lo - 1, len(asr) - 1)
            item["start_ms"] = words[asr_word[lo]]["s"]
            item["end_ms"] = words[asr_word[hi]]["e"]
        out.append(item)
    return out


PAD_BEFORE_MS = 120
PAD_AFTER_MS = 300       # 끝 여유 기본
PAD_AFTER_MAX_MS = 600   # 다음 문장까지 빈틈이 넉넉하면 여기까지 (2026-11-12: 마지막 문장 'Bryant'의 끝소리가 잘렸다)
GAP_KEEP_MS = 150        # 다음 문장 시작 앞에 남겨 둘 틈
SHORT_MS = 300


def pad(sents: list[dict], duration_ms: int) -> None:
    """문장 앞뒤에 여유를 준다 (2026-11-12, 구간을 다시 받아써 보니 끝이 잘린 문장이 있었다).
    받아쓰기 모델은 단어 끝을 실제보다 조금 일찍 잡는다. 그래서
      시작은 0.12초 앞당기고(앞 문장 끝보다 앞으로는 가지 않음),
      끝은 0.3초 늦춘다(다음 문장 시작을 넘지 않음). 빈틈이 넉넉하면 0.6초까지(다음 말 0.15초 앞까지).
    0.3초보다 짧게 잡힌 문장("Congratulations!"가 길이 0으로 잡힘)은 앞뒤 빈틈 전체를 쓴다."""
    orig = [(s["start_ms"], s["end_ms"]) for s in sents]
    for k, s in enumerate(sents):
        prev_end = orig[k - 1][1] if k else 0
        next_start = orig[k + 1][0] if k + 1 < len(sents) else duration_ms
        start, end = orig[k]
        if end - start < SHORT_MS:
            s["start_ms"], s["end_ms"] = max(prev_end, start - 600), next_start
        else:
            s["start_ms"] = max(prev_end, start - PAD_BEFORE_MS)
            room = next_start - end - GAP_KEEP_MS          # 다음 말 앞까지 쓸 수 있는 빈틈
            s["end_ms"] = min(next_start, end + max(PAD_AFTER_MS, min(PAD_AFTER_MAX_MS, room)))
    # 여유끼리 겹치면 앞 문장의 늘린 끝을 줄인다 (원래 구간은 건드리지 않는다)
    for k in range(1, len(sents)):
        if sents[k]["start_ms"] < sents[k - 1]["end_ms"]:
            sents[k - 1]["end_ms"] = max(sents[k]["start_ms"], orig[k - 1][1])


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
        pad(sents, data["duration_ms"])
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
    if cmd == "verify":
        return verify(mp3, argv[2])
    print("사용법: align.py words|match|verify ...")
    return 2


def verify(mp3: Path, content_id: str) -> int:
    """'귀로 확인'을 대신하는 검사: 문장 구간만 잘라 다시 받아쓰고 원문과 견준다.
    구간이 어긋나면 앞뒤 문장이 섞이거나 말이 잘려 일치율이 떨어진다.
      .venv/Scripts/python.exe pipeline/align.py verify site/audio/파일.mp3 <콘텐츠 id>
    """
    from faster_whisper import WhisperModel
    data = json.loads((ROOT / "site" / "data" / "contents.json").read_text(encoding="utf-8"))
    content = next(c for c in data["contents"] if c["id"] == content_id)
    audio = decode(mp3)
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    rates, low = [], []
    for i, s in enumerate(content["sentences"], 1):
        a, b = int(s["start_ms"] * 16), int(s["end_ms"] * 16)          # 16kHz → 밀리초당 16개
        segs, _ = model.transcribe(audio[a:b], language="en", vad_filter=False)
        heard = tokens(" ".join(x.text for x in segs))
        want = tokens(s["en"])
        sm = difflib.SequenceMatcher(None, want, heard, autojunk=False)
        rate = sum(m.size for m in sm.get_matching_blocks()) / max(len(want), 1)
        rates.append(rate)
        if rate < 0.7:
            low.append((i, round(rate, 2), s["en"], " ".join(heard)))
    print(f"{content_id}: 문장 {len(rates)}개, 평균 일치 {sum(rates) / len(rates):.0%}, 70% 미만 {len(low)}개")
    for i, r, want, heard in low:
        print(f"  {i}번 ({r}) 원문: {want[:60]} | 들린 말: {heard[:60]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
