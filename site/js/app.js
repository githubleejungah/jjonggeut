/* =========================================================
   쫑긋 시범판 — 화면 (1단계: 뼈대)
   프레임워크 없이 브라우저 기본 기능(DOM, fetch, Web Speech API)만 쓴다.
   필드워드(field-words) app.js의 작은 도구(t, h, icon, progressRing, inAppNotice, route)를 가져왔다.

   화면
     #/          홈: 오늘의 루프 (루프 화면은 3단계)
     #/progress  내 기록 (6단계)
     #/about     정보 · 소리 확인 · 기록 백업
   ========================================================= */

const APP_VERSION = "0.0.1";
const { speech } = Speech;

const state = {
  text: {},           // 화면 문구 (i18n/ko.json)
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
function soundTestButton() {
  const parts = () => [
    { text: t("about.test.en"), lang: "en-US" },
    { pause: 600 },
    { text: t("about.test.ko"), lang: "ko-KR" },
  ];
  const btn = h("button", { class: "btn soft", type: "button", onclick: () => speech.toggle("test", parts) });
  const draw = () => {
    const playing = speech.owner === "test" && speech.status === "playing";
    btn.replaceChildren(...withIcon(playing ? "stop" : "speaker", t(playing ? "about.voice.stop" : "about.voice.test")));
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
    app.replaceChildren(
      h("p", { class: "step-label" }, t("welcome.step", { n: 1, total: 2 })),
      h("section", { class: "card welcome" },
        h("img", { src: "img/rabbit.svg", alt: "", class: "rabbit-big" }),
        h("h2", {}, t("welcome.sound.title")),
        h("p", {}, t("welcome.sound.desc")),
        speech.supported ? soundTestButton() : h("p", { class: "warn-line" }, t("about.voice.unsupported")),
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
function renderHome() {
  renderTopbar(true);
  const p = Review.plan([]);   // 2단계에서 콘텐츠·카드가 생기면 실제 카드 목록을 넘긴다
  const interests = Review.getSettings().interests;
  app.replaceChildren(
    h("p", { class: "tagline" }, t("app.tagline")),
    interests.length > 0 && h("p", { class: "interest-line" },
      h("span", {}, t("home.interests", { list: interestNames(interests) })),
      h("a", { href: "#/interests" }, t("home.interests.change"))),
    h("section", { class: "start-panel" },
      h("div", { class: "start-row" },
        progressRing(p.done, p.goal, 104, true),
        h("div", { class: "start-text" },
          h("h2", {}, t("home.today")),
          h("p", { class: "info-line" }, t("home.goal", { done: p.done, goal: p.goal })))),
      h("button", { class: "btn primary", disabled: true }, ...withIcon("arrow", t("home.start"))),
      h("p", { class: "muted small" }, t("home.soon"))),
    h("section", { class: "rabbit-card" },
      h("img", { src: "img/rabbit.svg", alt: "", class: "rabbit-big" }),
      h("p", {}, t("home.rabbit"))),
    h("nav", { class: "link-list" },
      linkRow("#/progress", "chart", t("home.progress"), t("home.progress.desc"))),
    // 정보 화면은 필요한 사람만 찾아 들어가도록 맨 아래 작은 링크로 둔다
    h("p", { class: "footer" }, h("a", { href: "#/about" }, t("home.about"))),
  );
}

/* ---------- 화면 2: 내 기록 (6단계에서 채운다) ---------- */
function renderProgress() {
  renderTopbar(false);
  app.replaceChildren(h("h2", {}, t("progress.title")), h("p", { class: "muted" }, t("progress.soon")));
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
  // 처음 시작 화면을 마치지 않았으면 먼저 그것부터 (정보 화면은 언제든 볼 수 있게 예외)
  if (!Review.getSettings().onboarded && hash !== "#/about") renderWelcome(1);
  else if (hash === "#/about") renderAbout();
  else if (hash === "#/progress") renderProgress();
  else if (hash === "#/interests") renderInterests();
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
fetch("i18n/ko.json?v=2026111206")
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then((text) => {
    state.text = text;
    inAppNotice();
    window.addEventListener("hashchange", route);
    route();
  })
  .catch((err) => {
    console.error(err);
    app.replaceChildren(h("p", {}, "화면 문구를 불러오지 못했어요. 잠시 뒤 새로고침해 주세요."));
  });
