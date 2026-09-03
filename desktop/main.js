// Markdown Studio — Electron main process
// 단일 자체완결형 HTML(markdown-studio.html)을 커스텀 privileged 스킴(app://)으로
// 서빙해 보안 컨텍스트를 확보한다. 이렇게 해야 File System Access API
// (showOpenFilePicker / showSaveFilePicker) 와 IndexedDB(Recents)가 정상 동작한다.

const { app, BrowserWindow, protocol, net, shell, session, Menu, clipboard, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

// 개발 실행(electron .)에서는 리포지토리 루트의 원본 HTML을,
// 패키징(electron-packager, --extra-resource)된 실행에서는 resources/ 아래의
// HTML을 사용한다. 어느 경우든 실제 존재하는 위치를 자동 탐색한다.
const HTML_NAME = "markdown-studio.html";
const HTML_CANDIDATES = [
  path.join(process.resourcesPath || "", HTML_NAME), // 패키징: resources/markdown-studio.html
  path.join(__dirname, HTML_NAME),                    // 혹시 app 폴더에 함께 복사된 경우
  path.join(__dirname, "..", HTML_NAME),              // 개발: 리포지토리 루트
];
const HTML_PATH = HTML_CANDIDATES.find((p) => p && fs.existsSync(p)) || HTML_CANDIDATES[0];
const BASE_DIR = path.dirname(HTML_PATH);

// app:// 을 표준(origin 보유) + 보안 컨텍스트 스킴으로 등록한다.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

function resolveWithinBase(reqPath) {
  // app://local/<path> → BASE_DIR/<path>. 상위 경로 탈출 방지.
  let rel = decodeURIComponent(reqPath).replace(/^\/+/, "");
  if (rel === "" ) rel = HTML_NAME;
  const target = path.normalize(path.join(BASE_DIR, rel));
  if (!target.startsWith(path.normalize(BASE_DIR))) return null;
  return target;
}

// ── 파일 연결(더블클릭) 지원 ────────────────────────────────
// Windows 탐색기에서 .md 를 더블클릭하면 "Markdown Studio.exe C:\...\문서.md" 로
// 실행된다. 그 파일 경로를 argv 에서 찾아 렌더러의 읽기전용 뷰어로 열어 준다.
// argv 예) 패키징: [exe, 파일]  /  개발: [electron, ".", 파일]
function fileArgFrom(argv) {
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a || a.startsWith("-") || a === ".") continue;   // 스위치(--selftest 등)·dev 마커 제외
    try {
      if (fs.existsSync(a) && fs.statSync(a).isFile()) return path.resolve(a);
    } catch (_) {}
  }
  return null;
}

// 파일 내용을 읽어 렌더러(웹 앱)에 읽기전용 문서로 넣고 활성화한다.
// 웹 앱의 전역(docs/uid/select)을 그대로 사용한다. 이미 같은 내용이 열려 있으면 그 탭으로 전환.
// opts.recent === false 면 최근 파일 목록에 등록하지 않는다(릴리스 노트처럼 앱이 여는 안내 문서용).
function openFileInWindow(win, filePath, opts) {
  if (!win || win.isDestroyed()) return Promise.resolve("no-window");
  const recent = !opts || opts.recent !== false;
  let text;
  try { text = fs.readFileSync(filePath, "utf8"); }
  catch (e) { return Promise.resolve("read-fail:" + (e && e.message || e)); }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // UTF-8 BOM 제거
  const name = path.basename(filePath);
  const js = `(async function(){
    try{
      if(typeof docs==='undefined' || typeof select!=='function' || typeof uid!=='function') return "not-ready";
      var __n=${JSON.stringify(name)}, __t=${JSON.stringify(text)}, __rec=${recent ? "true" : "false"};
      var ex=docs.find(function(d){return d.name===__n && d.text===__t;});
      if(ex){ ex.nativePath = ex.nativePath || ${JSON.stringify(filePath)}; select(ex.id); if(__rec && typeof touchRecent==='function') await touchRecent(ex); return "dup"; }
      var id=uid();
      var d={id:id, name:__n, text:__t, dirty:false, handle:null, readonly:true, nativePath:${JSON.stringify(filePath)}};
      docs.push(d);
      select(id);
      if(__rec && typeof touchRecent==='function') await touchRecent(d);   // 최근 파일에 등록(핸들 없으므로 본문 보관)
      return "opened";
    }catch(e){ return "err:"+(e&&e.message||e); }
  })()`;
  return win.webContents.executeJavaScript(js, true);
}

