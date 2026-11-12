/* =========================================================
   쫑긋 — 학습 기록과 복습 규칙 (화면 없음)
   필드워드(field-words)의 review.js를 가져와 쫑긋에 맞게 바꿨다 (2026-11-12).
     바꾼 것: 저장 이름 앞머리, 복습 간격(1·3·7·14·30·60일 + 장기 기억 120일),
              하루가 바뀌는 시각(새벽 4시), 백업 파일 이름표
   화면(app.js)과 나눠 둔 이유: 규칙만 따로 시험할 수 있게 (관심사 분리)
   브라우저에서는 전역 Review로, Node.js 시험에서는 require()로 쓴다.

   저장 이름 규칙
     jg:v1:review:<카드 id>  복습 기록
     jg:v1:today             오늘 기록
     jg:v1:log               날짜별 일지 (지우지 않는다)
     jg:v1:settings          하루 목표 등 설정
   ========================================================= */

const Review = (() => {
  const PREFIX = "jg:v1:";          // 필드워드(fw:v1:)와 같은 도메인에 있어도 기록이 섞이지 않게

  // 라이트너 상자 6개의 복습 간격(일). 학습법 문서의 1·3·7·14·30일에 60일을 더했다.
  // 상자 7 = 장기 기억 유지(120일마다 확인)
  const INTERVALS = [1, 3, 7, 14, 30, 60];
  const MAINTAIN_BOX = 7;
  const MAINTAIN_DAYS = 120;
  const LONG_TERM_FROM_BOX = 5;     // 상자 5(30일 간격)에서 맞히면 = 30일 넘게 기억한 것 → 장기 기억
  const DAY_STARTS_AT_HOUR = 4;     // 하루는 새벽 4시에 바뀐다 (밤늦게 공부해도 "오늘"로 친다)
  const DROP_TWO_FROM_BOX = 4;      // 상자 4 이상에서 틀리면 1번으로 가지 않고 두 칸만 내린다
  const HISTORY_KEEP = 20;

  // interests: 처음 시작할 때 고른 관심사(최대 3개), onboarded: 처음 시작 화면을 마쳤는지
  const DEFAULT_SETTINGS = { daily_goal: 10, min_goal: 3, interests: [], onboarded: false, theme: "peach" };
  const SECONDS_PER_CARD = 30;      // 남은 시간 계산용 (한 장에 약 30초)
  const MIN_NEW_RATIO = 0.3;        // 하루 목표 중 새 카드에 남겨 둘 비율

  // ----- 저장소 -----
  // 브라우저 localStorage를 쓰되, 못 쓰는 환경(사생활 보호 창, 시험)에서는 메모리에 둔다.
  const memory = new Map();
  let store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { memory.set(k, v); } },
    keys: () => { try { return Object.keys(localStorage); } catch { return [...memory.keys()]; } },
  };
  function useStore(custom) { store = custom; }          // 시험에서 가짜 저장소를 끼울 때

  const read = (key, fallback) => {
    const raw = store.get(PREFIX + key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  };
  const write = (key, value) => store.set(PREFIX + key, JSON.stringify(value));

  // ----- 날짜 (기기 시간대 기준 "YYYY-MM-DD") -----
  // 하루 경계는 새벽 4시: 11월 13일 새벽 1시에 공부하면 11월 12일 기록이 된다.
  // 화면 값이 아니라 이 함수로만 날짜를 정해야 앱을 다시 열어도 같은 날로 계산된다.
  let clock = () => new Date();
  function useClock(fn) { clock = fn; }                    // 시험에서 날짜를 정할 때
  const pad = (n) => String(n).padStart(2, "0");
  function dateOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function today() {
    const now = clock();
    return dateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - DAY_STARTS_AT_HOUR));
  }
  function addDays(date, n) {
    const [y, m, d] = date.split("-").map(Number);
    return dateOf(new Date(y, m - 1, d + n));
  }

  // ----- 5단계 상태: 확신도 × 정답 여부 -----
  // confidence: "sure"(확실해요) / "unsure"(헷갈려요) / "dontknow"(몰라요)
  function classify(confidence, correct) {
    if (confidence === "dontknow") return "unknown";        // 모름
    if (confidence === "sure") return correct ? "known" : "misconception"; // 앎 / 착각
    return correct ? "shaky" : "confused";                  // 불안한 앎 / 헷갈림
  }

  // ----- 상자 이동 규칙 -----
  function nextBox(box, status) {
    if (status === "known") return Math.min(Math.max(box, 0) + 1, MAINTAIN_BOX);
    if (status === "shaky") return Math.max(box, 1);        // 같은 간격으로 한 번 더
    return box >= DROP_TWO_FROM_BOX ? box - 2 : 1;          // 헷갈림·착각·모름
  }
  function intervalFor(box) {
    return box >= MAINTAIN_BOX ? MAINTAIN_DAYS : INTERVALS[Math.max(box, 1) - 1];
  }

  function get(id) { return read(`review:${id}`, null); }

  // 한 번 체크한 결과를 기록한다. 돌려주는 값: { status, record, firstToday }
  function record(id, { confidence, correct, quiz = "def", confusedWith = null }) {
    const now = today();
    const prev = get(id) ?? { box: 0, lapses: 0, history: [] };
    const status = classify(confidence, correct);
    const box = nextBox(prev.box, status);

    const rec = {
      ...prev,
      box,
      status,
      last_at: now,
      next_review_at: addDays(now, intervalFor(box)),
      lapses: prev.lapses + (status !== "known" && status !== "shaky" && prev.box >= DROP_TWO_FROM_BOX ? 1 : 0),
      history: [...prev.history, { at: now, confidence, correct, quiz, confused_with: confusedWith }].slice(-HISTORY_KEEP),
    };
    rec.first_at = prev.first_at ?? prev.history[0]?.at ?? now;   // 처음 본 날 (이력이 20개를 넘어 잘려도 남게)
    const becameLongTerm = status === "known" && prev.box >= LONG_TERM_FROM_BOX && !prev.long_term_at;
    if (becameLongTerm) rec.long_term_at = now;
    write(`review:${id}`, rec);

    const firstToday = markToday(id, status);
    markLog(now, id, status, { isNew: prev.history.length === 0, becameLongTerm });
    return { status, record: rec, firstToday };
  }

  // ----- 오늘의 마무리 (Must #15) -----
  // 하루 학습 끝에 2~3분, 오늘 본 카드를 "다시 읽기"가 아니라 "다시 떠올리기"로 한 번 더 푼다.
  // 순서: 착각 → 틀림·헷갈림 → 혼동 쌍이 있는 오늘 용어 → 맞힌 것 2개 (섞어서) → 마지막은 맞힌 카드로 끝내기
  // 마무리 답은 복습 상자(다음 복습 날짜)를 바꾸지 않는다. 같은 날 두 번 올리면 간격 반복이 무너지기 때문이다.
  const WRAP_MAX_HARD = 3;   // 착각·틀림은 최대 3장
  const WRAP_GOOD = 2;       // 맞힌 것 2장

  function planWrap(pairs = [], rnd = Math.random) {
    const t = getToday();
    const done = new Set(t.wrapped ?? []);
    const fresh = (ids) => ids.filter((id) => !done.has(id));
    const seen = fresh(t.seen);
    if (seen.length === 0) return [];

    const hard = [...new Set([...fresh(t.misconceptions), ...fresh(t.wrong)])].slice(0, WRAP_MAX_HARD);
    const goodAll = shuffle(seen.filter((id) => !t.wrong.includes(id)), rnd);
    const hasPair = (id) => pairs.some((p) => p.a === id || p.b === id);
    const pairPick = shuffle(seen.filter((id) => hasPair(id) && !hard.includes(id)), rnd)[0];
    const good = goodAll.filter((id) => id !== pairPick).slice(0, WRAP_GOOD);

    // 틀린 것이 없고 본 카드도 3장보다 적으면 마무리할 것이 거의 없으니 건너뛴다
    if (hard.length === 0 && seen.length < 3) return [];

    const body = shuffle([...hard, ...(pairPick ? [pairPick] : []), ...good.slice(0, -1)], rnd);
    const last = good.at(-1);   // 확실히 맞힐 카드로 끝낸다 (끝이 좋아야 다음 날 다시 온다: 피크엔드 법칙)
    return [...new Set([...body, ...(last ? [last] : [])])];
  }

  // 마무리에서 푼 결과: 오늘 기록과 일지에만 남긴다 (복습 상자는 그대로)
  function practice(id, correct) {
    const status = correct ? "known" : "confused";
    markToday(id, status);
    markLog(today(), id, status, {});
    return status;
  }
  function markWrapped(ids) {
    const t = getToday();
    t.wrapped = [...new Set([...(t.wrapped ?? []), ...ids])];
    write("today", t);
  }

  // ----- 날짜별 학습 일지 (성장 기록용, 지우지 않고 계속 쌓는다) -----
  // jg:v1:log = { "2026-11-11": { seen:[id], new:[id], wrong:[id], misconceptions:[id], corrected:[id], long_term:[id] } }
  // "오늘 기록(today)"은 날짜가 바뀌면 새로 시작하지만, 일지는 날짜마다 남는다. 하루 약 1KB, 1년 약 0.3MB.
  const LOG_FIELDS = ["seen", "new", "wrong", "misconceptions", "corrected", "long_term"];
  const emptyDay = () => Object.fromEntries(LOG_FIELDS.map((f) => [f, []]));
  const BAD = new Set(["confused", "unknown", "misconception"]);

  function getLog() { return read("log", {}); }

  function addToDay(day, id, status, { isNew = false, becameLongTerm = false } = {}) {
    const push = (f) => { if (!day[f].includes(id)) day[f].push(id); };
    push("seen");
    if (isNew) push("new");
    if (BAD.has(status)) push("wrong");
    if (status === "misconception") push("misconceptions");
    if (!BAD.has(status) && day.wrong.includes(id)) push("corrected");
    if (becameLongTerm) push("long_term");
  }

  function markLog(date, id, status, flags) {
    const log = getLog();
    const day = { ...emptyDay(), ...log[date] };
    addToDay(day, id, status, flags);
    log[date] = day;
    write("log", log);
  }

  // 일지가 생기기 전(2026-11-11 이전)에 공부한 날짜를 용어별 이력에서 되살린다. 한 번만 한다.
  function ensureLog(ids) {
    if (read("log_built", false)) return false;
    const log = getLog();
    for (const id of ids) {
      const rec = get(id);
      if (!rec) continue;
      rec.history.forEach((hx, k) => {
        const status = classify(hx.confidence, hx.correct);
        const day = (log[hx.at] = { ...emptyDay(), ...log[hx.at] });
        addToDay(day, id, status, { isNew: k === 0 && !rec.first_at, becameLongTerm: rec.long_term_at === hx.at });
      });
    }
    write("log", log);
    write("log_built", true);
    return true;
  }

  // ----- 성장 통계 (내 기록 화면) -----
  function stats(terms) {
    const log = getLog();
    const dates = Object.keys(log).filter((d) => log[d].seen.length > 0).sort();
    const recs = new Map(terms.map((term) => [term.id, get(term.id)]));

    // 연속 공부일: 오늘(또는 어제)부터 거꾸로 하루도 빠지지 않은 날 수
    let streak = 0;
    let d = log[today()]?.seen.length ? today() : addDays(today(), -1);
    while (log[d]?.seen.length) { streak += 1; d = addDays(d, -1); }

    // 날짜별 누적: 그날까지 본 용어 수, 장기 기억 수
    const firstSeen = new Map();
    const longAt = new Map();
    for (const date of dates) {
      for (const id of log[date].seen) if (!firstSeen.has(id)) firstSeen.set(id, date);
      for (const id of log[date].long_term) if (!longAt.has(id)) longAt.set(id, date);
    }
    for (const [id, rec] of recs) if (rec?.long_term_at && !longAt.has(id)) longAt.set(id, rec.long_term_at);
    const cumulative = dates.map((date) => ({
      date,
      seen: [...firstSeen.values()].filter((x) => x <= date).length,
      longTerm: [...longAt.values()].filter((x) => x <= date).length,
    }));

    const byStage = {};
    for (const term of terms) {
      const s = (byStage[term.stage] ??= { total: 0, seen: 0, known: 0, longTerm: 0 });
      const rec = recs.get(term.id);
      s.total += 1;
      if (rec) s.seen += 1;
      if (rec && (rec.status === "known" || rec.status === "shaky")) s.known += 1;
      if (rec?.long_term_at) s.longTerm += 1;
    }

    const sum = (f) => dates.reduce((n, date) => n + log[date][f].length, 0);
    return {
      log, dates, streak,
      studyDays: dates.length,
      firstDate: dates[0] ?? null,
      seenTerms: [...recs.values()].filter(Boolean).length,
      longTerm: [...recs.values()].filter((r) => r?.long_term_at).length,
      totalChecks: sum("seen"),
      totalCorrected: sum("corrected"),
      totalMisconceptions: sum("misconceptions"),
      cumulative, byStage,
    };
  }

  // ----- 백업: 기록 전체를 파일로 내보내고 다시 가져오기 -----
  // 브라우저 데이터를 지우거나 휴대폰을 바꾸면 기록이 사라지므로, 사용자가 직접 파일로 보관할 수 있게 한다.
  function exportAll() {
    const data = {};
    for (const key of store.keys?.() ?? []) if (key.startsWith(PREFIX)) data[key] = store.get(key);
    return { app: "jjonggeut", format: 1, exported_at: today(), data };
  }
  function importAll(backup) {
    if (backup?.app !== "jjonggeut" || backup.format !== 1 || typeof backup.data !== "object") {
      throw new Error("쫑긋 백업 파일이 아닙니다");
    }
    const entries = Object.entries(backup.data).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === "string");
    for (const [, v] of entries) JSON.parse(v);           // 깨진 값이 있으면 아무것도 바꾸지 않는다
    for (const [k, v] of entries) store.set(k, v);
    return entries.length;
  }

  // ----- 오늘 기록 (날짜가 바뀌면 새로 시작) -----
  function getToday() {
    const t = read("today", null);
    if (t && t.date === today()) return t;
    return { date: today(), seen: [], wrong: [], misconceptions: [], corrected: [] };
  }
  function markToday(id, status) {
    const t = getToday();
    const firstToday = !t.seen.includes(id);
    if (firstToday) t.seen.push(id);
    const bad = status === "confused" || status === "unknown" || status === "misconception";
    if (bad && !t.wrong.includes(id)) t.wrong.push(id);
    if (status === "misconception" && !t.misconceptions.includes(id)) t.misconceptions.push(id);
    // 오늘 틀렸던 것을 오늘 다시 맞히면 "바로잡은 것"
    if (!bad && t.wrong.includes(id) && !t.corrected.includes(id)) t.corrected.push(id);
    write("today", t);
    return firstToday;
  }

  function getSettings() { return { ...DEFAULT_SETTINGS, ...read("settings", {}) }; }
  function setSettings(patch) { write("settings", { ...getSettings(), ...patch }); }

  // ----- 오늘의 루프 기록 (F-06) -----
  // 루프 단계: 대본 없이 듣기 → 요지 적기 → 대본 보며 듣기 → 청크 뽑기 → 섀도잉 → 다시 말하기
  // jg:v1:loop:<콘텐츠 id> = { done: [단계], gist: "요지", gist_score: "yes|part|no", updated_at }
  // jg:v1:looplog = { "2026-11-12": { "<콘텐츠 id>": [단계] } }  ← 날짜별, 지우지 않는다
  const LOOP_STEPS = ["listen", "gist", "read", "chunk", "shadow", "retell"];

  function getLoop(id) { return { done: [], gist: "", gist_score: null, ...read(`loop:${id}`, {}) }; }

  function saveLoop(id, patch) {
    const rec = { ...getLoop(id), ...patch, updated_at: today() };
    write(`loop:${id}`, rec);
    return rec;
  }

  // 한 단계를 마쳤다. 콘텐츠 기록과 날짜별 기록에 함께 남긴다 (저장된 기록으로 계산: 필드워드 교훈 12)
  function markLoopStep(id, step) {
    if (!LOOP_STEPS.includes(step)) throw new Error(`모르는 루프 단계: ${step}`);
    const rec = getLoop(id);
    if (!rec.done.includes(step)) rec.done.push(step);
    saveLoop(id, { done: rec.done });
    const log = read("looplog", {});
    const day = (log[today()] ??= {});
    const steps = (day[id] ??= []);
    if (!steps.includes(step)) steps.push(step);
    write("looplog", log);
    return rec;
  }

  function loopToday() { return read("looplog", {})[today()] ?? {}; }

  // 하루 목표 달성 (2026-11-11 결정): 오늘 차례인 복습을 끝내고 루프를 한 단계 이상 했다
  // terms: 복습 카드 목록 (4단계 전에는 빈 목록)
  function goalMet(terms = []) {
    const now = today();
    const t = getToday();
    const reviewsLeft = terms.some((term) => {
      const rec = get(term.id);
      return rec && rec.next_review_at <= now && !t.seen.includes(term.id);
    });
    const loopSteps = Object.values(loopToday()).reduce((n, steps) => n + steps.length, 0);
    return !reviewsLeft && loopSteps >= 1;
  }

  // ----- 오늘 할 카드 목록 만들기 -----
  // 복습 예정 카드를 먼저(급한 상태 순), 남는 자리만큼 새 카드. 오늘 이미 본 카드는 다시 넣지 않는다.
  const URGENCY = { misconception: 0, confused: 1, unknown: 2, shaky: 3, known: 4 };
  // extra: 목표를 채운 뒤 "더 하기"를 눌렀을 때 오늘만 늘리는 장 수
  function plan(terms, { extra = 0 } = {}) {
    const daily_goal = getSettings().daily_goal + extra;
    const t = getToday();
    const now = today();
    const due = [], fresh = [];
    for (const term of terms) {
      if (t.seen.includes(term.id)) continue;
      const rec = get(term.id);
      if (!rec) fresh.push(term);
      else if (rec.next_review_at <= now) due.push({ term, rec });
    }
    due.sort((a, b) =>
      URGENCY[a.rec.status] - URGENCY[b.rec.status] || a.rec.next_review_at.localeCompare(b.rec.next_review_at));
    const left = Math.max(daily_goal - t.seen.length, 0);
    const dueIds = due.map((d) => d.term.id);

    // 새 카드 최소 자리 (2026-11-12 사용자 의견: "어제 본 만큼 복습을 끝내야 새 단어가 나와서 지루하다")
    //   하루 목표의 30%(10장이면 3장)는 새 카드에 남겨 둔다. 새로움이 동기를 지켜 준다.
    //   복습이 밀리면(목표의 2배 넘게 쌓이면) 복습 빚을 막으려고 새 카드는 1장만.
    //   밀려난 복습은 가장 안정된 카드(앎, 상자가 높은 것)라서 하루 늦어져도 손해가 작다.
    const newToday = t.seen.filter((id) => (get(id)?.first_at ?? today()) === now).length;
    const minNew = dueIds.length > daily_goal * 2 ? 1 : Math.max(1, Math.round(daily_goal * MIN_NEW_RATIO));
    const reserve = Math.min(Math.max(minNew - newToday, 0), fresh.length, left);
    const reviewPart = dueIds.slice(0, left - reserve);
    const newPart = fresh.slice(0, Math.max(left - reviewPart.length, 0)).map((x) => x.id);
    return {
      goal: daily_goal,
      done: t.seen.length,
      queue: interleave(reviewPart, newPart),
      reviewCount: reviewPart.length,
      newCount: newPart.length,
      dueTotal: dueIds.length,
      minutesLeft: Math.ceil(((reviewPart.length + newPart.length) * SECONDS_PER_CARD) / 60),
    };
  }

  // 복습과 새 카드를 섞는다: 복습 2장마다 새 카드 1장 (예: 복 복 새 복 복 새 …)
  // 한쪽을 몰아서 내지 않으면 지루함이 덜하고, 섞어 풀기(교차 학습)가 구별하는 힘을 키운다.
  function interleave(reviews, fresh) {
    const out = [];
    let r = 0, f = 0;
    while (r < reviews.length || f < fresh.length) {
      for (let k = 0; k < 2 && r < reviews.length; k++) out.push(reviews[r++]);
      if (f < fresh.length) out.push(fresh[f++]);
    }
    return out;
  }

  // ----- 현황: 상태별 개수 -----
  function counts(terms) {
    const c = { known: 0, shaky: 0, confused: 0, misconception: 0, unknown: 0, longTerm: 0, unseen: 0 };
    for (const term of terms) {
      const rec = get(term.id);
      if (!rec) { c.unseen += 1; continue; }
      c[rec.status] += 1;
      if (rec.long_term_at) c.longTerm += 1;
    }
    return c;
  }

  // ----- 확인 문제 만들기 (퀴즈 사다리) -----
  // 상자 0~2: 용어 → 뜻 고르기 / 상자 3 이상: 뜻 → 용어 고르기
  // 오답 보기(그럴듯한 틀린 보기): 혼동 쌍 → 같은 단계·같은 등급 → 같은 단계 → 나머지
  // force: 문제 종류를 정해서 낼 때 (오늘의 마무리는 한 칸 쉬운 "def"로 낸다)
  function makeQuiz(term, terms, pairs, rnd = Math.random, force = null) {
    const rec = get(term.id);
    const kind = force ?? ((rec?.box ?? 0) >= 3 ? "term" : "def");
    const others = terms.filter((x) => x.id !== term.id);
    const pairIds = pairs.filter((p) => p.a === term.id || p.b === term.id).map((p) => (p.a === term.id ? p.b : p.a));

    const pick = [];
    const add = (list) => { for (const x of shuffle(list, rnd)) if (pick.length < 3 && !pick.includes(x)) pick.push(x); };
    add(others.filter((x) => pairIds.includes(x.id)));
    add(others.filter((x) => x.stage === term.stage && x.level === term.level));
    add(others.filter((x) => x.stage === term.stage));
    add(others);

    const options = shuffle([term, ...pick], rnd).map((x) => ({ id: x.id, correct: x.id === term.id }));
    return { kind, options, pairIds };
  }

  function shuffle(list, rnd) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return {
    classify, nextBox, intervalFor, record, get, getToday, getSettings, setSettings,
    plan, counts, makeQuiz, today, addDays, useStore, useClock,
    getLog, ensureLog, stats, exportAll, importAll, planWrap, practice, markWrapped,
    getLoop, saveLoop, markLoopStep, loopToday, goalMet, LOOP_STEPS,
    INTERVALS, MAINTAIN_BOX,
  };
})();

if (typeof module !== "undefined") module.exports = Review;
