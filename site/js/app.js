/* =========================================================
   쫑긋 시범판 — 화면 (1단계: 뼈대)
   프레임워크 없이 브라우저 기본 기능(DOM, fetch, Web Speech API)만 쓴다.
   필드워드(field-words) app.js의 작은 도구(t, h, icon, progressRing, inAppNotice, route)를 가져왔다.

   화면
     #/                   홈: 오늘의 루프 (이어 하기 / 콘텐츠 고르기)
     #/library            콘텐츠 고르기 (loop.js)
     #/loop/<id>/<단계>   오늘의 루프 6단계 (loop.js)
     #/done/<id>          마침·축하 (loop.js)
     #/progress           내 기록 (6단계)
     #/about              정보 · 소리 확인 · 기록 백업
   ========================================================= */

const APP_VERSION = "0.0.3";
const { speech } = Speech;

const state = {
  text: {},           // 화면 문구 (i18n/ko.json)
  contents: [],       // 콘텐츠 (data/contents.json)
  licenses: [],       // 라이선스 (출처 표기)
};

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");

/* ---------- 작은 도구들 ---------- */

// 화면 문구 가져오기. {n} 같은 자리는 값으로 바꾼다.
function t(key, vars = {}) {
  let s = state.text[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// 요소 만들기 도우미. 글자는 textContent로만 넣는다 (innerHTML에 넣으면 XSS 위험).
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// 직접 그린 선 아이콘 (이모지 대신). 선 색은 글자색(currentColor)을 따라간다.
const ICONS = {
  speaker: "M4 9v6h4l5 4V5L8 9H4z M16 8.5a5 5 0 0 1 0 7 M18.5 6a8.5 8.5 0 0 1 0 12",
  stop: "M7 7h10v10H7z",
  chart: "M4 20V4 M4 20h16 M8 16l4-5 3 3 5-6",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v6 M12 7.5v.5",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  download: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  upload: "M12 20V9 M7 14l5-5 5 5 M5 4h14",
  back: "M15 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 5v14 M5 12h14",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14 M16 5v14",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5 11a7 7 0 0 0 14 0 M12 18v3",
  user: "M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M4 21c0-4 3.6-7 8-7s8 3 8 7",
  both: "M9 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M15 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  speed: "M4 17a8 8 0 1 1 16 0 M12 17l4.5-5 M12 9v1.5",
  book: "M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5z M12 6v13.5",
};
function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}
const withIcon = (name, text) => [icon(name), h("span", {}, text)];

// 진행 링: 오늘 목표 대비 채운 비율 (필드워드 progressRing)
let ringSeq = 0;
function progressRing(done, goal, size, labeled = false) {
  const ns = "http://www.w3.org/2000/svg";
  const stroke = size >= 72 ? 10 : 6;
  const r = size / 2 - stroke / 2 - 2, len = 2 * Math.PI * r;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "pring");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${done} / ${goal}`);
  const circle = (cls, offset) => {
    const c = document.createElementNS(ns, "circle");
    c.setAttribute("cx", size / 2); c.setAttribute("cy", size / 2); c.setAttribute("r", r);
    c.setAttribute("class", cls);
    if (offset != null) { c.style.strokeDasharray = `${len}`; c.style.strokeDashoffset = `${offset}`; }
    return c;
  };
  const ratio = goal ? Math.min(done / goal, 1) : 0;
  const gid = `ringgrad${++ringSeq}`;
  const defs = document.createElementNS(ns, "defs");
  const grad = document.createElementNS(ns, "linearGradient");
  grad.setAttribute("id", gid);
  grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", "1"); grad.setAttribute("y2", "1");
  [["0", "var(--ring-from)"], ["1", "var(--ring-to)"]].forEach(([o, c]) => {
    const st = document.createElementNS(ns, "stop");
    st.setAttribute("offset", o); st.style.stopColor = c;
    grad.append(st);
  });
  defs.append(grad);
  const track = circle("ring-track");
  const bar = circle("ring-bar", len * (1 - ratio));
  track.style.strokeWidth = bar.style.strokeWidth = `${stroke}px`;
  bar.setAttribute("stroke", `url(#${gid})`);
  svg.append(defs, track, bar);
  svg.style.width = svg.style.height = `${size}px`;
  if (!labeled) return svg;
  return h("div", { class: "pring-wrap", style: `width:${size}px;height:${size}px` }, svg,
    h("span", { class: "pring-label" }, h("b", {}, done), h("small", {}, `/ ${goal}`)));
}

// 다른 화면으로 가는 줄 (버튼 줄에 섞지 않는다: 디자인 규칙 1-5)
function linkRow(href, iconName, title, desc) {
  return h("a", { class: "link-row", href },
    h("span", { class: "link-row-icon" }, icon(iconName)),
    h("span", { class: "link-row-text" }, h("b", {}, title), h("small", {}, desc)),
    icon("chevron"));
}

function renderTopbar(home) {
  topbar.replaceChildren(home
    ? h("h1", { class: "brand" }, h("img", { src: "img/rabbit.svg", alt: "", class: "brand-rabbit" }), t("app.name"))
    : h("a", { class: "back", href: "#/" }, withIcon("back", t("back"))));
}

/* ---------- 관심사 ---------- */
// 처음 시작할 때 최대 3개를 고른다. 같은 수준 안에서 관심사 콘텐츠를 먼저 보여 주고(F-03),
// 다시 말하기 질문을 관심사에 맞춘다(F-11). 익숙한 주제는 알아듣기를 돕는다(기능요구서 근거).
const INTERESTS = ["work", "travel", "daily", "food", "health", "science", "culture", "sports", "news"];
const MAX_INTERESTS = 3;

// 관심사 고르기 칩. 고른 것은 색만이 아니라 체크 표시로도 구분한다 (디자인 규칙: 색만으로 구분하지 않기)
function interestPicker(initial, onChange) {
  const chosen = new Set(initial);
  const count = h("p", { class: "info-line", "aria-live": "polite" });
  const grid = h("div", { class: "chips" });
  const draw = () => {
    grid.replaceChildren(...INTERESTS.map((id) => {
      const on = chosen.has(id);
      return h("button", {
        class: `chip${on ? " on" : ""}`, type: "button", "aria-pressed": String(on),
        disabled: !on && chosen.size >= MAX_INTERESTS,
        onclick: () => { on ? chosen.delete(id) : chosen.add(id); draw(); },
      }, on ? icon("check") : icon("plus"), h("span", {}, t(`interest.${id}`)));
    }));
    count.textContent = t("interest.count", { n: chosen.size, max: MAX_INTERESTS });
    onChange([...chosen]);
  };
  draw();
  return h("div", {}, grid, count);
}

const interestNames = (ids) => ids.map((id) => t(`interest.${id}`)).join(" · ");

/* ---------- 색 테마 ---------- */
// 핑크가 맞지 않는 사람도 있어 색을 고르게 한다 (2026-11-12 결정). 성별로 추측하지 않고 본인이 고른다.
// swatch: 고르기 버튼에 보여 줄 주요 색 (style.css의 --accent와 같은 값)
const THEMES = { peach: "#a8475f", forest: "#3f6b57", sea: "#2f5d8a", ink: "#3b3f46" };

function applyTheme(id) {
  const theme = id in THEMES ? id : "peach";
  if (theme === "peach") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEMES[theme]);
}

