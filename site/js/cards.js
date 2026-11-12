/* =========================================================
   쫑긋 — 복습 화면 (표현 카드 간격 반복, 2026-11-12)
   규칙은 review.js(필드워드에서 가져온 라이트너 상자)에 있고, 이 파일은 화면만 그린다.

   한 장의 순서 (인출 연습: 답을 보기 전에 먼저 떠올린다)
     1. 문제: 상자 0~2는 표현 → 뜻 떠올리기, 상자 3 이상은 뜻 + 빈칸 문장 → 표현 떠올리기
        (보기 고르기보다 직접 떠올리기가 오래 남는다: 산출 효과·인출 연습)
     2. 확신도: 확실해요 / 헷갈려요 / 몰라요   (확신하고 틀린 '착각'을 따로 잡으려고: Butterfield & Metcalfe 2001)
     3. 답 보기 → 채점: 맞았어요 / 일부 / 아직   (버튼마다 다음 복습이 며칠 뒤인지 보여 준다)
   오늘 할 카드는 Review.plan: 급한 순(착각 → 헷갈림 → …), 하루 목표 개수까지.
   ========================================================= */

const reviewView = { players: new Map() };      // 콘텐츠별 문장 재생기 (복습 화면을 떠나면 정리)

function cleanupReview() {
  for (const p of reviewView.players.values()) p.destroy();
  reviewView.players.clear();
}

// 카드 → 표현·문장 (카드에는 콘텐츠 id와 표현 번호만 담겨 있다)
function cardInfo(card) {
  const c = state.contents.find((x) => x.id === card.content_id);
  const e = c?.expressions?.[card.expr];
  return c && e ? { c, e, s: c.sentences[e.sentence] } : null;
}

function playCardSentence(c, i) {
  let p = reviewView.players.get(c.id);
  if (!p) { p = Player.create(c.audio.src); reviewView.players.set(c.id, p); }
  for (const other of reviewView.players.values()) if (other !== p) other.stop();
  p.playSentences(c.sentences, [i]);
}

// 오늘 복습할 카드 수 (홈에 보여 준다)
function reviewDue() {
  const cards = Review.getCards().filter((k) => cardInfo(k));
  return Review.plan(cards).queue.length;
}

