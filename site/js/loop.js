/* =========================================================
   쫑긋 — 콘텐츠 고르기와 오늘의 루프 (3단계, F-03·F-06~F-11)
   app.js의 도구(h, t, icon, withIcon, renderTopbar, state)를 쓴다. app.js 다음에 불러온다.

   긴 대화는 '장면'으로 나눠 장면마다 루프를 돈다 (2026-11-12 결정)
     A1·A2 30초, B1 60초, B2 이상 120초 안쪽. 이야기가 바뀌는 곳에서 자른다 (pipeline/scenes.py)

   루프 6단계 (장면마다)
     1 listen  대본 없이 듣기 (2번, 사이 6초 쉼)   이해 가능한 입력, 짧은 휴식 중 공고화
     2 gist    요지 한 줄 적기                      인출
     3 read    대본 보며 듣기 (문장 누르면 그 문장)  자막·대본과 듣기
     4 chunk   표현 모으기 (4단계에서 연다)
     5 shadow  따라 말하기·녹음 비교                섀도잉, 소리 내기
     6 retell  다시 말하기 녹음                     출력, 인출 (관심사에 맞춘 질문)

   화면 주소: #/library, #/loop/<콘텐츠 id>/<장면 번호 1~>/<단계>, #/done/<콘텐츠 id>/<장면 번호>
   기록 이름: Review.getLoop("<콘텐츠 id>/<장면 번호 0~>")
   ========================================================= */

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LISTEN_REPEAT = 2;          // 대본 없이 두 번 듣는다
const LISTEN_REST_MS = 6000;      // 두 번 사이에 6초 쉼
const loopView = { player: null, contentId: null };

// 다른 화면으로 갈 때 재생·마이크를 정리한다 (app.js의 route가 부른다)
function cleanupLoop() {
  loopView.player?.destroy();
  loopView.player = null;
  loopView.contentId = null;
  Recorder.release();
}

const fmtTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const contentById = (id) => state.contents.find((c) => c.id === id);
const licenseOf = (c) => state.licenses.find((l) => l.id === c.license_id);

/* ---------- 장면 ---------- */
const sceneKey = (c, k) => `${c.id}/${k}`;
const sceneOf = (c, k) => {
  const sc = c.scenes[k];
  const idx = [];
  for (let i = sc.from; i <= sc.to; i++) idx.push(i);
  return { ...sc, k, idx, start: c.sentences[sc.from].start_ms, end: c.sentences[sc.to].end_ms };
};
// 장면을 마쳤다 = 다시 말하기까지 했거나, 표현 단계(4단계 전)를 빼고 다 했다
const sceneDone = (c, k) => {
  const done = Review.getLoop(sceneKey(c, k)).done;
  return done.includes("retell") || done.filter((s) => s !== "chunk").length >= Review.LOOP_STEPS.length - 1;
};
const scenesDone = (c) => c.scenes.filter((_, k) => sceneDone(c, k)).length;
const firstOpenScene = (c) => { const k = c.scenes.findIndex((_, i) => !sceneDone(c, i)); return k < 0 ? 0 : k; };
// 가장 최근에 손댄 장면의 기록 (홈의 '이어 하기')
function lastTouched(c) {
  return c.scenes.map((_, k) => ({ k, rec: Review.getLoop(sceneKey(c, k)) }))
    .filter((x) => x.rec.updated_at)
    .sort((a, b) => b.rec.updated_at.localeCompare(a.rec.updated_at))[0] ?? null;
}

/* ---------- 콘텐츠 고르기 (F-03) ---------- */
// 수준이 먼저, 같은 수준 안에서는 관심사가 맞는 것을 먼저 (2026-11-12 결정)
function sortedContents() {
  const interests = new Set(Review.getSettings().interests);
  const score = (c) => c.topics.filter((x) => interests.has(x)).length;
  return [...state.contents]
    .filter((c) => c.reviewed)
    .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || score(b) - score(a));
}