// 고른 색은 바로 화면에 적용하고 저장한다. 고른 것은 체크 표시로도 구분한다.
function themePicker() {
  const box = h("div", { class: "theme-picker", role: "group", "aria-label": t("theme.title") });
  const draw = () => {
    const now = Review.getSettings().theme;
    box.replaceChildren(...Object.entries(THEMES).map(([id, color]) =>
      h("button", { class: "theme-btn", type: "button", "aria-pressed": String(id === now),
        onclick: () => { Review.setSettings({ theme: id }); applyTheme(id); draw(); } },
        h("span", { class: "swatch", style: `background:${color}` }, id === now && icon("check")),
        h("span", {}, t(`theme.${id}`)))));
  };
  draw();
  return h("div", {}, h("p", { class: "theme-title" }, t("theme.title")), box);
}

/* ---------- 소리 확인 (처음 시작 화면과 정보 화면이 함께 쓴다) ---------- */
// 문장마다 언어를 정해서 넘긴다 (영어는 영어 음성, 한국어는 한국어 음성)
const SHORT_TEST = [
  { key: "about.test.en", lang: "en-US" },
  { pause: 600 },
  { key: "about.test.ko", lang: "ko-KR" },
];

// 처음 만날 때 들려주는 토끼 이야기 (2026-11-12): 먹는 걸 좋아해서 귀로 갈 살이 볼로 갔다.
// 소리 확인을 겸한다: 영어와 한국어 음성이 둘 다 나오는지 이 이야기로 확인한다.
// 마지막에 영어 표현 "I'm all ears"(귀 기울여 듣고 있어요)를 하나 배운다.
const RABBIT_STORY = [
  { key: "story.1", lang: "en-US" },
  { key: "story.2", lang: "ko-KR" },
  { key: "story.3", lang: "ko-KR" },
  { key: "story.4", lang: "ko-KR" },
  { pause: 400 },
  { key: "story.5", lang: "en-US" },
  { key: "story.6", lang: "ko-KR" },
];