function renderReview() {
  renderTopbar(false);
  const cards = Review.getCards().filter((k) => cardInfo(k));
  const pl = Review.plan(cards);
  const queue = pl.queue.map((id) => cards.find((k) => k.id === id));
  const result = { right: 0, again: 0 };
  const box = h("div", {});
  let pos = 0;

  if (!queue.length) {
    app.replaceChildren(
      h("h2", {}, t("review.title")),
      h("section", { class: "card welcome" },
        Rabbit.el({ chub: rabbitState().chub, wear: todayOccasion()?.wear, label: t("rabbit.alt") }, "rabbit-art"),
        h("p", {}, cards.length ? t("review.none") : t("review.empty")),
        cards.length > 0 && h("p", { class: "muted small" }, t("review.next", { date: nextDueDate(cards) }))),
      h("a", { class: "btn primary wide", href: "#/" }, t("back")));
    return;
  }

  const finish = () => {
    const firstGoal = Review.goalMet(Review.getCards()) && Review.getSettings().celebrated_on !== Review.today();
    if (firstGoal) Review.setSettings({ celebrated_on: Review.today() });
    const art = h("span", { class: "rabbit-stage bounce" },
      Rabbit.el({ chub: rabbitState().chub, wear: todayOccasion()?.wear, label: t("rabbit.alt") }, "rabbit-art"));
    box.replaceChildren(
      h("section", { class: "card welcome" }, art,
        h("h2", {}, t(firstGoal || Review.goalMet(Review.getCards()) ? "done.goal" : "review.done")),
        h("p", {}, t("review.result", { n: queue.length, right: result.right, again: result.again })),
        h("p", { class: "muted small" }, t("review.after"))),
      h("a", { class: "btn primary wide", href: "#/" }, t("back")));
    const occ = todayOccasion();
    if (firstGoal && !occ?.solemn) requestAnimationFrame(() => confetti(art, occ?.confetti));
  };

  const show = () => {
    if (pos >= queue.length) { finish(); return; }
    const card = queue[pos];
    const { c, e, s } = cardInfo(card);
    const rec = Review.get(card.id);
    const produce = (rec?.box ?? 0) >= 3;           // 상자 3부터는 거꾸로: 뜻 → 표현
    let confidence = null;

    const answer = h("div", { class: "expr-reveal", hidden: true });
    const grades = h("div", { class: "grade-row" });
    const confRow = h("div", { class: "btn-row" }, ["sure", "unsure", "dontknow"].map((k) =>
      h("button", { class: "chip", type: "button", onclick: () => {
        confidence = k;
        confRow.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
        answer.hidden = false;
        drawGrades();
        answer.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, "data-k": k, "aria-pressed": "false" }, t(`review.conf.${k}`))));

    // 채점: 버튼마다 다음 복습 날을 보여 준다. 몰라요를 골랐으면 채점 없이 '아직'
    const nextDays = (conf, correct) => {
      const st = Review.classify(conf, correct);
      return Review.intervalFor(Review.nextBox(rec?.box ?? 0, st));
    };
    const grade = (conf, correct) => {
      Review.record(card.id, { confidence: conf, correct, quiz: produce ? "produce" : "recall" });
      result[correct ? "right" : "again"] += 1;
      pos += 1;
      show();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const drawGrades = () => {
      // 헷갈렸다면 '맞음'과 '일부'의 결과가 같아서(같은 간격 한 번 더) 두 개만 보인다
      const opts = confidence === "dontknow" ? [["again", "dontknow", false]]
        : confidence === "unsure" ? [["right", "unsure", true], ["again", "unsure", false]]
        : [["right", "sure", true], ["part", "unsure", true], ["again", "sure", false]];
      grades.replaceChildren(
        h("p", { class: "small" }, h("b", {}, t(confidence === "dontknow" ? "review.grade.dk" : "review.grade.ask"))),
        h("div", { class: "grade-buttons" }, opts.map(([key, conf, ok]) =>
          h("button", { class: `btn ${key === "right" ? "primary" : "soft"}`, type: "button", onclick: () => grade(conf, ok) },
            h("span", {}, t(`review.grade.${key}`)),
            h("span", { class: "grade-next" }, t("review.in", { d: nextDays(conf, ok) }))))));
    };

    const blank = s.en.includes(e.match) ? s.en.replace(e.match, " ____ ") : s.en;
    const question = produce
      ? [h("p", { class: "muted small" }, t("review.q.produce")),
         h("p", { class: "expr-meaning" }, h("span", { class: "pen" }, e.meaning_ko)),
         h("p", { class: "sent-en", lang: "en" }, blank)]
      : [h("p", { class: "muted small" }, t("review.q.recall")),
         h("p", { class: "expr-text", lang: "en" }, e.text),
         h("p", { class: "sent-en", lang: "en" }, ...markText(s.en, e.match))];

    answer.append(h("div", {},
      produce ? h("p", { class: "expr-text", lang: "en" }, e.text)
              : h("p", { class: "expr-meaning" }, h("span", { class: "pen" }, e.meaning_ko)),
      h("p", { class: "expr-sent-ko" }, h("span", { class: "muted small" }, t("expr.sent.ko")), " ", s.ko),
      produce && h("p", { class: "sent-en", lang: "en" }, ...markText(s.en, e.match)),
      h("p", { class: "expr-note" }, e.note_ko),
      card.mine && h("p", { class: "small" }, h("b", {}, t("review.mine")), " ", h("span", { lang: "en" }, card.mine)),
      grades));

    box.replaceChildren(
      h("p", { class: "muted small" }, t("review.count", { n: pos + 1, total: queue.length }),
        rec?.status === "misconception" ? [" · ", h("b", {}, t("review.tag.misconception"))] : null),
      h("section", { class: "expr-card review-card" },
        h("span", { class: "expr-type" }, t(TYPE_KEY[e.type])),
        question,
        h("button", { class: "play-pill", type: "button", onclick: () => playCardSentence(c, e.sentence) },
          icon("play"), t("loop.play.one")),
        h("p", { class: "muted small" }, t("review.from", { title: c.title_ko }))),
      h("p", { class: "expr-ask" }, t("review.conf.ask")),
      confRow,
      answer);
  };

  show();
  app.replaceChildren(
    h("h2", {}, t("review.title")),
    h("p", { class: "muted small" }, t("review.desc")),
    box);
}

// 다음 복습 날 (가장 이른 날). 오늘 다 했으면 내일 이후
function nextDueDate(cards) {
  const dates = cards.map((k) => Review.get(k.id)?.next_review_at).filter(Boolean).sort();
  const d = dates.find((x) => x > Review.today()) ?? dates[0];
  return d ? t("progress.date", { m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) }) : "-";
}