function renderLibrary() {
  renderTopbar(false);
  const interests = new Set(Review.getSettings().interests);
  const items = sortedContents().map((c) => {
    const match = c.topics.some((x) => interests.has(x));
    const avg = Math.round(c.audio.duration_ms / c.scenes.length / 1000);
    return h("a", { class: "content-card", href: `#/loop/${c.id}/${firstOpenScene(c) + 1}` },
      h("span", { class: "content-meta" },
        h("span", { class: "level-badge" }, c.level),
        h("span", {}, c.topics.map((x) => t(`interest.${x}`)).join(" · ")),
        match && h("span", { class: "match-tag" }, icon("check"), t("library.match"))),
      h("b", { class: "content-title" }, c.title_ko),
      h("span", { class: "content-en", lang: "en" }, c.title),
      h("span", { class: "content-foot" },
        t("library.scenes", { n: c.scenes.length, s: avg }), " · ",
        t("library.progress", { n: scenesDone(c), total: c.scenes.length })));
  });
  app.replaceChildren(
    h("h2", {}, t("library.title")),
    h("p", { class: "muted small" }, t("library.desc")),
    h("div", { class: "content-list" }, items),
    attributionNote(state.contents));
}

function attributionNote(contents) {
  const used = [...new Set(contents.map((c) => c.license_id))].map((id) => state.licenses.find((l) => l.id === id));
  return h("p", { class: "muted small attribution" }, used.filter(Boolean).map((l) => l.attribution).join(" / "));
}

/* ---------- 오늘의 루프 (F-06) ---------- */
function renderLoop(id, sceneNo, step) {
  const c = contentById(id);
  if (!c) { location.hash = "#/library"; return; }
  const k = Math.min(Math.max((Number(sceneNo) || firstOpenScene(c) + 1) - 1, 0), c.scenes.length - 1);
  renderTopbar(false);
  if (loopView.contentId !== id || !loopView.player) {
    cleanupLoop();
    loopView.player = Player.create(c.audio.src);
    loopView.contentId = id;
  }
  const sc = sceneOf(c, k);
  const rec = Review.getLoop(sceneKey(c, k));
  const steps = Review.LOOP_STEPS;
  const current = steps.includes(step) ? step : steps.find((s) => !rec.done.includes(s)) ?? "listen";
  const base = `#/loop/${c.id}/${k + 1}`;

  // 장면 고르기: 마친 장면은 체크 (색만이 아니라 모양으로도)
  const scenePicker = h("div", { class: "scene-row", role: "group", "aria-label": t("loop.scenes") },
    c.scenes.map((_, i) => h("a", {
      class: `scene-chip${i === k ? " now" : ""}${sceneDone(c, i) ? " done" : ""}`,
      href: `#/loop/${c.id}/${i + 1}`, "aria-current": i === k ? "true" : null,
    }, sceneDone(c, i) ? icon("check") : null, String(i + 1))));

  const stepper = h("ol", { class: "stepper" }, steps.map((s, i) =>
    h("li", { class: `${s === current ? "now" : ""}${rec.done.includes(s) ? " done" : ""}` },
      h("a", { href: `${base}/${s}`, "aria-current": s === current ? "step" : null },
        h("span", { class: "step-num" }, rec.done.includes(s) ? icon("check") : String(i + 1)),
        h("span", { class: "step-name" }, t(`loop.${s}`))))));

  const panels = { listen: listenPanel, gist: gistPanel, read: readPanel, chunk: chunkPanel, shadow: shadowPanel, retell: retellPanel };
  app.replaceChildren(
    h("p", { class: "loop-title" }, h("span", { class: "level-badge" }, c.level), " ", c.title_ko),
    h("p", { class: "muted small scene-label" },
      t("loop.scene", { k: k + 1, n: c.scenes.length, s: Math.round((sc.end - sc.start) / 1000) })),
    scenePicker,
    stepper,
    h("section", { class: "card loop-panel" }, panels[current](c, sc)),
    h("p", { class: "muted small attribution" },
      licenseOf(c)?.attribution, " · ", h("a", { href: c.source_url, target: "_blank", rel: "noopener" }, t("loop.source"))));
}

// 단계를 마치고 다음 단계로. 장면의 마지막 단계면 마침 화면으로
function finishStep(c, sc, step) {
  Review.markLoopStep(sceneKey(c, sc.k), step);
  const steps = Review.LOOP_STEPS;
  const next = steps[steps.indexOf(step) + 1];
  const firstGoal = Review.goalMet() && Review.getSettings().celebrated_on !== Review.today();
  if (firstGoal) Review.setSettings({ celebrated_on: Review.today() });
  if (firstGoal || !next) location.hash = `#/done/${c.id}/${sc.k + 1}`;    // 하루 한 번 축하 (F-22)
  else location.hash = `#/loop/${c.id}/${sc.k + 1}/${next}`;
}

function nextButton(c, sc, step, labelKey = "loop.next") {
  return h("button", { class: "btn primary wide", type: "button", onclick: () => finishStep(c, sc, step) },
    ...withIcon("arrow", t(labelKey)));
}