function soundTestButton(script = SHORT_TEST, labelKey = "about.voice.test") {
  const parts = () => script.map((p) => (p.pause ? p : { text: t(p.key), lang: p.lang, sec: p.key }));
  const btn = h("button", { class: "btn soft", type: "button", onclick: () => speech.toggle(labelKey, parts) });
  const draw = () => {
    const playing = speech.owner === labelKey && speech.status === "playing";
    btn.replaceChildren(...withIcon(playing ? "stop" : "speaker", t(playing ? "about.voice.stop" : labelKey)));
  };
  speech.listeners.add(draw);
  draw();
  return btn;
}

// 소리가 안 날 때 해 볼 것 (필드워드에서 들어온 문의 순서대로)
function soundTips() {
  return h("ol", { class: "tips" }, ...["1", "2", "3", "4"].map((n) => h("li", {}, t(`sound.tip${n}`))));
}

/* ---------- 처음 시작 화면: ① 소리 확인 → ② 관심사 고르기 ---------- */
function renderWelcome(step = 1) {
  renderTopbar(true);
  if (step === 1) {
    const tips = h("div", { hidden: true }, soundTips());
    // 이야기 말풍선: 읽는 줄을 색칠해서 어디를 듣고 있는지 보이게 한다
    const lines = RABBIT_STORY.filter((p) => p.key).map((p) =>
      h("p", { class: `story-line${p.lang.startsWith("en") ? " en" : ""}`, "data-sec": p.key, lang: p.lang.slice(0, 2) }, t(p.key)));
    speech.onSentence = (p) => lines.forEach((el) => el.classList.toggle("reading", el.dataset.sec === p.sec));
    speech.listeners.add(() => { if (speech.status === "idle") lines.forEach((el) => el.classList.remove("reading")); });
    app.replaceChildren(
      h("p", { class: "step-label" }, t("welcome.step", { n: 1, total: 2 })),
      h("section", { class: "card welcome" },
        h("img", { src: "img/rabbit.svg", alt: "", class: "rabbit-big" }),
        h("h2", {}, t("welcome.sound.title")),
        h("p", { class: "muted small" }, t("welcome.sound.desc")),
        h("div", { class: "story" }, lines),
        speech.supported ? soundTestButton(RABBIT_STORY, "welcome.story.play") : h("p", { class: "warn-line" }, t("about.voice.unsupported")),
        themePicker()),
      h("button", { class: "btn primary wide", type: "button", onclick: () => renderWelcome(2) },
        ...withIcon("arrow", t("welcome.sound.ok"))),
      h("button", { class: "btn wide", type: "button", onclick: () => { tips.hidden = false; } }, t("welcome.sound.no")),
      tips);
    return;
  }
  let picked = Review.getSettings().interests;
  const start = h("button", { class: "btn primary wide", type: "button", onclick: () => {
    Review.setSettings({ interests: picked, onboarded: true });
    location.hash = "#/";
    route();
  } }, ...withIcon("arrow", t("welcome.start")));
  app.replaceChildren(
    h("p", { class: "step-label" }, t("welcome.step", { n: 2, total: 2 })),
    h("section", { class: "card" },
      h("h2", {}, t("interest.title")),
      h("p", {}, t("interest.desc")),
      interestPicker(picked, (ids) => { picked = ids; start.disabled = ids.length === 0; })),
    start,
    h("p", { class: "muted small center" }, t("interest.later")));
}

