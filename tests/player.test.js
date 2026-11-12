// 문장 플레이어 계산 시험. 실행: node --test tests/player.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { shadowGap, sentenceAt } = require("../site/js/player.js");

const S = [
  { start_ms: 0, end_ms: 2000 },
  { start_ms: 2500, end_ms: 4000 },
  { start_ms: 5000, end_ms: 9000 },
];

test("따라 말할 시간: 문장 길이 × 1.1 + 0.7초", () => {
  assert.equal(shadowGap(S[0]), 3800);        // 2초 문장 → 3.8초
  assert.equal(shadowGap(S[2]), 6700);        // 4초 문장 → 6.7초 (3초 넘는 1초에 0.3초 더)
  assert.equal(shadowGap(S[0], 1, 1.3), 4940); // '넉넉히'를 고르면 1.3배
});

test("느리게 들으면 따라 말할 시간도 길어진다", () => {
  assert.ok(shadowGap(S[0], 0.75) > shadowGap(S[0], 1));
  assert.ok(shadowGap(S[0], 1.25) < shadowGap(S[0], 1));
});

test("재생 위치로 문장 찾기: 문장 사이 빈틈은 앞 문장", () => {
  assert.equal(sentenceAt(S, 1000), 0);
  assert.equal(sentenceAt(S, 2200), 0);       // 0번과 1번 사이 빈틈
  assert.equal(sentenceAt(S, 2500), 1);
  assert.equal(sentenceAt(S, 8000), 2);
});