// 저장 브리지 — 탐색기에서 더블클릭으로 연 문서(FSA 핸들 없음)를 원본 경로에 덮어쓴다.
// 임의 경로 쓰기를 막기 위해 ① 마크다운/텍스트 확장자이고 ② 이미 존재하는 파일일 때만 허용한다
// (새 파일 만들기는 웹 앱의 '다른 이름으로 저장'(FSA) 경로가 담당).
const SAVABLE_EXT = new Set([".md", ".markdown", ".mdown", ".mkd", ".txt"]);
ipcMain.handle("mds:save-file", (_event, payload) => {
  try {
    const p = payload && payload.path, text = payload && payload.text;
    if (typeof p !== "string" || typeof text !== "string") return { ok: false, error: "잘못된 요청" };
    const abs = path.resolve(p);
    if (!SAVABLE_EXT.has(path.extname(abs).toLowerCase())) return { ok: false, error: "허용되지 않는 확장자" };
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { ok: false, error: "원본 파일을 찾을 수 없음" };
    fs.writeFileSync(abs, text, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// 상대경로 이미지 읽기 — 문서가 ![](사진.png) 처럼 참조한 그림을, 그 문서 파일이 있는 폴더를
// 기준으로 찾아 data URI 로 돌려준다. 데스크톱에서는 이것만으로 '폴더에서 열기' 없이 그림이 보인다.
// 문서가 임의 파일을 읽어 가지 못하도록 ① 이미지 확장자 ② 상대경로(드라이브·루트 절대경로 금지)
// ③ 크기 상한만 통과시킨다.
const IMG_MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".bmp": "image/bmp", ".avif": "image/avif", ".ico": "image/x-icon",
};
const IMG_MAX_BYTES = 24 * 1024 * 1024;
ipcMain.handle("mds:read-image", (_event, payload) => {
  try {
    const base = payload && payload.base, rel = payload && payload.rel;
    if (typeof base !== "string" || typeof rel !== "string" || !rel) return { ok: false };
    let clean = rel.split(/[?#]/)[0];
    try { clean = decodeURIComponent(clean); } catch (_) { /* 인코딩이 아니면 원문 그대로 */ }
    if (/^[a-zA-Z]+:/.test(clean) || /^[\\/]/.test(clean)) return { ok: false };   // 상대경로만
    const abs = path.resolve(path.dirname(base), clean);
    const mime = IMG_MIME[path.extname(abs).toLowerCase()];
    if (!mime) return { ok: false };
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size > IMG_MAX_BYTES) return { ok: false };
    return { ok: true, dataUrl: "data:" + mime + ";base64," + fs.readFileSync(abs).toString("base64") };
  } catch (e) {
    return { ok: false };
  }
});

// 네이티브 열기 대화상자 — FSA(showOpenFilePicker)로 연 파일은 webUtils.getPathForFile 가 빈 값을
// 돌려줘 nativePath 가 비고(→ 상대경로 이미지·제자리 저장 불가), 그래서 데스크톱에서는 이 네이티브
// 대화상자로 실제 경로를 확보해 문서를 연다. 마크다운/텍스트만, 다중 선택 허용.
ipcMain.handle("mds:open-file", async (_event) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
    const opts = {
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    };
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { canceled: true, files: [] };
    const files = [];
    for (const p of res.filePaths) {
      try { files.push({ path: p, name: path.basename(p), text: fs.readFileSync(p, "utf8") }); }
      catch (_) { /* 못 읽는 파일은 건너뛴다 */ }
    }
    return { canceled: false, files };
  } catch (e) {
    return { canceled: true, files: [], error: String((e && e.message) || e) };
  }
});

// ── 릴리스 노트 찾기 ─────────────────────────────────────────
// desktop/ 에 RELEASE-x.y.z.md 로 릴리스 노트를 둔다. 개발 실행에서는 __dirname(=desktop)에서,
// 패키징 실행에서는 resources/ 에서 찾는다(package.json 의 extraResources 로 함께 복사). 여러 개면
// 버전이 가장 높은 것을 고른다.
function cmpVer(a, b) {
  for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; }
  return 0;
}
function findReleaseNotes() {
  const dirs = [process.resourcesPath, __dirname, path.join(__dirname, ".."), BASE_DIR].filter(Boolean);
  let best = null, bestV = [-1, 0, 0];
  const seen = new Set();
  for (const dir of dirs) {
    if (seen.has(dir)) continue;
    seen.add(dir);
    let files;
    try { files = fs.readdirSync(dir); } catch (_) { continue; }
    for (const f of files) {
      const m = /^RELEASE-(\d+)\.(\d+)\.(\d+)\.md$/i.exec(f);
      if (!m) continue;
      const v = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (cmpVer(v, bestV) > 0) { bestV = v; best = path.join(dir, f); }
    }
  }
  return best;
}

// 도움말 → 릴리스 노트: 최신 RELEASE-*.md 를 앱 안 읽기전용 뷰어로 연다(최근 파일에는 넣지 않음).
function openReleaseNotes() {
  const win = BrowserWindow.getFocusedWindow() || mruWindow();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const p = findReleaseNotes();
  if (!p) {
    dialog.showMessageBox(win, { type: "info", noLink: true, buttons: ["확인"],
      title: "릴리스 노트", message: "릴리스 노트 파일을 찾을 수 없습니다." });
    return;
  }
  openFileInWindow(win, p, { recent: false });
}

function showAbout() {
  const win = BrowserWindow.getFocusedWindow() || mruWindow() || undefined;
  dialog.showMessageBox(win, {
    type: "info", noLink: true, buttons: ["확인"],
    title: "Markdown Studio 정보",
    message: "Markdown Studio",
    detail: "버전 " + app.getVersion() + "\n© 2026 Samsung Asset Management Co.",
  });
}

// ── 창 포커스 순서(MRU) 추적 ─────────────────────────────────
// 창을 여러 개 띄울 수 있으므로, 탐색기에서 문서를 더블클릭했을 때 '가장 최근에 쓰던 창'에
// 열어 주기 위해 포커스 순서를 관리한다(맨 앞이 최근).
const winFocusOrder = [];
function trackWindow(win) {
  const bump = () => {
    const i = winFocusOrder.indexOf(win);
    if (i >= 0) winFocusOrder.splice(i, 1);
    winFocusOrder.unshift(win);
  };
  win.on("focus", bump);
  win.on("closed", () => {
    const i = winFocusOrder.indexOf(win);
    if (i >= 0) winFocusOrder.splice(i, 1);
  });
  bump();
}
function mruWindow() {
  for (const w of winFocusOrder) if (w && !w.isDestroyed()) return w;
  const all = BrowserWindow.getAllWindows();
  return all.length ? all[0] : null;
}

// ── 애플리케이션 메뉴 ────────────────────────────────────────
// 메뉴 단축키는 웹 앱(렌더러)이 쓰는 것과 겹치지 않게 고른다. 렌더러가 이미 쓰는
// Ctrl+S/N/O/E/W/B/P·⇧ 조합은 피하고, 새 창은 Ctrl+Shift+N 을 쓴다.
function buildAppMenu() {
  const template = [
    {
      label: "파일(&F)",
      submenu: [
        { label: "새 창", accelerator: "CmdOrCtrl+Shift+N", click: () => createWindow() },
        { type: "separator" },
        { role: "close", label: "창 닫기", accelerator: "CmdOrCtrl+Shift+W" },
        { role: "quit", label: "종료" },
      ],
    },
    {
      label: "편집(&E)",
      submenu: [
        { role: "undo", label: "실행 취소" },
        { role: "redo", label: "다시 실행" },
        { type: "separator" },
        { role: "cut", label: "잘라내기" },
        { role: "copy", label: "복사" },
        { role: "paste", label: "붙여넣기" },
        { role: "selectAll", label: "전체 선택" },
      ],
    },
    {
      label: "보기(&V)",
      submenu: [
        { role: "zoomIn", label: "확대" },
        { role: "zoomOut", label: "축소" },
        { role: "resetZoom", label: "기본 크기" },
        { type: "separator" },
        { role: "togglefullscreen", label: "전체 화면" },
      ],
    },
    {
      label: "도움말(&H)",
      submenu: [
        { label: "릴리스 노트", click: () => openReleaseNotes() },
        { type: "separator" },
        { label: "Markdown Studio 정보", click: () => showAbout() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 시작 시 넘어온 파일(있으면). did-finish-load 이후 렌더러에 주입한다.
let pendingFile = fileArgFrom(process.argv);

// 셀프테스트 스위치: MDS_SELFTEST=1 환경변수가 있을 때만 동작한다.
// 패키징된 실제 exe가 부팅되어 app:// 로 HTML을 보안 컨텍스트에서 서빙하고
// 렌더러가 동작하는지 검증한 뒤 결과(JSON)를 stdout으로 내고 종료한다.
// 프로덕션 일반 실행에는 아무 영향이 없다.
const SELFTEST = process.env.MDS_SELFTEST === "1" || process.argv.includes("--selftest");
async function runSelfTest(win) {
  const CHECK = `(async () => {
    const R = [];
    const ok = (n, c, d) => R.push({ name: n, pass: !!c, detail: d || "" });
    try {
      ok("부팅: 편집기 DOM", !!document.getElementById("editor") && !!document.getElementById("preview"));
      ok("보안 컨텍스트", window.isSecureContext === true);
      ok("FSA 사용 가능", typeof FSA !== "undefined" && FSA === true);
      const h = render("# H\\n\\n**b**\\n", true);
      ok("마크다운 렌더", /<h1[ >]/.test(h) && h.includes("<strong>b</strong>"));
      ok("열린 문서 상태", true, (typeof docs !== "undefined")
        ? ("docs=" + docs.length + " [" + docs.map(function(d){return d.name + (d.readonly ? "(RO)" : "");}).join(", ") + "]")
        : "docs 미정의");
      ok("최근 파일 등록", typeof recents !== "undefined" && recents.length >= 1,
        (typeof recents !== "undefined") ? ("recents=" + recents.length + " [" + recents.map(function(r){return r.name;}).join(", ") + "]") : "recents 미정의");

      // 탐색기(파일 연결)로 연 문서는 FSA 핸들이 없다 → 원본 경로 + 네이티브 저장 브리지로 덮어써야 한다.
      // 인수로 .md 를 넘겨 셀프테스트를 돌렸을 때만(nativePath 가 있을 때만) 검사한다.
      const bridge = !!(window.mdsNative && typeof window.mdsNative.saveFile === "function");
      ok("네이티브 저장 브리지 노출", bridge);
      const nd = (typeof docs !== "undefined") ? docs.find(function(d){ return !!d.nativePath; }) : null;
      if (bridge && nd) {
        select(nd.id);
        nd.readonly = false; nd.dirty = true;
        nd.text = nd.text + String.fromCharCode(10) + "<!-- selftest -->" + String.fromCharCode(10);
        await saveDoc();
        ok("네이티브 저장: 원본 덮어쓰기", nd.dirty === false, "dirty=" + nd.dirty + " path=" + nd.nativePath);
        const bad = await window.mdsNative.saveFile("C:/Windows/System32/mds-selftest.dll", "x");
        ok("네이티브 저장: 허용 밖 경로 거부", !(bad && bad.ok), JSON.stringify(bad));

        // 상대경로 이미지 — 문서 파일이 있는 폴더에서 찾아 미리보기에 채워야 한다('폴더에서 열기' 없이).
        const rd = await window.mdsNative.readImage(nd.nativePath, "mds-selftest.png");
        ok("상대경로 이미지: 브리지 읽기", !!(rd && rd.ok && String(rd.dataUrl || "").startsWith("data:image/png;base64,")),
           JSON.stringify(rd && rd.ok));
        const bad2 = await window.mdsNative.readImage(nd.nativePath, "../../../Windows/win.ini");
        ok("상대경로 이미지: 이미지 아닌 파일 거부", !(bad2 && bad2.ok), JSON.stringify(bad2));
        nd.text = "![p](mds-selftest.png)";
        select(nd.id); flushRender();
        await localImagesReady;
        const im = document.querySelector("#preview img");
        ok("상대경로 이미지: 미리보기 치환", !!im && String(im.getAttribute("src") || "").startsWith("data:image/png"),
           im ? (im.getAttribute("src") || "").slice(0, 40) : "img 없음");
      }
    } catch (e) {
      ok("셀프테스트 예외", false, String((e && e.stack) || e));   // 렌더러 예외를 결과로 실어 보낸다
    }
    return R;
  })()`;
  const outPath = process.env.MDS_SELFTEST_OUT || path.join(require("os").tmpdir(), "mds-selftest.json");
  let payload;
  try {
    await win.webContents.executeJavaScript("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    payload = { htmlPath: HTML_PATH, packaged: app.isPackaged, results: await win.webContents.executeJavaScript(CHECK) };
  } catch (e) {
    payload = { htmlPath: HTML_PATH, packaged: app.isPackaged, results: [{ name: "치명적 예외", pass: false, detail: String(e && e.stack || e) }] };
  }
  try { fs.writeFileSync(outPath, JSON.stringify(payload, null, 2)); } catch (_) {}
  app.exit(0);
}

// 이모지 빠른 삽입 서브메뉴 — Windows 는 앱에서 OS 이모지 패널을 열 수 없으므로,
// 자주 쓰는 이모지를 그룹별로 제공하고 클릭 시 편집기 커서 위치에 바로 삽입한다
// (webContents.insertText 는 포커스된 편집 요소에 텍스트를 넣는다).
const EMOJI_GROUPS = [
  ["자주 쓰는", "👍 ✅ ❤️ 🔥 ✨ 🎉 💡 📌 📝 🚀"],
  ["표정", "😀 😄 😊 🙂 😉 😍 😎 🤔 😅 😂 😭 😱 🥳 🤩"],
  ["손·제스처", "👍 👎 👏 🙏 💪 🙌 👀"],
  ["기호", "⭐ ✅ ❌ ❗ ❓ 💯 📎 📅 ⏰ ⚠️"],
  ["하트", "❤️ 🧡 💛 💚 💙 💜 🖤 💔"],
];
function emojiSubmenu(win) {
  return EMOJI_GROUPS.map(([name, chars]) => ({
    label: name,
    submenu: chars.split(" ").map((e) => ({
      label: e,
      click: () => { if (win && !win.isDestroyed()) win.webContents.insertText(e); },
    })),
  }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: "#ffffff",
    title: "Markdown Studio",
    autoHideMenuBar: false,   // 메뉴바 표시(도움말 → 릴리스 노트 등)
    show: !SELFTEST,
    webPreferences: {
      contextIsolation: true,       // 렌더러와 Electron 내부 컨텍스트 격리
      nodeIntegration: false,       // 렌더러에서 Node API 접근 차단
      sandbox: true,                // 렌더러 샌드박스화 (프리로드는 contextBridge 로 최소 표면만 노출)
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,            // 동일 출처 정책·CSP 강제(기본값이나 명시)
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  });

  win.webContents.once("did-finish-load", async () => {
    if (pendingFile) {                          // 더블클릭으로 넘어온 파일을 뷰어로 연다
      await openFileInWindow(win, pendingFile);
      pendingFile = null;
    }
    if (SELFTEST) runSelfTest(win);
  });

  win.loadURL("app://local/" + HTML_NAME);

  // 새 창(window.open·target=_blank) 생성은 전면 거부한다.
  // 외부 http(s) 링크만 기본 브라우저로 넘기고, 그 밖의 스킴은 무시한다.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (/^https?:/i.test(u)) shell.openExternal(u);
    return { action: "deny" };
  });

  // 앱 창이 app:// 밖으로 top-level 이동하는 것을 막는다(악성 문서의 리다이렉트 등 방어).
  // 외부 http(s)로의 이동 시도는 기본 브라우저로 대신 연다.
  win.webContents.on("will-navigate", (e, u) => {
    if (!u.startsWith("app://")) {
      e.preventDefault();
      if (/^https?:/i.test(u)) shell.openExternal(u);
    }
  });

  // 웹뷰 부착 차단(사용하지 않음).
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());

  // 우클릭 컨텍스트 메뉴 — Electron 은 브라우저와 달리 편집기(textarea)에
  // 기본 편집 메뉴(잘라내기/복사/붙여넣기)를 자동 제공하지 않으므로 직접 만든다.
  // sandbox:true + preload 없음 구조라 렌더러가 아닌 메인 프로세스에서 처리한다.
  // Chrome 처럼 상황(링크·이미지·선택 텍스트·편집영역)에 따라 항목을 구성하고,
  // 단축키 힌트(accelerator, 표시 전용 — 실제 동작은 네이티브가 처리)와 이모지 아이콘을 붙인다.
  win.webContents.on("context-menu", (event, params) => {
    const f = params.editFlags || {};
    const sel = (params.selectionText || "").trim();
    const t = [];
    const SEP = { type: "separator" };
    // 단축키는 표시만 하고 등록하지 않음(네이티브 편집 단축키와 중복 방지)
    const acc = (label, role, accelerator, enabled) =>
      ({ label, role, accelerator, enabled, registerAccelerator: false });

    // ── 링크 위에서 우클릭 ──
    if (params.linkURL) {
      t.push({ label: "🔗 링크 열기", click: () => shell.openExternal(params.linkURL) });
      t.push({ label: "📋 링크 주소 복사", click: () => clipboard.writeText(params.linkURL) });
      t.push(SEP);
    }
    // ── 이미지 위에서 우클릭 ──
    if (params.mediaType === "image" && params.srcURL) {
      t.push({ label: "🖼️ 이미지 복사", role: "copyImage" });
      t.push({ label: "📋 이미지 주소 복사", click: () => clipboard.writeText(params.srcURL) });
      t.push(SEP);
    }

    if (params.isEditable) {
      // ── 편집 가능한 영역(편집기) ──
      t.push(acc("↩️ 실행 취소", "undo", "CmdOrCtrl+Z", !!f.canUndo));
      t.push(acc("↪️ 다시 실행", "redo", "CmdOrCtrl+Shift+Z", !!f.canRedo));
      t.push(SEP);
      t.push(acc("✂️ 잘라내기", "cut", "CmdOrCtrl+X", !!f.canCut));
      t.push(acc("📄 복사", "copy", "CmdOrCtrl+C", !!f.canCopy));
      t.push(acc("📥 붙여넣기", "paste", "CmdOrCtrl+V", !!f.canPaste));
      t.push(acc("🧾 서식 없이 붙여넣기", "pasteAndMatchStyle", "CmdOrCtrl+Shift+V", !!f.canPaste));
      t.push({ label: "🗑️ 삭제", role: "delete", enabled: !!f.canDelete });
      t.push(SEP);
      t.push(acc("🔲 전체 선택", "selectAll", "CmdOrCtrl+A", f.canSelectAll !== false));
      t.push(SEP);
      t.push({ label: "😀 이모지  (Win+마침표(.))", submenu: emojiSubmenu(win) });
    } else {
      // ── 읽기전용/미리보기 등 ──
      if (sel) {
        t.push(acc("📄 복사", "copy", "CmdOrCtrl+C", !!f.canCopy));
        const q = sel.length > 30 ? sel.slice(0, 30) + "…" : sel;
        t.push({ label: `🔍 웹에서 "${q}" 검색`, click: () =>
          shell.openExternal("https://www.google.com/search?q=" + encodeURIComponent(sel)) });
        t.push(SEP);
      }
      t.push(acc("🔲 전체 선택", "selectAll", "CmdOrCtrl+A", f.canSelectAll !== false));
    }

    // 끝의 구분선 제거 후 표시
    while (t.length && t[t.length - 1] === SEP) t.pop();
    if (t.length) Menu.buildFromTemplate(t).popup({ window: win });
  });

  // 종료 확인 — 웹 앱의 beforeunload(dirty 시 preventDefault)는 브라우저에서는 확인창을
  // 띄우지만 Electron 에서는 확인창 없이 "닫기 취소"만 되어 편집 중 창이 안 닫힌다.
  // 그래서 여기서 네이티브 확인 다이얼로그로 처리하고, 확정 시 win.destroy() 로
  // beforeunload 를 우회해 확실히 닫는다.
  let confirmedClose = false;
  win.on("close", async (e) => {
    if (confirmedClose) return;              // 이미 확인됨 → 그대로 닫힘
    e.preventDefault();
    let dirty = false;
    try {
      dirty = await win.webContents.executeJavaScript(
        "(typeof docs!=='undefined') && Array.isArray(docs) && docs.some(function(d){return d && d.dirty;})"
      );
    } catch (_) { dirty = false; }
    if (!dirty) { confirmedClose = true; win.destroy(); return; }

    const { response } = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["저장", "저장 안 하고 닫기", "취소"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: "저장하지 않은 변경 내용",
      message: "저장하지 않은 변경 내용이 있습니다.",
      detail: "저장한 뒤 닫거나, 저장하지 않고 닫을 수 있습니다.",
    });

    if (response === 2) return;                        // 취소 → 창 유지
    if (response === 1) { confirmedClose = true; win.destroy(); return; }  // 저장 안 함

    // response === 0(저장): 모든 dirty 문서를 순회 저장한다.
    // 핸들 없는 새 문서는 저장 위치 선택창(FSA)이 뜨므로 userGesture=true 로 실행한다.
    // 저장을 취소/거부해 dirty 가 남으면 창을 닫지 않고 유지한다(데이터 보존).
    const SAVE_ALL = `(async function(){
      try{
        if(typeof docs==='undefined' || !Array.isArray(docs)) return true;
        var ids = docs.filter(function(d){return d && d.dirty;}).map(function(d){return d.id;});
        for(var i=0;i<ids.length;i++){
          var d = docs.find(function(x){return x.id===ids[i];});
          if(!d || !d.dirty) continue;
          if(typeof select==='function') select(d.id);
          if(typeof saveDoc==='function') await saveDoc();
        }
        return !docs.some(function(d){return d && d.dirty;});
      }catch(e){ return false; }
    })()`;
    let allSaved = false;
    try { allSaved = await win.webContents.executeJavaScript(SAVE_ALL, true); }
    catch (_) { allSaved = false; }
    if (allSaved) { confirmedClose = true; win.destroy(); }
    // 일부라도 저장되지 않았으면(취소/권한거부) 창 유지 — 사용자가 다시 시도/판단
  });

  trackWindow(win);   // 포커스 순서(MRU) 추적 — 더블클릭 문서를 최근 창에 연다
  return win;
}

// 단일 인스턴스(프로세스는 하나) — 대신 창을 여러 개 띄울 수 있다.
// 이미 앱이 떠 있을 때 두 번째 실행이 들어오면:
//  · 파일 인자가 있으면(탐색기에서 .md 더블클릭) → '가장 최근에 쓰던 창'에 그 파일을 연다.
//  · 파일 인자가 없으면(앱 아이콘 재실행 등) → 새 창을 띄운다.
// (셀프테스트는 매번 새 프로세스로 열고 종료하므로 예외)
const gotLock = SELFTEST ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    const f = fileArgFrom(argv);
    if (f) {
      const win = mruWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        openFileInWindow(win, f);
      } else {
        pendingFile = f;      // 창이 하나도 없으면 새로 만들어 그 안에 연다
        createWindow();
      }
    } else {
      createWindow();         // 파일 없이 재실행 → 새 창
    }
  });

  app.whenReady().then(() => {
    // 권한 요청 화이트리스트 — 앱이 실제로 쓰는 것만 허용하고 나머지(위치·카메라·마이크·
    // 알림·MIDI·USB 등)는 모두 거부한다. 클립보드 쓰기는 실패해도 앱이 execCommand 로 폴백한다.
    // "fileSystem" 은 File System Access API(사용자가 피커로 직접 고른 파일) 전용이다. 허용하지 않으면
    // '열기'로 연 원본에 쓰기 권한을 못 받아 저장이 '다른 이름으로 저장'으로 떨어진다.
    const ALLOWED_PERMS = new Set(["clipboard-read", "clipboard-sanitized-write", "local-fonts", "fileSystem"]);
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      callback(ALLOWED_PERMS.has(permission));
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission) => ALLOWED_PERMS.has(permission));

    // app:// 요청을 로컬 파일로 매핑한다.
    protocol.handle("app", (request) => {
      const { pathname } = new URL(request.url);
      const filePath = resolveWithinBase(pathname);
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(url.pathToFileURL(filePath).toString());
    });

    if (!SELFTEST) buildAppMenu();   // 셀프테스트는 메뉴 없이 최소 구동
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
