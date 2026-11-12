/* =========================================================
   쫑긋 — 문장 플레이어 (원음 재생, F-07)
   사람이 녹음한 원음(MP3)을 문장 단위로 재생한다. 음성 합성(speech.js)과 다르다.
     - 문장 하나 재생, 반복, 0.75~1.25배속
     - 섀도잉 자동 멈춤: 문장마다 문장 길이에 비례해 멈춰 따라 말할 시간을 준다 (F-07)
   브라우저에서는 전역 Player로, Node.js 시험에서는 require()로 (계산 부분만) 쓴다.
   ========================================================= */

const Player = (() => {
  /* ---------- 계산 (시험할 수 있는 부분) ---------- */

  // 따라 말할 시간: 문장 길이 × 배율 + 여유. 느리게 들었으면 따라 말하는 데도 더 걸린다.
  const SHADOW_FACTOR = 1.1;
  const SHADOW_EXTRA_MS = 700;
  function shadowGap(sentence, rate = 1) {
    const len = (sentence.end_ms - sentence.start_ms) / rate;
    return Math.round(len * SHADOW_FACTOR + SHADOW_EXTRA_MS);
  }

  // 지금 재생 위치(ms)가 몇 번째 문장인지. 문장 사이 빈틈이면 바로 앞 문장을 돌려준다.
  function sentenceAt(sentences, ms) {
    let found = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (sentences[i].start_ms <= ms) found = i;
      else break;
    }
    return found;
  }

  // 빠르기: 느리게(0.5 = 2배 느리게, 0.67 = 1.5배 느리게) ~ 빠르게(2배). 기본 1 (2026-11-12 사용자 요청)
  const RATES = [0.5, 0.67, 0.75, 1, 1.25, 1.5, 1.7, 2];

  /* ---------- 재생 (브라우저에서만) ---------- */
  // 하나의 <audio>로 문장 구간을 재생한다. 끝 시각은 50ms마다 직접 확인한다
  // (timeupdate 이벤트는 0.25초 간격이라 문장 끝을 넘어 다음 말이 조금 들린다).
  // 음성 파일을 통째로 받아(Blob) 재생한다 (2026-11-12).
  //   이유: 파일을 다 받기 전이나, 서버가 '중간부터 받기(Range)'를 지원하지 않으면
  //         문장 위치로 옮기기(currentTime)가 무시되고 0초부터 재생된다. 파일은 2~4MB라 통째로 받아도 된다.
  function create(src) {
    const audio = new Audio();
    audio.preload = "auto";
    let objectUrl = null;
    const ready = fetch(src)
      .then((r) => { if (!r.ok) throw new Error(`${src} ${r.status}`); return r.blob(); })
      .then((blob) => new Promise((resolve, reject) => {
        objectUrl = URL.createObjectURL(blob);
        audio.addEventListener("loadedmetadata", resolve, { once: true });
        audio.addEventListener("error", () => reject(new Error("audio error")), { once: true });
        audio.src = objectUrl;
      }));
    let loaded = false;
    ready.then(() => { loaded = true; }, () => {});
    // 준비됐으면 바로(버튼을 누른 그 순간에) 시작한다: 아이폰은 누른 순간이 아니면 재생을 막을 수 있다
    const whenReady = (fn, fail) => (loaded ? fn() : ready.then(fn, fail));
    const p = {
      audio,
      ready,
      destroy() { this.stop(); if (objectUrl) URL.revokeObjectURL(objectUrl); },
      rate: 1,
      status: "idle",       // idle / loading(파일 받는 중) / playing / paused / gap(섀도잉 쉬는 중)
      index: -1,            // 지금 재생 중인 문장 번호
      listeners: new Set(),
      timer: null,
      gapTimer: null,
      token: 0,
      onSentence: null,     // 문장이 바뀔 때 (대본 색칠)
      onGap: null,          // 섀도잉 쉬는 시간이 시작될 때 (남은 시간 표시)

      setStatus(s) { this.status = s; this.listeners.forEach((fn) => fn()); },
      setRate(r) { this.rate = r; audio.playbackRate = r; this.setStatus(this.status); },

      stop() {
        this.token += 1;
        clearInterval(this.timer);
        clearTimeout(this.gapTimer);
        audio.pause();
        this.setStatus("idle");
      },

      // 처음부터 끝까지 (대본 없이 듣기). 위치에 따라 문장 번호를 알려 준다.
      playAll(sentences, from = 0) {
        this.stop();
        const my = this.token;
        this.setStatus("loading");
        whenReady(() => { if (my === this.token) this.startAll(sentences, from, my); }, () => this.setStatus("idle"));
      },

      startAll(sentences, from, my) {
        audio.currentTime = from / 1000;
        audio.playbackRate = this.rate;
        audio.play().catch(() => this.setStatus("idle"));
        this.setStatus("playing");
        this.timer = setInterval(() => {
          if (my !== this.token) return;
          const i = sentenceAt(sentences, audio.currentTime * 1000);
          if (i !== this.index) { this.index = i; this.onSentence?.(i); }
          if (audio.ended) { this.stop(); this.onSentence?.(-1); }
        }, 100);
      },

      // 재생 위치를 50ms마다 보다가 endMs에서 멈추고 then()을 부른다.
      // 끝까지 0.1초도 안 남으면 남은 시간만큼만 기다렸다 멈춘다 (2026-11-12). 50ms 간격으로만 보면
      // 끝을 넘어 다음 소리(음악·다음 말)의 머리가 들렸다가 끊겼다.
      watchEnd(endMs, my, onTick, then) {
        clearInterval(this.timer);
        this.timer = setInterval(() => {
          if (my !== this.token) return;
          const now = audio.currentTime * 1000;
          onTick?.(now);
          const left = (endMs - now) / this.rate;
          if (!audio.ended && left > 100) return;
          clearInterval(this.timer);
          const stop = () => { if (my === this.token) { audio.pause(); then(); } };
          if (audio.ended || left <= 0) stop();
          else this.gapTimer = setTimeout(stop, left);
        }, 50);
      },
      pause() { this.token += 1; clearInterval(this.timer); clearTimeout(this.gapTimer); audio.pause(); this.setStatus("paused"); },
      resume(sentences) { this.playAll(sentences, audio.currentTime * 1000); },

      // 한 구간(장면)을 이어서 재생한다. repeat번 반복하고, 반복 사이에 rest ms 쉰다.
      // 쉬는 몇 초 사이에 뇌가 방금 들은 것을 다진다 (짧은 휴식 중 공고화: Bönstrup 외, 2019)
      playRange(sentences, fromMs, toMs, { repeat = 1, rest = 0, onDone } = {}) {
        this.stop();
        const my = this.token;
        this.setStatus("loading");
        whenReady(() => {
          if (my !== this.token) return;
          let round = 0;
          const go = () => {
            if (my !== this.token) return;
            round += 1;
            audio.playbackRate = this.rate;
            audio.currentTime = fromMs / 1000;
            audio.play().catch(() => this.setStatus("idle"));
            this.setStatus("playing");
            this.watchEnd(toMs, my, (now) => {
              const i = sentenceAt(sentences, now);
              if (i !== this.index) { this.index = i; this.onSentence?.(i); }
            }, () => {
              if (round < repeat) {
                this.setStatus("gap");
                this.onGap?.(-1, rest);
                this.gapTimer = setTimeout(go, rest);
              } else {
                this.setStatus("idle");
                this.onSentence?.(-1);
                onDone?.();
              }
            });
          };
          go();
        }, () => this.setStatus("idle"));
      },

      // 문장 목록을 차례로: 한 문장 재생 → (섀도잉이면) 쉬기 → 다음 문장
      // list: 재생할 문장 번호들, shadow: 문장마다 멈출지, onDone: 다 끝나면
      playSentences(sentences, list, opts = {}) {
        this.stop();
        const my = this.token;
        this.setStatus("loading");
        whenReady(() => { if (my === this.token) this.startSentences(sentences, list, opts, my); }, () => this.setStatus("idle"));
      },

      startSentences(sentences, list, { shadow = false, onDone } = {}, my) {
        let k = 0;
        const next = () => {
          if (my !== this.token) return;
          if (k >= list.length) { this.setStatus("idle"); this.onSentence?.(-1); onDone?.(); return; }
          const i = list[k++];
          const s = sentences[i];
          this.index = i;
          this.onSentence?.(i);
          audio.playbackRate = this.rate;
          audio.currentTime = s.start_ms / 1000;
          audio.play().catch(() => this.setStatus("idle"));
          this.setStatus("playing");
          this.watchEnd(s.end_ms, my, null, () => {
            if (shadow) {
              const gap = shadowGap(s, this.rate);
              this.setStatus("gap");
              this.onGap?.(i, gap);
              this.gapTimer = setTimeout(next, gap);
            } else {
              next();
            }
          });
        };
        next();
      },
    };
    return p;
  }

  return { create, shadowGap, sentenceAt, RATES };
})();

if (typeof module !== "undefined") module.exports = Player;
