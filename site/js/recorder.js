/* =========================================================
   쫑긋 — 녹음 (섀도잉·다시 말하기, F-10·F-11)
   브라우저의 마이크(getUserMedia)와 녹음기(MediaRecorder)만 쓴다.
     - 녹음은 기기 밖으로 보내지 않는다 (기능요구서 '녹음은 기본 기기 저장')
     - 시범판은 녹음을 화면을 떠나면 버린다(메모리). 오래 보관(IndexedDB)은 다음에 정한다.
   주의: 마이크는 보안 연결(https)이나 localhost에서만 열린다.
         같은 와이파이의 http://192.168.x.x 주소로는 휴대폰에서 녹음이 안 된다.
   ========================================================= */

const Recorder = (() => {
  // 브라우저마다 녹음 파일 형식이 다르다: 크롬·안드로이드 webm, 아이폰 사파리 mp4
  const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

  function why() {
    if (typeof window === "undefined") return "no-window";
    if (!window.isSecureContext) return "insecure";            // https가 아니다
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return "unsupported";
    return "";
  }

  let stream = null;
  let rec = null;
  let chunks = [];
  const clips = new Map();     // 이름 → { url, ms }

  async function start() {
    if (why()) throw new Error(why());
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.startedAt = Date.now();
    rec.start();
  }

  // 녹음을 멈추고 이름을 붙여 보관한다. 같은 이름이면 예전 녹음을 지운다.
  function stop(name) {
    return new Promise((resolve) => {
      if (!rec || rec.state === "inactive") { resolve(null); return; }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const old = clips.get(name);
        if (old) URL.revokeObjectURL(old.url);
        const clip = { url: URL.createObjectURL(blob), ms: Date.now() - rec.startedAt };
        clips.set(name, clip);
        resolve(clip);
      };
      rec.stop();
    });
  }

  const recording = () => rec?.state === "recording";
  const get = (name) => clips.get(name) ?? null;

  // 화면을 떠날 때: 마이크를 끄고 녹음을 버린다 (마이크 켜짐 표시가 남지 않게)
  function release() {
    if (rec?.state === "recording") rec.stop();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    for (const c of clips.values()) URL.revokeObjectURL(c.url);
    clips.clear();
  }

  return { why, start, stop, recording, get, release };
})();