/* ---------- 관심사 바꾸기 ---------- */
function renderInterests() {
  renderTopbar(false);
  let picked = Review.getSettings().interests;
  const save = h("button", { class: "btn primary wide", type: "button", onclick: () => {
    Review.setSettings({ interests: picked });
    location.hash = "#/";
  } }, t("interest.save"));
  app.replaceChildren(
    h("h2", {}, t("interest.title")),
    h("p", {}, t("interest.desc")),
    interestPicker(picked, (ids) => { picked = ids; save.disabled = ids.length === 0; }),
    save);
}

/* ---------- 화면 1: 홈 ---------- */
// 이어 할 콘텐츠: 가장 최근에 손댄 장면이 있고, 아직 다 마치지 않은 것 (장면 계산은 loop.js)
function currentContent() {
  return state.contents
    .map((c) => ({ c, last: lastTouched(c) }))
    .filter(({ c, last }) => last && scenesDone(c) < c.scenes.length)
    .sort((a, b) => b.last.rec.updated_at.localeCompare(a.last.rec.updated_at))[0] ?? null;
}

function renderHome() {
  renderTopbar(true);
  const interests = Review.getSettings().interests;
  const cur = currentContent();
  // 진행 링: 이어 할 콘텐츠의 마친 장면 수 / 전체 장면 수
  const total = cur ? cur.c.scenes.length : 1;
  const doneSteps = cur ? scenesDone(cur.c) : 0;
  const met = Review.goalMet(Review.getCards());
  app.replaceChildren(
    h("p", { class: "tagline" }, t("app.tagline")),
    interests.length > 0 && h("p", { class: "interest-line" },
      h("span", {}, t("home.interests", { list: interestNames(interests) })),
      h("a", { href: "#/interests" }, t("home.interests.change"))),
    h("section", { class: "start-panel" },
      h("div", { class: "start-row" },
        progressRing(doneSteps, total, 104, true),
        h("div", { class: "start-text" },
          h("h2", {}, t("home.today")),
          h("p", { class: "info-line" }, cur ? t("home.scene", { title: cur.c.title_ko, k: firstOpenScene(cur.c) + 1, n: cur.c.scenes.length }) : t("home.none")),
          met && h("p", { class: "goal-line" }, icon("check"), t("home.goal.met")))),
      cur
        ? h("a", { class: "btn primary", href: `#/loop/${cur.c.id}/${firstOpenScene(cur.c) + 1}` }, ...withIcon("arrow", t("home.continue")))
        : h("a", { class: "btn primary", href: "#/library" }, ...withIcon("arrow", t("home.start")))),
    rabbitCard(),
    h("nav", { class: "link-list" },
      linkRow("#/library", "book", t("home.library"), t("home.library.desc", { n: state.contents.length })),
      linkRow("#/progress", "chart", t("home.progress"), t("home.progress.desc"))),
    // 정보 화면은 필요한 사람만 찾아 들어가도록 맨 아래 작은 링크로 둔다
    h("p", { class: "footer" }, h("a", { href: "#/about" }, t("home.about"))),
  );
}

// 오늘의 계절·기념일 (꾸미기를 끈 사람은 null). 날짜는 앱의 하루 경계(새벽 4시)를 따른다
function todayOccasion() {
  return Review.getSettings().seasonal === false ? null : Rabbit.occasion(Review.today());
}
const rabbitState = () => ({ ...Rabbit.START, ...(Review.getSettings().rabbit ?? {}) });

// 홈의 토끼 카드: 지금 살찐 정도 + 오늘의 차림. 공휴일이면 그날의 영어 한 줄을 들려준다
function rabbitCard() {
  const occ = todayOccasion();
  const art = Rabbit.el({ chub: rabbitState().chub, wear: occ?.wear, label: t("rabbit.alt") }, "rabbit-art");
  return h("section", { class: "rabbit-card" },
    art,
    h("div", { class: "rabbit-text" },
      occ?.holiday
        ? [h("p", { class: "small" }, h("b", {}, t("occ.today", { name: t(`occ.${occ.id}.name`) }))),
           h("p", { class: "occ-en", lang: "en" }, t(`occ.${occ.id}.en`)),
           h("p", { class: "muted small" }, t(`occ.${occ.id}.ko`)),
           soundTestButton([{ key: `occ.${occ.id}.en`, lang: "en-US" }, { key: `occ.${occ.id}.ko`, lang: "ko-KR" }], "occ.listen")]
        : h("p", {}, t("home.rabbit"))));
}

