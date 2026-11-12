// 음성 엔진의 글자 다듬기 시험 (소리를 내는 부분은 브라우저에서 확인한다)
// 실행: node --test tests/speech.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { sentences, clean, koreanCounters, replaceWords } = require("../site/js/speech.js");

test("숫자 + 세는 말은 고유어로: 3번 → 세 번, 10장 → 열 장, 20개 → 스무 개", () => {
  assert.equal(koreanCounters("3번 듣고 10장 넘기기"), "세 번 듣고 열 장 넘기기");
  assert.equal(koreanCounters("20개"), "스무 개");
  assert.equal(koreanCounters("2주 동안 40%"), "2주 동안 40%");   // 한자어로 읽는 것은 그대로
});

test("낱말 경계: 앞뒤가 영어 글자면 바꾸지 않는다 (GitHub 안의 Git)", () => {
  const table = { Git: "깃", GitHub: "깃허브" };
  assert.equal(replaceWords("GitHub에 올리고 Git으로 관리", table), "깃허브에 올리고 깃으로 관리");
  assert.equal(replaceWords("Gitter는 다른 말", { Git: "깃" }), "Gitter는 다른 말");
});

test("영어 문장을 문장 단위로 나누고, 축약의 '는 남긴다", () => {
  assert.deepEqual(sentences("I don't know. Can you say it again? Sure!", "en-US"),
    ["I don't know.", "Can you say it again?", "Sure!"]);
});

test("기호 정리: 화살표·가운뎃점·괄호", () => {
  assert.equal(clean("듣기 → 따라 말하기 · 다시 말하기"), "듣기, 따라 말하기, 다시 말하기");
  assert.equal(clean("청크(덩어리 표현)를 모은다"), "청크를 모은다");
});

test("한국어 문장도 나누고 숫자를 고유어로 읽는다", () => {
  assert.deepEqual(sentences("오늘 3번 들었어요. 내일 또 해요.", "ko-KR"), ["오늘 세 번 들었어요.", "내일 또 해요."]);
});
