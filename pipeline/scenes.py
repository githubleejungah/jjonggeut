"""장면 나누기 (2026-11-12 결정): 긴 대화를 자르지 않고 짧은 '장면'으로 나눈다.

장면 길이 (수준별 최대)
  A1·A2 30초, B1 60초, B2 이상 120초. 너무 짧은 장면을 막으려고 최소는 최대의 1/3.
자르는 곳
  시간이 아니라 이야기가 바뀌는 곳에서 자른다(사건 경계: Zacks 외, 2007).
  허용 범위 안에서 문장 사이 빈틈이 가장 긴 곳을 고르고, 말하는 사람이 바뀌면 조금 더 우선한다.
결과
  scenes = [{"from": 첫 문장 번호, "to": 끝 문장 번호}]  (0부터, 끝 포함, 빈틈없이 전체를 덮는다)
"""
from __future__ import annotations

MAX_MS = {"A1": 30000, "A2": 30000, "B1": 60000, "B2": 120000, "C1": 120000, "C2": 120000}
SPEAKER_BONUS_MS = 400
FORCE_CUT_MS = 3000   # 문장 사이가 3초 넘게 비면(뺀 구간·장면 전환) 반드시 자른다. 빈 구간을 재생하지 않게


def split_scenes(sentences: list[dict], level: str) -> list[dict]:
    max_ms = MAX_MS.get(level, 60000)
    min_ms = max_ms // 3
    scenes, i, n = [], 0, len(sentences)
    while i < n:
        start = sentences[i]["start_ms"]
        best, best_score = None, -1
        j = i
        while j < n and sentences[j]["end_ms"] - start <= max_ms:
            length = sentences[j]["end_ms"] - start
            if j == n - 1:
                best = j                       # 끝까지 다 들어가면 거기서 끝낸다
                break
            if sentences[j + 1]["start_ms"] - sentences[j]["end_ms"] >= FORCE_CUT_MS:
                best = j                       # 긴 빈 구간 앞에서 반드시 자른다
                break
            if length >= min_ms:
                gap = sentences[j + 1]["start_ms"] - sentences[j]["end_ms"]
                same = sentences[j + 1].get("speaker") == sentences[j].get("speaker")
                score = gap + (0 if same else SPEAKER_BONUS_MS)
                if score >= best_score:
                    best, best_score = j, score
            j += 1
        if best is None:
            best = max(i, j - 1)               # 한 문장이 최대보다 길면 그 문장 하나가 장면
        # 마지막 장면이 너무 짧으면 앞 장면에 붙인다
        if scenes and best == n - 1 and sentences[best]["end_ms"] - start < min_ms // 2:
            scenes[-1]["to"] = best
        else:
            scenes.append({"from": i, "to": best})
        i = best + 1
    return scenes