// 토끼 모음 (2026-11-12): 계절·기념일 차림과 살찐 단계를 한눈에. 정보 화면에서 들어간다
function renderRabbits() {
  renderTopbar(false);
  const tile = (opts, label) => h("figure", { class: "rabbit-tile" },
    Rabbit.el({ ...opts, label }, "rabbit-art"), h("figcaption", {}, label));
  app.replaceChildren(
    h("h2", {}, t("rabbits.title")),
    h("p", { class: "muted small" }, t("rabbits.desc")),
    h("h3", {}, t("rabbits.chub")),
    h("div", { class: "rabbit-grid" },
      tile({ chub: 0 }, t("rabbits.chub.0")), tile({ chub: 0, snack: 0 }, t("rabbits.snack")),
      tile({ chub: 1, snack: 1 }, t("rabbits.chub.1")), tile({ chub: 2 }, t("rabbits.chub.2")),
      tile({ chub: 3 }, t("rabbits.chub.3")), tile({ chub: 2, workout: true }, t("rabbits.workout"))),
    h("h3", {}, t("rabbits.seasons")),
    h("div", { class: "rabbit-grid" }, ["spring", "summer", "autumn", "winter"].map((id) =>
      tile({ wear: id }, t(`occ.${id}.name`)))),
    h("h3", {}, t("rabbits.holidays")),
    h("div", { class: "rabbit-grid" }, Rabbit.ALL_OCCASIONS.slice(4).map((id) =>
      tile({ wear: Rabbit.wearOf(id) }, t(`occ.${id}.name`)))),
    h("p", { class: "muted small" }, t("rabbits.dates", { from: Rabbit.lunarYears()[0], to: Rabbit.lunarYears().at(-1) })),
    h("a", { class: "btn wide", href: "#/about" }, t("back")));
}