// 빠르기 고르기: 8가지를 늘어놓지 않고 작은 선택 버튼 하나로 (2026-11-12 사용자 의견)
// 기기의 기본 선택 목록(<select>)을 써서 휴대폰에서도 크게 열리고, 화면 읽기 프로그램도 읽는다.
// 고른 빠르기는 저장해서 다음에도 그대로 쓴다.
function rateButtons() {
  const p = loopView.player;
  const saved = Review.getSettings().rate;
  if (Player.RATES.includes(saved) && p.rate !== saved) p.setRate(saved);
  const select = h("select", { class: "rate-select", "aria-label": t("loop.rate") },
    Player.RATES.map((r) => h("option", { value: String(r), selected: r === p.rate ? "selected" : null },
      t(r < 1 ? "rate.slow" : r > 1 ? "rate.fast" : "rate.normal", { r }))));
  select.onchange = () => {
    const r = Number(select.value);
    p.setRate(r);
    Review.setSettings({ rate: r });
  };
  return h("label", { class: "rate-row" }, icon("speed"), select);
}

// 화면 아래에 붙는 재생 막대: 대본이 길어도 스크롤 없이 누를 수 있게 (2026-11-12 사용자 의견)
function playerBar(...controls) {
  return h("div", { class: "player-bar" }, ...controls, rateButtons());
}

// 재생 ↔ 멈춤 버튼 하나. 지금 상태에 맞춰 글자와 아이콘이 바뀐다
function playToggle(labelKey, start) {
  const p = loopView.player;
  const btn = h("button", { class: "btn soft", type: "button" });
  const draw = () => {
    const busy = p.status !== "idle" && p.status !== "paused";
    btn.replaceChildren(...withIcon(busy ? "stop" : "play", t(busy ? "loop.stop" : labelKey)));
  };
  btn.onclick = () => ((p.status !== "idle" && p.status !== "paused") ? p.stop() : start());
  p.listeners.add(draw);
  draw();
  return btn;
}

/* 1. 대본 없이 듣기: 장면을 2번, 사이 6초 쉼 */
function listenPanel(c, sc) {
  const p = loopView.player;
  p.listeners.clear();
  const note = h("p", { class: "gap-note", "aria-live": "polite" });
  const bar = h("div", { class: "progress-bar" }, h("span", {}));
  p.onGap = (_, ms) => { note.textContent = t("loop.listen.rest", { s: Math.round(ms / 1000) }); };
  p.listeners.add(() => { if (p.status !== "gap") note.textContent = ""; });
  const tick = setInterval(() => {
    if (!document.body.contains(bar)) { clearInterval(tick); return; }
    const now = p.audio.currentTime * 1000 - sc.start;
    bar.firstChild.style.width = `${Math.min(100, Math.max(0, (now / (sc.end - sc.start)) * 100))}%`;
  }, 200);
  const play = playToggle("loop.listen.play",
    () => p.playRange(c.sentences, sc.start, sc.end, { repeat: LISTEN_REPEAT, rest: LISTEN_REST_MS }));
  play.classList.add("big");
  return [
    h("h2", {}, t("loop.listen.title")),
    h("p", {}, t("loop.listen.desc")),
    play, bar, note, rateButtons(),
    nextButton(c, sc, "listen", "loop.listen.done"),
  ];
}

/* 2. 요지 적기 */
function gistPanel(c, sc) {
  const rec = Review.getLoop(sceneKey(c, sc.k));
  const box = h("textarea", { class: "gist-input", rows: 3, maxlength: 300, placeholder: t("loop.gist.placeholder") });
  box.value = rec.gist;
  return [
    h("h2", {}, t("loop.gist.title")),
    h("p", {}, t("loop.gist.desc")),
    box,
    h("button", { class: "btn primary wide", type: "button", onclick: () => {
      Review.saveLoop(sceneKey(c, sc.k), { gist: box.value.trim() });
      finishStep(c, sc, "gist");
    } }, ...withIcon("arrow", t("loop.next"))),
    h("a", { class: "btn wide", href: `#/loop/${c.id}/${sc.k + 1}/read` }, t("loop.skip")),
  ];
}

