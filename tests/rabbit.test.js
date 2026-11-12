// 토끼 간식 흐름 · 계절과 기념일 시험. 실행: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const Rabbit = require("../site/js/rabbit.js");

test("간식 흐름: 간식 → 통통 → 고르기 → 운동이면 원래 몸", () => {
  let s = Rabbit.START;
  let r = Rabbit.step(s); assert.equal(r.event, "snack"); assert.equal(r.state.chub, 0); s = r.state;
  r = Rabbit.step(s); assert.equal(r.event, "grow"); assert.equal(r.state.chub, 1); s = r.state;
  r = Rabbit.step(s); assert.equal(r.event, "choose"); s = r.state;               // 고르지 않으면 다시 고르기
  s = Rabbit.choose(s, "exercise");
  r = Rabbit.step(s); assert.equal(r.event, "exercise"); assert.equal(r.from, 1); assert.equal(r.state.chub, 0);
  assert.equal(r.state.stage, "snack");                                            // 처음부터 다시
});

test("간식 더: 더 통통해지고, 가장 통통하면 더 늘지 않는다", () => {
  let s = { ...Rabbit.START, chub: 1, stage: "choose" };
  for (const want of [2, 3, 3]) {
    s = Rabbit.choose(s, "food");
    const r = Rabbit.step(s);
    assert.equal(r.state.chub, want);
    assert.equal(r.event, want === 3 && r.from === 3 ? "full" : "feast");
    assert.equal(r.state.stage, "choose");
    s = r.state;
  }
});

test("기념일: 양력·음력 공휴일과 계절", () => {
  assert.equal(Rabbit.occasion("2026-12-25").id, "christmas");
  assert.equal(Rabbit.occasion("2027-02-07").id, "seollal");
  assert.equal(Rabbit.occasion("2027-09-14").id, "chuseok");
  assert.equal(Rabbit.occasion("2026-05-24").id, "buddha");
  assert.equal(Rabbit.occasion("2026-07-17").wear, "flag");                       // 제헌절 (2026년부터 공휴일)
  assert.equal(Rabbit.occasion("2026-05-01").id, "labor");                        // 노동절 (2026년부터 공휴일)
  const memorial = Rabbit.occasion("2026-06-06");
  assert.equal(memorial.solemn, true);
  assert.equal(memorial.confetti, null);                                          // 현충일은 꽃가루 없음
  assert.equal(Rabbit.occasion("2026-11-12").id, "autumn");
  assert.equal(Rabbit.occasion("2027-01-15").id, "winter");
});

test("모든 차림이 그려진다 (빈 그림·NaN 없음)", () => {
  for (const id of Rabbit.ALL_OCCASIONS) {
    for (const chub of [0, 3]) {
      const s = Rabbit.svg({ chub, wear: Rabbit.wearOf(id), snack: 1, workout: true });
      assert.ok(s.startsWith("<svg") && s.endsWith("</svg>"), id);
      assert.ok(!s.includes("NaN") && !s.includes("undefined"), id);
    }
  }
});