/* ---------- 화면 2: 내 기록 ---------- */
// 내 기록 (2026-11-12): 저장된 기록으로만 그린다 (화면 값이 아니라 저장소가 기준)
let progressMonth = null;   // 달력에 보이는 달 "YYYY-MM"
function renderProgress() {
  renderTopbar(false);
  const log = Review.getLoopLog();
  const days = Object.keys(log).filter((d) => Object.values(log[d]).some((s) => s.length)).sort();
  const cards = Review.getCards();
  const contents = state.contents.filter((c) => c.reviewed);
  const touched = contents.filter((c) => c.scenes.some((_, k) => Review.getLoop(sceneKey(c, k)).updated_at));
  if (!days.length && !cards.length) {
    app.replaceChildren(h("h2", {}, t("progress.title")), h("p", { class: "muted" }, t("progress.empty")),
      h("a", { class: "btn primary wide", href: "#/library" }, t("home.start")));
    return;
  }
  const stat = (label, value) => h("div", { class: "stat" }, h("span", { class: "stat-num" }, value), h("span", { class: "muted small" }, label));

  // 달력: 공부한 날은 바탕색 + 체크 모양 (색만으로 구분하지 않기)
  const studied = new Set(days);
  progressMonth ??= Review.today().slice(0, 7);
  const cal = h("div", {});
  const drawCal = () => {
    const [y, m] = progressMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const count = new Date(y, m, 0).getDate();
    const cells = t("progress.weekdays").split(",").map((w) => h("span", { class: "cal-head" }, w));
    for (let i = 0; i < first; i++) cells.push(h("span", {}));
    for (let d = 1; d <= count; d++) {
      const iso = `${progressMonth}-${String(d).padStart(2, "0")}`;
      const on = studied.has(iso);
      cells.push(h("span", { class: `cal-day${on ? " on" : ""}${iso === Review.today() ? " today" : ""}`,
        "aria-label": on ? t("progress.day.done", { d }) : null }, String(d), on && icon("check")));
    }
    const shift = (n) => () => {
      const dt = new Date(y, m - 1 + n, 1);
      progressMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      drawCal();
    };
    cal.replaceChildren(
      h("div", { class: "cal-nav" },
        h("button", { class: "icon-btn", type: "button", "aria-label": t("progress.prev"), onclick: shift(-1) }, "‹"),
        h("b", {}, t("progress.month", { y, m })),
        h("button", { class: "icon-btn", type: "button", "aria-label": t("progress.next"), onclick: shift(1) }, "›")),
      h("div", { class: "cal-grid" }, cells));
  };
  drawCal();

  const gists = touched.flatMap((c) => c.scenes.map((_, k) => ({ c, k, rec: Review.getLoop(sceneKey(c, k)) })))
    .filter((x) => x.rec.gist?.trim())
    .sort((a, b) => b.rec.updated_at.localeCompare(a.rec.updated_at)).slice(0, 5);
  const recentCards = [...cards].reverse().slice(0, 10);

  app.replaceChildren(...[
    h("h2", {}, t("progress.title")),
    h("div", { class: "stat-row" },
      stat(t("progress.days"), t("progress.unit.day", { n: days.length })),
      stat(t("progress.streak"), t("progress.unit.day", { n: Review.loopStreak() })),
      stat(t("progress.cards"), t("progress.unit.card", { n: cards.length }))),
    h("section", { class: "card" }, h("h3", {}, t("progress.calendar")), cal),
    touched.length > 0 && h("section", { class: "card" }, h("h3", {}, t("progress.scenes")),
      touched.map((c) => h("a", { class: "progress-line", href: `#/loop/${c.id}/${firstOpenScene(c) + 1}` },
        h("span", {}, h("b", {}, c.title_ko), " ",
          h("span", { class: "muted small" }, t("progress.scene.line", { n: scenesDone(c), total: c.scenes.length }))),
        h("span", { class: "progress-bar" }, h("span", { style: `width:${Math.round(scenesDone(c) / c.scenes.length * 100)}%` }))))),
    gists.length > 0 && h("section", { class: "card" }, h("h3", {}, t("progress.gists")),
      gists.map((g) => h("div", { class: "gist-line" },
        h("p", {}, g.rec.gist),
        h("p", { class: "muted small" }, t("progress.gist.where", { title: g.c.title_ko, k: g.k + 1, date: g.rec.updated_at }))))),
    recentCards.length > 0 && h("section", { class: "card" }, h("h3", {}, t("progress.recent.cards")),
      h("ul", { class: "card-list" }, recentCards.map((c) => h("li", {},
        h("b", { lang: "en" }, c.text),
        c.mine && h("span", { class: "muted small" }, t("progress.mine"), " ", h("span", { lang: "en" }, c.mine)))))),
    h("p", { class: "muted small" }, t("progress.recording")),
  ].filter(Boolean));
}

/* ---------- 화면 3: 정보 · 소리 확인 · 백업 ---------- */
function renderAbout() {
  renderTopbar(false);
  const voiceName = (lang) => speech.voiceFor(lang)?.name ?? t("about.voice.none");
  const info = h("dl", { class: "voice-info" });
  const fillInfo = () => info.replaceChildren(
    h("dt", {}, t("about.voice.en")), h("dd", {}, voiceName("en-US"),
      !speech.voiceFor("en-US") && h("small", { class: "warn-line" }, t("about.voice.noen"))),
    h("dt", {}, t("about.voice.ko")), h("dd", {}, voiceName("ko-KR")),
    speech.lastError && h("dt", {}, t("about.voice.error")), speech.lastError && h("dd", {}, speech.lastError));
  fillInfo();
  // 음성 목록은 늦게 준비되는 브라우저가 있다. 재생 뒤에는 마지막 오류도 다시 보여 준다
  if (speech.supported) speechSynthesis.addEventListener?.("voiceschanged", fillInfo);
  speech.listeners.add(fillInfo);
  const interests = Review.getSettings().interests;

  app.replaceChildren(
    h("h2", {}, t("about.title")),
    h("p", { class: "muted" }, t("about.version", { v: APP_VERSION })),
    h("section", { class: "card" },
      h("h3", {}, t("about.voice")),
      speech.supported ? [info, soundTestButton(), soundTips()] : h("p", {}, t("about.voice.unsupported"))),
    h("section", { class: "card" }, themePicker()),
    h("section", { class: "card" },
      h("h3", {}, t("about.seasonal")),
      h("label", { class: "check-line" },
        h("input", { type: "checkbox", checked: Review.getSettings().seasonal !== false ? "checked" : null,
          onchange: (ev) => Review.setSettings({ seasonal: ev.currentTarget.checked }) }),
        " ", t("about.seasonal.desc")),
      h("a", { href: "#/rabbits" }, t("rabbits.title"))),
    h("nav", { class: "link-list" },
      linkRow("#/interests", "plus", t("interest.title"),
        interests.length ? interestNames(interests) : t("interest.none"))),
    backupSection(),
    h("section", { class: "card" },
      h("h3", {}, t("about.sources")),
      h("p", {}, t("about.sources.desc"))),
  );
}

