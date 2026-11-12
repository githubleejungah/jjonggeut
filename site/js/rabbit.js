/* =========================================================
   쫑긋 — 토끼 그리기 · 간식 흐름 · 계절과 기념일 (2026-11-12)
   그림 파일(img/rabbit.svg) 대신 코드로 그린다. 그래야
     - 살이 옆으로 붙고(키는 그대로, 몸·볼살·발만 넓어진다)
     - 계절·기념일 소품을 씌우고
     - 표정(웃음·오물오물·운동·묵념)을 바꿀 수 있다.
   그림 문자열은 이 파일의 고정된 도형만으로 만든다(사용자 글을 넣지 않는다).
   ========================================================= */

const Rabbit = (() => {
  const LINE = "#E3D6C3", FUR = "#FFFDF7", INK = "#3A3030", EAR = "#F8C9D2", BLUSH = "#F8B9C4", NOSE = "#E89AAA";
  const MAX_CHUB = 3;

  /* ---------- 몸 ---------- */
  // chub 0~3: 몸 가로 반지름 48→66, 볼살이 바깥으로, 발이 벌어진다. 세로는 거의 그대로
  function geom(chub) {
    const c = Math.max(0, Math.min(MAX_CHUB, chub | 0));
    return { c, rx: 48 + 6 * c, ry: 38 + 0.5 * c, cheekX: 34 + 6 * c, cheekR: 16 + c, footX: 18 + 4 * c, blushX: 23 + 3 * c };
  }

  function body(g) {
    const { rx, ry, cheekX, cheekR, footX } = g;
    return `<g stroke="${LINE}" stroke-width="1.2" fill="${FUR}">
      <ellipse cx="-16" cy="-46" rx="9" ry="16" transform="rotate(-12 -16 -46)"/>
      <ellipse cx="16" cy="-46" rx="9" ry="16" transform="rotate(12 16 -46)"/>
      <ellipse cx="${-footX}" cy="37" rx="10" ry="5"/><ellipse cx="${footX}" cy="37" rx="10" ry="5"/>
      <ellipse cx="0" cy="0" rx="${rx}" ry="${ry}"/>
      <circle cx="${-cheekX}" cy="7" r="${cheekR}"/><circle cx="${cheekX}" cy="7" r="${cheekR}"/></g>
    <ellipse cx="-16" cy="-44" rx="4" ry="9" transform="rotate(-12 -16 -44)" fill="${EAR}"/>
    <ellipse cx="16" cy="-44" rx="4" ry="9" transform="rotate(12 16 -44)" fill="${EAR}"/>
    <g fill="${FUR}"><ellipse cx="0" cy="0" rx="${rx - 1.2}" ry="${ry - 1.2}"/>
      <circle cx="${-cheekX}" cy="7" r="${cheekR - 1.2}"/><circle cx="${cheekX}" cy="7" r="${cheekR - 1.2}"/></g>`;
  }

  function face(g, kind) {
    const blush = kind === "calm" ? "" :
      `<ellipse cx="${-g.blushX}" cy="6" rx="6" ry="3.4" fill="${BLUSH}"/><ellipse cx="${g.blushX}" cy="6" rx="6" ry="3.4" fill="${BLUSH}"/>`;
    const eyes = kind === "calm"
      ? `<path d="M-18 -7 Q-14 -4 -10 -7 M10 -7 Q14 -4 18 -7" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
      : `<circle cx="-14" cy="-8" r="3.5" fill="${INK}"/><circle cx="14" cy="-8" r="3.5" fill="${INK}"/>
         <circle cx="-13" cy="-9" r="1.2" fill="#FFF"/><circle cx="15" cy="-9" r="1.2" fill="#FFF"/>`;
    const mouth = kind === "chew"
      ? `<path d="M0 1.5 L0 3.5" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/><ellipse cx="0" cy="6" rx="2.6" ry="2" fill="${INK}"/>`
      : `<path d="M0 1.5 L0 4 M-4 5.5 Q-2 8 0 4 Q2 8 4 5.5" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`;
    return `${eyes}${blush}<ellipse cx="0" cy="0" rx="2.4" ry="1.6" fill="${NOSE}"/>${mouth}`;
  }

  /* ---------- 간식 · 운동 ---------- */
  const carrot = (x, y, r = 35) => `<g transform="translate(${x} ${y}) rotate(${r})">
      <path d="M-4.5 0 L4.5 0 L0 17 Z" fill="#F0A15A" stroke="#D98A45" stroke-width="0.8" stroke-linejoin="round"/>
      <path d="M-2.5 3.5 L0.5 4 M-1.5 8 L1.5 8.5" stroke="#D98A45" stroke-width="0.8"/>
      <ellipse cx="-2" cy="-3" rx="1.6" ry="3.6" fill="#7FB77E" transform="rotate(-20 -2 -3)"/>
      <ellipse cx="2" cy="-3" rx="1.6" ry="3.6" fill="#7FB77E" transform="rotate(20 2 -3)"/></g>`;
  const strawberry = (x, y) => `<g transform="translate(${x} ${y})">
      <path d="M0 13 C-9 6 -8 -2 0 -1 C8 -2 9 6 0 13 Z" fill="#E2675F" stroke="#C9534C" stroke-width="0.8"/>
      <path d="M-4 -1 L0 -4 L4 -1 L0 0 Z" fill="#7FB77E"/>
      <g fill="#F7E3A3"><circle cx="-3" cy="3" r="0.7"/><circle cx="2" cy="2.5" r="0.7"/><circle cx="0" cy="7" r="0.7"/><circle cx="3.5" cy="6" r="0.7"/></g></g>`;
  const snack = (g, n) => (n % 2 ? strawberry(7, 8) : carrot(8, 5));
  const workout = (g) => `
    <path d="M${-g.rx * 0.78} -22 Q0 -40 ${g.rx * 0.78} -22" fill="none" stroke="#6AA8A0" stroke-width="6" stroke-linecap="round"/>
    <path d="M${g.rx * 0.74} -24 l7 -6 m-7 6 l8 1" stroke="#6AA8A0" stroke-width="3" stroke-linecap="round"/>
    <path d="M${-g.rx * 0.62} -30 q-3 5 0 7 q3 -2 0 -7 Z" fill="#BFE0F2" stroke="#9CC0E6" stroke-width="0.6"/>`;

  /* ---------- 소품 ---------- */
  // back: 몸 뒤에 그리는 것, front: 몸 앞(얼굴 위)에 그리는 것
  const flower = (x, y, s, petal, center) => {
    let p = "";
    for (let i = 0; i < 5; i++) p += `<ellipse cx="0" cy="${-3.2 * s}" rx="${2.3 * s}" ry="${3.4 * s}" fill="${petal}" transform="rotate(${i * 72})"/>`;
    return `<g transform="translate(${x} ${y})">${p}<circle r="${1.6 * s}" fill="${center}"/></g>`;
  };
  const stick = (x, y1, y2) => `<path d="M${x} ${y1} L${x} ${y2}" stroke="#9C8467" stroke-width="2" stroke-linecap="round"/>`;

  // 태극기 (가로 24 × 세로 16). 태극: 위 빨강·아래 파랑, 건·곤 대각선(33.69도)으로 기울임.
  // 괘: 왼쪽 위 건(이어진 막대 셋), 오른쪽 아래 곤(끊긴 막대 셋), 오른쪽 위 감(끊김·이어짐·끊김), 왼쪽 아래 리(이어짐·끊김·이어짐)
  function taegeukgi(x, y, k = 1) {
    const r = 4, cx = 12, cy = 8;
    const red = `M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 A${r / 2} ${r / 2} 0 0 0 0 0 A${r / 2} ${r / 2} 0 0 1 ${-r} 0 Z`;
    const bars = (pattern, ang) => {         // pattern: 안쪽부터 바깥쪽 막대, 1=이어진 막대 0=끊긴 막대
      const d = 7.4;
      let s = "";
      pattern.forEach((solid, i) => {
        const off = d - 1.4 + i * 1.4;
        s += solid
          ? `<rect x="${off - 0.45}" y="-2.2" width="0.9" height="4.4"/>`
          : `<rect x="${off - 0.45}" y="-2.2" width="0.9" height="1.9"/><rect x="${off - 0.45}" y="0.3" width="0.9" height="1.9"/>`;
      });
      return `<g transform="translate(${cx} ${cy}) rotate(${ang})">${s}</g>`;
    };
    return `<g transform="translate(${x} ${y}) scale(${k})">
      <rect width="24" height="16" fill="#FFF" stroke="#D6D0C6" stroke-width="0.6"/>
      <g transform="translate(${cx} ${cy}) rotate(33.69)"><circle r="${r}" fill="#0047A0"/><path d="${red}" fill="#CD2E3A"/></g>
      <g fill="#222">${bars([1, 1, 1], 213.69)}${bars([0, 0, 0], 33.69)}${bars([0, 1, 0], 326.31)}${bars([1, 0, 1], 146.31)}</g></g>`;
  }
  const flagHeld = (g) => `${stick(g.cheekX + 4, 34, -34)}${taegeukgi(g.cheekX + 4, -34, 1.5)}`;

  const WEAR = {
    spring: { front: () => flower(22, -36, 1.1, "#F6C1CC", "#F2D16B") + flower(30, -30, 0.7, "#FBE0E6", "#F2D16B") },
    summer: { front: () => `<ellipse cx="0" cy="-33" rx="36" ry="7" fill="#E8CF97" stroke="#CDB27A" stroke-width="0.8"/>
      <path d="M-20 -34 Q-19 -55 0 -55 Q19 -55 20 -34 Z" fill="#EFD9A6" stroke="#CDB27A" stroke-width="0.8"/>
      <rect x="-20" y="-39" width="40" height="4.5" fill="#9CC0E6"/>` },
    autumn: { front: (g) => `<path d="M${-g.rx * 0.72} 21 Q0 35 ${g.rx * 0.72} 21" fill="none" stroke="#C9774F" stroke-width="8" stroke-linecap="round"/>
      <path d="M${g.rx * 0.42} 27 l4 15" stroke="#C9774F" stroke-width="7" stroke-linecap="round"/>
      <path d="M${g.rx * 0.42 + 1} 40 l4 2" stroke="#F0D9B5" stroke-width="2"/>` },
    winter: { front: () => `<path d="M-18 -45 Q0 -76 18 -45" fill="none" stroke="#8FA7BF" stroke-width="3"/>
      <circle cx="-18" cy="-44" r="9.5" fill="#E9EEF3" stroke="#C9D3DD"/><circle cx="18" cy="-44" r="9.5" fill="#E9EEF3" stroke="#C9D3DD"/>
      <circle cx="-18" cy="-44" r="5" fill="#F5F7FA"/><circle cx="18" cy="-44" r="5" fill="#F5F7FA"/>` },
    newyear: { back: () => {   // 해돋이
      let rays = "";
      for (let i = -3; i <= 3; i++) rays += `<path d="M0 -40 L${Math.sin(i * 0.38) * 64} ${-40 - Math.cos(i * 0.38) * 34}" stroke="#F6D7A8" stroke-width="3" stroke-linecap="round"/>`;
      return `${rays}<circle cx="0" cy="-40" r="26" fill="#F8DDB0"/>`;
    } },
    seollal: { front: (g) => {   // 색동 목도리 + 복주머니
      const cols = ["#C65B5B", "#E7B65C", "#7FB77E", "#6E8FC9", "#B98BC0"];
      let stripes = "";
      cols.forEach((col, i) => {
        const x0 = -g.rx * 0.7 + (i * g.rx * 1.4) / cols.length, x1 = -g.rx * 0.7 + ((i + 1) * g.rx * 1.4) / cols.length;
        const y = (x) => 21 + 14 * (1 - (x / (g.rx * 0.72)) ** 2) * 0.9;
        stripes += `<path d="M${x0} ${y(x0)} L${x1} ${y(x1)}" stroke="${col}" stroke-width="7"/>`;
      });
      const px = g.cheekX + 4;
      return `${stripes}<g transform="translate(${px} 24) scale(1.4)">
        <path d="M-7 0 Q-10 12 0 12 Q10 12 7 0 Q0 -3 -7 0 Z" fill="#C65B5B" stroke="#A84848" stroke-width="0.8"/>
        <path d="M-5 0 Q0 -6 5 0" fill="none" stroke="#D9B45A" stroke-width="1.6"/><circle cx="0" cy="6" r="2" fill="#D9B45A"/></g>`;
    } },
    flag: { front: flagHeld },
    gaecheon: { back: () => `<g fill="#E3EDF7"><circle cx="-40" cy="-42" r="9"/><circle cx="-31" cy="-46" r="11"/><circle cx="-22" cy="-41" r="8"/>
      <circle cx="44" cy="-50" r="7"/><circle cx="52" cy="-53" r="9"/><circle cx="60" cy="-49" r="6"/></g>`, front: flagHeld },
    labor: { front: (g) => `<g transform="translate(${g.cheekX + 4} 16) scale(1.5)">
      <path d="M-1 -12 q2 -3 0 -6 M4 -12 q2 -3 0 -6" fill="none" stroke="#CDBFAF" stroke-width="1.2" stroke-linecap="round"/>
      <rect x="-5" y="-8" width="13" height="15" rx="2.5" fill="#FFF" stroke="#CDBFAF"/>
      <path d="M8 -4 q5 0 5 4 q0 4 -5 4" fill="none" stroke="#CDBFAF" stroke-width="1.6"/>
      <rect x="-3.5" y="-6.5" width="10" height="2.5" rx="1" fill="#A57C5B"/></g>` },
    children: { front: (g) => {   // 바람개비
      const x = g.cheekX + 12, y = -22;
      const blades = ["#F4A7B6", "#8DB6E2", "#EFC75A", "#8DBE9F"].map((col, i) =>
        `<path d="M0 0 L0 -17 Q11 -14 0 0 Z" fill="${col}" stroke="#FFF" stroke-width="0.5" transform="rotate(${i * 90 + 20})"/>`).join("");
      return `${stick(x, 34, y)}<g transform="translate(${x} ${y})">${blades}<circle r="2.4" fill="#D9B45A"/></g>`;
    } },
    buddha: { front: (g) => {   // 연등 (연꽃 모양 등)
      const x = g.cheekX + 10, y = -6;
      let petals = "";
      for (let i = -2; i <= 2; i++) petals += `<ellipse cx="${i * 3.2}" cy="0" rx="3" ry="7" fill="${i % 2 ? "#F4B6C2" : "#F8CDD6"}" stroke="#E79AAB" stroke-width="0.5" transform="rotate(${i * 16} ${i * 3.2} 5)"/>`;
      return `<path d="M${x - 12} -36 Q${x - 4} -36 ${x} -12" fill="none" stroke="#9C8467" stroke-width="1.6"/>
        <g transform="translate(${x} ${y}) scale(1.5)"><ellipse cx="0" cy="6" rx="9" ry="3" fill="#9CC3AE"/>${petals}
        <path d="M-2 13 L2 13 L0 18 Z" fill="#E7B65C"/></g>`;
    } },
    memorial: { face: "calm", front: (g) => {   // 흰 국화 한 송이 (현충일: 꽃가루·뛰기 없음)
      let p = "";
      for (let i = 0; i < 14; i++) p += `<ellipse cx="0" cy="-4.6" rx="1.3" ry="4" fill="#FBFBF8" stroke="#D9D9D0" stroke-width="0.4" transform="rotate(${i * 25.7})"/>`;
      return `<path d="M${g.cheekX - 6} 34 Q${g.cheekX - 2} 20 ${g.cheekX + 2} 6" fill="none" stroke="#7FA37E" stroke-width="1.8"/>
        <ellipse cx="${g.cheekX - 2}" cy="22" rx="2.2" ry="4.5" fill="#9CC3AE" transform="rotate(-40 ${g.cheekX - 2} 22)"/>
        <g transform="translate(${g.cheekX + 2} 4) scale(1.5)">${p}<circle r="2.2" fill="#F1E3B0"/></g>`;
    } },
    hangeul: { front: (g) => `<g transform="translate(${g.cheekX - 6} 4) scale(1.4)">
      <rect width="20" height="20" rx="4" fill="#FFF8E6" stroke="#D8C69A"/>
      <text x="10" y="14.6" text-anchor="middle" font-size="13" font-weight="700" fill="#5A4A3A" font-family="sans-serif">한</text></g>` },
    chuseok: {
      back: () => `<circle cx="34" cy="-44" r="22" fill="#F7E3A3"/><circle cx="27" cy="-50" r="4" fill="#F1D88E"/><circle cx="40" cy="-38" r="2.6" fill="#F1D88E"/>`,
      front: (g) => [["#F8CDD6", -g.footX - 14], ["#CFE3C8", g.footX + 14], ["#FBF6EA", g.footX + 26]].map(([col, x]) =>
        `<path d="M${x - 7} 40 Q${x} 29 ${x + 7} 40 Z" fill="${col}" stroke="#D8CDB8" stroke-width="0.6"/>`).join(""),
    },
    christmas: { front: () => `<path d="M-24 -31 Q-6 -78 40 -60 Q12 -52 24 -31 Z" fill="#B5484F" stroke="#9C3B42" stroke-width="0.8"/>
      <rect x="-27" y="-35" width="54" height="9" rx="4.5" fill="#FBFAF7" stroke="#E2DDD3"/>
      <circle cx="41" cy="-60" r="5.5" fill="#FBFAF7" stroke="#E2DDD3"/>` },
  };

  // 토끼 SVG 문자열. opts: { chub, wear, face: "smile"|"chew"|"calm", snack: 번호|null, workout: bool, label }
  function svg({ chub = 0, wear = null, face: kind = null, snack: snackNo = null, workout: work = false, label = "토끼" } = {}) {
    const g = geom(chub);
    const w = WEAR[wear] ?? {};
    const faceKind = kind ?? w.face ?? (snackNo !== null ? "chew" : "smile");
    const W = g.cheekX + g.cheekR + 30;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-W} -80 ${2 * W} 130" role="img" aria-label="${label}">`
      + (w.back?.(g) ?? "") + body(g) + face(g, faceKind) + (w.front?.(g) ?? "")
      + (work ? workout(g) : "") + (snackNo !== null ? snack(g, snackNo) : "") + "</svg>";
  }

  // 화면에 넣을 요소. 그림 높이를 정하면 살찐 만큼 가로가 넓어진다
  function el(opts = {}, cls = "rabbit-art") {
    const span = document.createElement("span");
    span.className = cls;
    span.innerHTML = svg(opts);
    return span;
  }

  /* ---------- 간식 흐름 (2026-11-12 사용자 제안) ----------
     하나 완료(장면 마침 화면)할 때마다 토끼가 총총 뛰고:
       1번째 완료: 간식을 먹는다
       2번째 완료: 간식을 먹고 몸이 옆으로 통통해진다
       3번째 완료: '운동시키기 / 간식 더 주기'를 고른다
       4번째 완료: 운동 → 원래 몸으로(처음부터 다시), 간식 더 → 더 통통(그다음 완료에 다시 고르기)
     state = { chub: 0~3, stage: "snack"|"grow"|"choose", pending: null|"exercise"|"food", snacks: 먹은 수 } */
  const START = { chub: 0, stage: "snack", pending: null, snacks: 0 };
  function step(prev) {
    const s = { ...START, ...prev };
    if (s.pending === "exercise") return { state: { ...s, chub: 0, stage: "snack", pending: null }, event: "exercise", from: s.chub };
    if (s.pending === "food") {
      const full = s.chub >= MAX_CHUB;
      return { state: { ...s, chub: Math.min(MAX_CHUB, s.chub + 1), stage: "choose", pending: null, snacks: s.snacks + 1 },
        event: full ? "full" : "feast", from: s.chub };
    }
    if (s.stage === "snack") return { state: { ...s, stage: "grow", snacks: s.snacks + 1 }, event: "snack", from: s.chub };
    if (s.stage === "grow") return { state: { ...s, chub: Math.min(MAX_CHUB, s.chub + 1), stage: "choose", snacks: s.snacks + 1 }, event: "grow", from: s.chub };
    return { state: s, event: "choose", from: s.chub };     // 고르지 않고 지나갔으면 다시 고르게 한다
  }
  const choose = (state, pick) => ({ ...START, ...state, pending: pick === "food" ? "food" : "exercise" });

  /* ---------- 계절과 기념일 ----------
     양력 고정 공휴일 + 음력 공휴일(설·부처님오신날·추석) 날짜표. 음력 날짜는 한국천문연구원 월력요항 기준.
     2026년부터 노동절(5/1)·제헌절(7/17)도 공휴일 (공휴일에 관한 법률 개정, 2026).
     날짜표가 끝나는 해(2030) 전에 다음 해를 더한다. 대체공휴일은 꾸미지 않는다(그날의 의미가 없어서). */
  const LUNAR = {
    2026: { seollal: ["02-16", "02-17", "02-18"], buddha: ["05-24"], chuseok: ["09-24", "09-25", "09-26"] },
    2027: { seollal: ["02-06", "02-07", "02-08"], buddha: ["05-13"], chuseok: ["09-14", "09-15", "09-16"] },
    2028: { seollal: ["01-26", "01-27", "01-28"], buddha: ["05-02"], chuseok: ["10-02", "10-03", "10-04"] },
    2029: { seollal: ["02-12", "02-13", "02-14"], buddha: ["05-20"], chuseok: ["09-21", "09-22", "09-23"] },
    2030: { seollal: ["02-02", "02-03", "02-04"], buddha: ["05-09"], chuseok: ["09-11", "09-12", "09-13"] },
  };
  const FIXED = { "01-01": "newyear", "03-01": "samil", "05-01": "labor", "05-05": "children", "06-06": "memorial",
    "07-17": "jeheon", "08-15": "gwangbok", "10-03": "gaecheon", "10-09": "hangeul", "12-25": "christmas" };
  const WEAR_OF = { samil: "flag", jeheon: "flag", gwangbok: "flag" };
  // 꽃가루 색·모양. 현충일은 꽃가루를 띄우지 않는다
  const CONFETTI = {
    spring: { colors: ["#F6C1CC", "#FBE0E6", "#F2D16B", "#FFFFFF"], shapes: ["petal"] },
    summer: { colors: ["#9CC0E6", "#F2D16B", "#9CC3AE", "#FFFFFF"], shapes: ["dot", "ribbon"] },
    autumn: { colors: ["#C9774F", "#D99A4E", "#B5484F", "#E7B65C"], shapes: ["leaf"] },
    winter: { colors: ["#BCD0E2", "#DFE8F1", "#9CC0E6", "#FFFFFF"], shapes: ["dot", "star"] },
    newyear: { colors: ["#D9B45A", "#F6D7A8", "#B5484F", "#FFFFFF"], shapes: ["star", "ribbon"] },
    seollal: { colors: ["#C65B5B", "#E7B65C", "#7FB77E", "#6E8FC9", "#B98BC0"], shapes: ["ribbon", "dot"] },
    flag: { colors: ["#CD2E3A", "#0047A0", "#F4F1EA"], shapes: ["dot", "ribbon"] },
    gaecheon: { colors: ["#CD2E3A", "#0047A0", "#BCD0E2", "#F4F1EA"], shapes: ["dot", "ribbon"] },
    labor: { colors: ["#A57C5B", "#E8CF97", "#9CC3AE"], shapes: ["dot"] },
    children: { colors: ["#F6C1CC", "#9CC0E6", "#F2D16B", "#9CC3AE"], shapes: ["dot", "star", "ribbon"] },
    buddha: { colors: ["#F4B6C2", "#E7B65C", "#9CC3AE", "#F8CDD6"], shapes: ["petal"] },
    hangeul: { colors: ["#5A4A3A", "#D8C69A", "#9CC0E6"], shapes: ["ribbon", "dot"] },
    chuseok: { colors: ["#F7E3A3", "#F8CDD6", "#CFE3C8", "#D9B45A"], shapes: ["dot", "leaf"] },
    christmas: { colors: ["#B5484F", "#7FA37E", "#D9B45A", "#FFFFFF"], shapes: ["star", "dot"] },
  };
  const SEASON_OF_MONTH = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"];

  // 그날의 계절·기념일. date: "YYYY-MM-DD" (앱의 하루 경계 새벽 4시를 쓴 날짜)
  function occasion(date) {
    const [y, m] = date.split("-").map(Number);
    const md = date.slice(5);
    const lunar = LUNAR[y] ?? {};
    const id = Object.keys(lunar).find((k) => lunar[k].includes(md)) ?? FIXED[md] ?? null;
    if (id) {
      const wear = WEAR_OF[id] ?? id;
      return { id, holiday: true, wear, solemn: id === "memorial", confetti: CONFETTI[wear] ?? null };
    }
    const season = SEASON_OF_MONTH[m - 1];
    return { id: season, holiday: false, wear: season, solemn: false, confetti: CONFETTI[season] };
  }
  const lunarYears = () => Object.keys(LUNAR).map(Number);

  const ALL_OCCASIONS = ["spring", "summer", "autumn", "winter", "newyear", "seollal", "samil", "labor", "children", "buddha",
    "memorial", "jeheon", "gwangbok", "chuseok", "gaecheon", "hangeul", "christmas"];
  const wearOf = (id) => WEAR_OF[id] ?? id;

  return { svg, el, step, choose, occasion, lunarYears, geom, wearOf, ALL_OCCASIONS, CONFETTI, MAX_CHUB, START };
})();

if (typeof module !== "undefined") module.exports = Rabbit;