// 대본 한 줄. 누르면 그 문장만 듣는다. 읽는 줄은 형광펜(글자 밑 띠)으로 표시
function sentenceRow(c, i, showKo, extra = null) {
  const s = c.sentences[i];
  return h("li", { class: "sent", "data-i": i },
    h("button", { class: "sent-play", type: "button", "aria-label": t("loop.play.one"),
      onclick: () => loopView.player.playSentences(c.sentences, [i]) },
      s.speaker && h("span", { class: "speaker" }, s.speaker),
      h("span", { class: "sent-en", lang: "en" }, s.en),
      showKo && h("span", { class: "sent-ko" }, s.ko)),
    extra);
}

function followReading(list) {
  loopView.player.onSentence = (i) => {
    list.querySelectorAll(".sent").forEach((el) => {
      const on = Number(el.dataset.i) === i;
      el.classList.toggle("reading", on);
      if (on) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
}

/* 3. 대본 보며 듣기 + 요지 확인 */
function readPanel(c, sc) {
  const p = loopView.player;
  p.listeners.clear();
  let showKo = Review.getSettings().show_ko ?? false;
  const list = h("ol", { class: "sent-list" });
  const drawList = () => list.replaceChildren(...sc.idx.map((i) => sentenceRow(c, i, showKo)));
  drawList();
  followReading(list);
  const modeBtn = h("button", { class: "chip small", type: "button", "aria-pressed": String(showKo), onclick: () => {
    showKo = !showKo;
    Review.setSettings({ show_ko: showKo });
    modeBtn.setAttribute("aria-pressed", String(showKo));
    drawList();
  } }, t("loop.read.ko"));

  const rec = Review.getLoop(sceneKey(c, sc.k));
  const scoreRow = h("div", { class: "btn-row" }, ["yes", "part", "no"].map((v) =>
    h("button", { class: "chip small", type: "button", "aria-pressed": String(rec.gist_score === v), onclick: (e) => {
      Review.saveLoop(sceneKey(c, sc.k), { gist_score: v });
      scoreRow.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
    } }, t(`loop.gist.${v}`))));
  return [
    h("h2", {}, t("loop.read.title")),
    h("p", {}, t("loop.read.desc")),
    h("div", { class: "btn-row" }, modeBtn),
    list,
    rec.gist && h("div", { class: "gist-check" },
      h("p", {}, h("b", {}, t("loop.gist.mine")), " ", rec.gist),
      h("p", { class: "muted small" }, t("loop.gist.ask")), scoreRow),
    nextButton(c, sc, "read"),
    playerBar(playToggle("loop.read.all", () => p.playRange(c.sentences, sc.start, sc.end))),
  ];
}

/* 4. 표현 모으기 (4단계에서 연다) */
function chunkPanel(c, sc) {
  return [
    h("h2", {}, t("loop.chunk.title")),
    h("p", {}, t("loop.chunk.soon")),
    h("a", { class: "btn primary wide", href: `#/loop/${c.id}/${sc.k + 1}/shadow` }, ...withIcon("arrow", t("loop.skip"))),
  ];
}

/* 5. 따라 말하기 + 녹음 비교 (F-10) */
function shadowPanel(c, sc) {
  const p = loopView.player;
  p.listeners.clear();
  const list = h("ol", { class: "sent-list" });
  const gapNote = h("p", { class: "gap-note", "aria-live": "polite" });
  p.onGap = (i, ms) => { gapNote.textContent = t("loop.shadow.gap", { s: (ms / 1000).toFixed(1) }); };
  p.listeners.add(() => { if (p.status !== "gap") gapNote.textContent = ""; });

  const recWhy = Recorder.why();
  const recTools = (i) => {
    if (recWhy) return null;
    const name = `${c.id}:${i}`;
    const recBtn = h("button", { class: "icon-btn", type: "button", "aria-label": t("loop.rec") });
    const mine = h("button", { class: "icon-btn", type: "button", "aria-label": t("loop.mine") }, icon("user"));
    const both = h("button", { class: "icon-btn", type: "button", "aria-label": t("loop.both") }, icon("both"));
    const draw = () => {
      const has = Boolean(Recorder.get(name));
      recBtn.replaceChildren(icon(recBtn.dataset.on ? "stop" : "mic"));
      mine.disabled = both.disabled = !has;
    };
    recBtn.onclick = async () => {
      if (recBtn.dataset.on) {
        delete recBtn.dataset.on;
        await Recorder.stop(name);
      } else {
        if (Recorder.recording()) return;           // 다른 문장을 녹음 중이면 먼저 멈춘다
        p.stop();
        try { await Recorder.start(); recBtn.dataset.on = "1"; } catch { gapNote.textContent = t("loop.rec.fail"); }
      }
      draw();
    };
    // 내 녹음 듣기 / 원음과 동시에 듣기 (차이를 귀로 비교)
    mine.onclick = () => { p.stop(); new Audio(Recorder.get(name).url).play(); };
    both.onclick = () => { new Audio(Recorder.get(name).url).play(); p.playSentences(c.sentences, [i]); };
    draw();
    return h("span", { class: "rec-tools" }, recBtn, mine, both);
  };

  list.replaceChildren(...sc.idx.map((i) => sentenceRow(c, i, false, recTools(i))));
  followReading(list);
  return [
    h("h2", {}, t("loop.shadow.title")),
    h("p", {}, t("loop.shadow.desc")),
    recWhy && h("p", { class: "warn-line small" }, t(`rec.why.${recWhy === "insecure" ? "insecure" : "unsupported"}`)),
    list,
    nextButton(c, sc, "shadow"),
    playerBar(gapNote, playToggle("loop.shadow.auto", () => p.playSentences(c.sentences, sc.idx, { shadow: true }))),
  ];
}

/* 6. 다시 말하기 (F-11): 관심사에 맞춘 질문 + 1분 녹음 */
const RETELL_MAX_MS = 60000;
function retellPanel(c, sc) {
  loopView.player.stop();
  const interests = Review.getSettings().interests;
  const topic = c.topics.find((x) => interests.includes(x)) ?? interests[0] ?? "daily";
  const recWhy = Recorder.why();
  const name = `${c.id}:retell:${sc.k}`;
  const status = h("p", { class: "info-line center", "aria-live": "polite" });
  const play = h("button", { class: "btn", type: "button", disabled: true,
    onclick: () => new Audio(Recorder.get(name).url).play() }, ...withIcon("user", t("loop.mine")));
  let timer = null;
  const recBtn = h("button", { class: "btn soft big", type: "button" });
  const draw = () => recBtn.replaceChildren(...withIcon(Recorder.recording() ? "stop" : "mic",
    t(Recorder.recording() ? "loop.retell.stop" : "loop.retell.start")));
  const stop = async () => {
    clearInterval(timer);
    const clip = await Recorder.stop(name);
    play.disabled = !clip;
    status.textContent = clip ? t("loop.retell.saved", { s: Math.round(clip.ms / 1000) }) : "";
    draw();
  };
  recBtn.onclick = async () => {
    if (Recorder.recording()) return stop();
    try { await Recorder.start(); } catch { status.textContent = t("loop.rec.fail"); return; }
    const started = Date.now();
    timer = setInterval(() => {
      const left = RETELL_MAX_MS - (Date.now() - started);
      status.textContent = t("loop.retell.left", { s: Math.max(0, Math.ceil(left / 1000)) });
      if (left <= 0) stop();
    }, 250);
    draw();
  };
  draw();
  return [
    h("h2", {}, t("loop.retell.title")),
    h("ol", { class: "tips" },
      h("li", {}, t("loop.retell.q1")),
      h("li", {}, t(`retell.${topic}`))),
    recWhy ? h("p", { class: "warn-line" }, t(`rec.why.${recWhy === "insecure" ? "insecure" : "unsupported"}`)) : [recBtn, status, play],
    nextButton(c, sc, "retell", "loop.finish"),
  ];
}

/* ---------- 마침·축하 ---------- */
function renderDone(id, sceneNo) {
  renderTopbar(false);
  const c = contentById(id);
  const met = Review.goalMet();
  const todayScenes = Object.keys(Review.loopToday()).length;
  const k = (Number(sceneNo) || 1) - 1;
  const nextScene = c && k + 1 < c.scenes.length ? k + 2 : null;
  app.replaceChildren(
    h("section", { class: "card welcome" },
      h("img", { src: "img/rabbit.svg", alt: "", class: "rabbit-big bounce" }),
      h("h2", {}, t(met ? "done.goal" : "done.step")),
      h("p", {}, t(met ? "done.goal.desc" : "done.step.desc")),
      h("p", { class: "muted small" }, t("done.today", { n: todayScenes }))),
    c && h("a", { class: "btn primary wide", href: `#/loop/${c.id}/${k + 1}` }, ...withIcon("arrow", t("done.continue"))),
    c && nextScene && h("a", { class: "btn soft wide", href: `#/loop/${c.id}/${nextScene}/listen` }, t("done.next", { k: nextScene })),
    h("a", { class: "btn wide", href: "#/" }, t("back")));
}