// 기록 백업: 파일로 내보내고 다시 가져오기 (Review.exportAll / importAll)
function backupSection() {
  const msg = h("p", { class: "muted small", role: "status" });
  const exportBtn = h("button", { class: "btn", onclick: () => {
    const blob = new Blob([JSON.stringify(Review.exportAll(), null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `jjonggeut-backup-${Review.today()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } }, ...withIcon("download", t("about.backup.export")));
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async () => {
    try {
      const n = Review.importAll(JSON.parse(await file.files[0].text()));
      msg.textContent = t("about.backup.done", { n });
    } catch (e) {
      msg.textContent = t("about.backup.fail", { msg: e.message });
    }
    file.value = "";
  } });
  const importBtn = h("button", { class: "btn", onclick: () => file.click() }, ...withIcon("upload", t("about.backup.import")));
  return h("section", { class: "card" },
    h("h3", {}, t("about.backup")),
    h("p", {}, t("about.backup.desc")),
    h("div", { class: "btn-row" }, exportBtn, importBtn, file),
    msg);
}

/* ---------- 주소에 따라 화면 고르기 (해시 라우팅) ---------- */
function route() {
  speech.stop();
  speech.listeners.clear();
  speech.onSentence = null;
  const hash = location.hash || "#/";
  const [, page, id, scene, step] = hash.split("/");
  // 루프 화면 안에서 단계만 바꿀 때는 원음 플레이어를 그대로 둔다 (같은 파일을 다시 받지 않게)
  if (!(page === "loop" && id === loopView.contentId)) cleanupLoop();
  else loopView.player?.stop();
  // 처음 시작 화면을 마치지 않았으면 먼저 그것부터 (정보 화면은 언제든 볼 수 있게 예외)
  if (!Review.getSettings().onboarded && hash !== "#/about") renderWelcome(1);
  else if (hash === "#/about") renderAbout();
  else if (hash === "#/progress") renderProgress();
  else if (hash === "#/rabbits") renderRabbits();
  else if (hash === "#/interests") renderInterests();
  else if (page === "library") renderLibrary();
  else if (page === "loop") renderLoop(decodeURIComponent(id ?? ""), scene, step);
  else if (page === "done") renderDone(decodeURIComponent(id ?? ""), scene);
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- 앱 안 브라우저 안내 ---------- */
// 카카오톡 같은 앱 안 브라우저는 음성·화면 켜 두기가 막히는 경우가 많다 (필드워드 교훈 2).
function inAppNotice() {
  const ua = navigator.userAgent;
  const kakao = /KAKAOTALK/i.test(ua);
  const other = /NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
  if (!kakao && !other) return;
  const box = h("div", { class: "inapp-notice", role: "status" },
    h("p", {}, kakao ? t("inapp.kakao") : t("inapp.other")),
    kakao && h("a", { class: "btn small primary",
      href: "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href) }, t("inapp.open")));
  document.querySelector(".wrap").prepend(box);
}

/* ---------- 시작 ---------- */
applyTheme(Review.getSettings().theme);   // 문구를 받기 전에 먼저 색을 입혀 깜빡임을 줄인다
const getJSON = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(`${url} ${r.status}`); return r.json(); });
Promise.all([getJSON("i18n/ko.json?v=2026111220"), getJSON("data/contents.json?v=2026111219")])
  .then(([text, data]) => {
    state.text = text;
    state.contents = data.contents ?? [];
    state.licenses = data.licenses ?? [];
    state.series = data.series ?? [];
    inAppNotice();
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((err) => {
    console.error(err);
    app.replaceChildren(h("p", {}, "화면 문구를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요."));
  });
