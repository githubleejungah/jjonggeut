/* =========================================================
   쫑긋 — 음성 엔진 (브라우저 내장 음성 합성, Web Speech API)
   필드워드(field-words) app.js의 speech 객체를 떼어 와 파일 하나로 만들었다 (2026-11-12).
   쓰는 곳: 카드의 짧은 표현, 원음이 없는 예문, 한국어 상황 문장(F-24).
   대화 듣기·섀도잉은 사람이 녹음한 원음을 쓴다 (기능요구서 '필드워드에서 가져올 기능').

   반드시 지킬 것: 문장마다 언어(lang)를 정해서 넘긴다.
     한국어 음성에 영어를 섞어 주면 제멋대로 읽는다 (필드워드: MoSCoW → "모스크바").

   브라우저에서는 전역 Speech로, Node.js 시험에서는 require()로 쓴다.
   ========================================================= */

const Speech = (() => {
  const hasWindow = typeof window !== "undefined";

  /* ---------- 글자 다듬기 (화면 없이 시험할 수 있는 부분) ---------- */

  // 숫자 + 세는 말은 고유어 숫자로 읽어야 자연스럽다: "3번" → "세 번", "10장" → "열 장"
  // (음성은 숫자를 "삼 번"처럼 한자어로 읽는다. "2주", "40%"처럼 한자어로 읽는 것은 그대로 둔다)
  const NATIVE_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
  const NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];
  function nativeNumber(n) {
    if (n === 20) return "스무";
    return NATIVE_TENS[Math.floor(n / 10)] + NATIVE_ONES[n % 10];
  }
  function koreanCounters(text) {
    return text.replace(/(\d{1,2})\s?(번|개|명|장|시간|가지|달|군데|살|마리|권)/g, (all, num, unit) => {
      const n = Number(num);
      return n >= 1 && n <= 99 ? `${nativeNumber(n)} ${unit}` : all;
    });
  }

  // 음성 엔진이 잘못 읽는 한국어 낱말 고침표. 신고가 들어온 낱말만 한 줄씩 추가한다.
  const SPEECH_FIXES = [];

  // 한국어 문장 속 영어 낱말을 한글 발음으로 바꿔 읽게 하는 표.
  // 쫑긋은 영어를 영어 음성으로 읽으므로 기본은 비어 있다. 한국어 상황 문장에 섞인 영어만 필요할 때 추가한다.
  const WORD_SAY = {};

  // 낱말 경계를 지키며 바꾼다: 앞뒤가 영어 글자면 바꾸지 않는다.
  // 필드워드 2026-11-12 버그: "GitHub" 안의 "Git"까지 바뀌어 "깃Hub"이 됐다.
  // (오래된 아이폰은 "뒤를 보는 정규식"을 몰라서 쓰지 않고, 앞 글자를 잡아 되돌려 붙인다)
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function replaceWords(text, table) {
    if (!/[A-Za-z]/.test(text)) return text;
    return Object.entries(table)
      .sort((a, b) => b[0].length - a[0].length)          // 긴 것부터 ("OAuth2"를 "OAuth"보다 먼저)
      .reduce((s, [en, ko]) =>
        s.replace(new RegExp(`(^|[^A-Za-z])${escape(en)}(?![A-Za-z])`, "g"), (_, before) => before + ko), text);
  }

  function fixKoreanSpeech(text) {
    const fixed = SPEECH_FIXES.reduce((s, [from, to]) => s.replace(from, to), text);
    return replaceWords(fixed, WORD_SAY);
  }

  // 읽기 전에 기호를 정리한다. 괄호·화살표·가운뎃점을 음성이 어색하게 끊어 읽기 때문이다.
  function clean(text) {
    return text
      .replace(/\([^)]*\)(?=[가-힣])/g, "")   // 괄호 바로 뒤에 한글(조사)이 붙으면 괄호 속 말은 빼고 읽는다
      .replace(/\s*(→|->)\s*/g, ", ")
      .replace(/\s*[·•]\s*/g, ", ")
      .replace(/[()[\]]/g, " ")
      .replace(/['"‘’“”]/g, (m) => (m === "'" || m === "’" ? m : ""))   // 영어 축약(don't)의 ' 는 남긴다
      .replace(/\s*\/\s*/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim();
  }

  // 기호를 정리하고 문장 단위로 나눈다. 일부 브라우저는 15초가 넘는 문장을 중간에 끊는다.
  function sentences(text, lang) {
    let s = clean(text);
    if (lang.startsWith("ko")) s = fixKoreanSpeech(koreanCounters(s));
    return s.replace(/([.?!])\s+/g, "$1\n").split("\n").map((x) => x.trim()).filter(Boolean);
  }

  /* ---------- 재생 (브라우저에서만) ---------- */

  const speech = {
    supported: hasWindow && "speechSynthesis" in window,

    // 그 언어의 음성 중 "가장 좋은" 것을 고른다. 기기마다 들어 있는 음성이 다르다.
    //   Natural·Neural(신경망 음성) > Online > Google > Enhanced·Premium(아이폰 고품질)
    voiceFor(lang) {
      if (!this.supported) return undefined;
      const prefix = lang.slice(0, 2);
      const candidates = speechSynthesis.getVoices().filter((v) => v.lang.replace("_", "-").startsWith(prefix));
      const score = (v) =>
        (/natural|neural/i.test(v.name) ? 100 : 0) +
        (/online/i.test(v.name) ? 60 : 0) +
        (/google/i.test(v.name) ? 50 : 0) +
        (/enhanced|premium/i.test(v.name) ? 40 : 0) +
        (v.lang.replace("_", "-") === lang ? 5 : 0);
      return candidates.sort((a, b) => score(b) - score(a))[0];
    },

    // ----- 재생 상태 -----
    // 버튼 하나로 재생 ↔ 일시정지. 휴대폰의 pause()가 불안정해서 문장 번호를 기억해 직접 이어 읽는다.
    owner: null,          // 지금 재생 중인 버튼 이름
    status: "idle",       // idle / playing / paused
    queue: [],            // 읽을 문장 목록 [{ text, lang, sec }] 또는 쉬기 [{ pause: ms }]
    index: 0,
    token: 0,             // 재생을 새로 시작하거나 멈출 때마다 바뀐다
    timer: null,
    watch: null,
    rate: 0.95,
    onFinish: null,       // 끝까지 다 읽었을 때
    onSentence: null,     // 문장을 읽기 시작할 때 (읽는 문장 색칠)
    listeners: new Set(), // 상태가 바뀌면 버튼 모양을 다시 그리는 함수들
    useDefaultVoice: false,
    unlocked: false,
    lastError: "",        // 정보 화면에 보여 줄 마지막 음성 오류

    toggle(owner, makeParts) {
      if (this.owner === owner && this.status === "playing") return this.pause();
      if (this.owner === owner && this.status === "paused") return this.run(this.index);
      this.start(owner, makeParts());
    },

    // parts: [{ text, lang, sec? }] 또는 [{ pause: 3000 }] (예: F-24 "한국어 상황 → 3초 쉼 → 영어")
    start(owner, parts, onFinish) {
      this.stop();
      this.owner = owner;
      this.onFinish = onFinish ?? null;
      this.queue = parts.flatMap((p) =>
        p.pause ? [p] : sentences(p.text, p.lang).map((s) => ({ text: s, lang: p.lang, sec: p.sec })));
      this.run(0);
    },

    // 휴대폰 고장 대비 4가지 (필드워드 2026-11-11 "전체 듣기가 안 된다" 신고)
    //  ① 고른 음성이 실패하면 기기 기본 음성으로 다시
    //  ② 끝 신호(onend)가 안 와도 감시 타이머로 다음 문장
    //  ③ 아이폰 잠금 풀기: 버튼을 누른 순간 빈 문장을 한 번 말한다
    //  ④ 말하기 전 resume() (크롬에서 일시정지에 걸린 채 남는 경우)
    run(from) {
      if (!this.supported) return;
      this.halt();
      const myToken = this.token;
      this.setStatus("playing");
      this.unlock();

      const next = (i) => {
        if (myToken !== this.token) return;
        clearInterval(this.watch);
        this.index = i;
        if (i >= this.queue.length) {
          const done = this.onFinish;
          this.owner = null;
          this.onFinish = null;
          this.setStatus("idle");
          done?.();
          return;
        }
        const p = this.queue[i];
        this.onSentence?.(p);
        if (p.pause) { this.timer = setTimeout(() => next(i + 1), p.pause); return; }
        say(p, i, false);
      };

      const say = (p, i, isRetry) => {
        const u = new SpeechSynthesisUtterance(p.text);
        u.lang = p.lang;
        const voice = this.useDefaultVoice ? null : this.voiceFor(p.lang);
        if (voice) u.voice = voice;
        u.rate = this.rate;

        let started = false;
        let finished = false;
        const sentAt = Date.now();
        const finish = () => { if (!finished) { finished = true; next(i + 1); } };
        const fail = (reason) => {
          if (finished || myToken !== this.token) return;
          this.lastError = reason;
          if (voice && !isRetry) {                     // ①
            finished = true;
            this.useDefaultVoice = true;
            clearInterval(this.watch);
            speechSynthesis.cancel();
            say(p, i, true);
            return;
          }
          finish();
        };
        u.onstart = () => { started = true; };
        u.onend = () => (started || Date.now() - sentAt > 300 ? finish() : fail("소리 없이 끝남"));
        u.onerror = (e) => {
          if (e.error === "interrupted" || e.error === "canceled") return;
          fail(e.error || "오류");
        };

        speechSynthesis.resume();                      // ④
        speechSynthesis.speak(u);

        clearInterval(this.watch);                     // ②
        this.watch = setInterval(() => {
          if (finished || myToken !== this.token) { clearInterval(this.watch); return; }
          const waited = Date.now() - sentAt;
          const busy = speechSynthesis.speaking || speechSynthesis.pending;
          if (!started && !busy && waited > 1500) fail("시작되지 않음");
          else if (started && !busy && waited > 800) finish();
          else if (!started && waited > 4000) fail("시작되지 않음");
        }, 500);
      };

      next(from);
    },

    unlock() {                                         // ③
      if (this.unlocked || !this.supported) return;
      this.unlocked = true;
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
      } catch { /* 무시 */ }
    },

    pause() { this.halt(); this.setStatus("paused"); },

    stop() {
      this.halt();
      this.owner = null;
      this.onFinish = null;
      this.queue = [];
      this.index = 0;
      this.setStatus("idle");
    },

    halt() {
      this.token += 1;
      clearTimeout(this.timer);
      clearInterval(this.watch);
      if (this.supported) speechSynthesis.cancel();
    },

    setStatus(status) {
      this.status = status;
      this.listeners.forEach((fn) => fn());
    },
  };

  return { speech, sentences, clean, koreanCounters, replaceWords, WORD_SAY, SPEECH_FIXES };
})();

if (typeof module !== "undefined") module.exports = Speech;
