// 헤드리스 기능 테스트 하니스.
// main.js 와 동일한 app:// 스킴으로 앱을 숨김 창에 로드한 뒤,
// 렌더러 컨텍스트에서 핵심 기능을 직접 실행/검증하고 결과를 stdout(JSON)으로 낸다.
// 실행: electron test-harness.js

const { app, BrowserWindow, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

const HTML_NAME = "markdown-studio.html";
const BASE_DIR = path.join(__dirname, "..");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function resolveWithinBase(reqPath) {
  let rel = decodeURIComponent(reqPath).replace(/^\/+/, "");
  if (rel === "") rel = HTML_NAME;
  const target = path.normalize(path.join(BASE_DIR, rel));
  if (!target.startsWith(path.normalize(BASE_DIR))) return null;
  return target;
}

// 렌더러에서 실행할 검증 스크립트. Promise<{results:[...]}> 를 반환.
const RENDERER_TESTS = `(async () => {
  const R = [];
  const ok = (name, cond, detail) => R.push({ name, pass: !!cond, detail: detail || "" });

  try {
    // 1. DOM/부팅
    ok("boot: 편집기 DOM 존재", !!document.getElementById("editor") && !!document.getElementById("preview"));
    ok("boot: 제목", document.title === "Markdown Studio", document.title);

    // 2. 보안 컨텍스트 + FSA (app:// 스킴 검증의 핵심)
    ok("secure context", window.isSecureContext === true, "isSecureContext=" + window.isSecureContext);
    ok("File System Access API 사용 가능(FSA)", typeof FSA !== "undefined" && FSA === true,
       "showOpenFilePicker=" + (typeof window.showOpenFilePicker));

    // 3. 마크다운 렌더 — 제목/굵게/기울임/목록
    const h = render("# 제목\\n\\n**굵게** 와 *기울임*\\n\\n- 하나\\n- 둘\\n", true);
    ok("render: h1", /<h1[ >]/.test(h) && h.includes("제목"));
    ok("render: 굵게", h.includes("<strong>굵게</strong>"));
    ok("render: 기울임", /<em>기울임<\\/em>/.test(h));
    ok("render: 순서없는 목록", h.includes("<ul>") && (h.match(/<li/g) || []).length >= 2);

    // 4. 표 + 체크박스(태스크) 목록
    const tbl = render("| a | b |\\n|---|---|\\n| 1 | 2 |\\n", true);
    ok("render: 표", tbl.includes("<table") && tbl.includes("<td") && tbl.includes("<th"));
    const task = render("- [x] 완료\\n- [ ] 미완\\n", true);
    ok("render: 태스크 목록 체크박스", (task.match(/type="checkbox"/g) || []).length >= 2 && task.includes("checked"));

    // 5. 코드 하이라이트 (HL) — 펜스 코드 블록
    const code = render("\\u0060\\u0060\\u0060js\\nconst x = 1;\\nfunction f(){ return x; }\\n\\u0060\\u0060\\u0060\\n", true);
    ok("highlight: 코드블록 렌더", code.includes("class=\\"cb\\"") || code.includes("cb-"));
    ok("highlight: 토큰 span(c-*) 생성", /class="c-[a-z]+"/.test(code), code.slice(0, 120));
    const hlOut = HL("const x = 1;", "js");
    ok("highlight: HL 직접 호출 → 키워드 토큰", typeof HL === "function" && hlOut.includes('class="c-key"'), hlOut);

    // 6. 프론트매터 카드
    const fm = render("---\\ntitle: 테스트\\ntags: [a, b]\\n---\\n# 본문\\n", true);
    ok("frontmatter: 카드 테이블", fm.includes("frontmatter"));
    ok("frontmatter: 배열 → fm-tag 칩", fm.includes("fm-tag"));

    // 7. IndexedDB(Recents 저장소) 읽기/쓰기
    try {
      await idb.put({ id: "__test__", name: "t.md", text: "hi", ts: 1 });
      const got = (await idb.all()).find(r => r.id === "__test__");
      ok("indexeddb: put/all", got && got.name === "t.md");
      await idb.del("__test__");
      const gone = (await idb.all()).find(r => r.id === "__test__");
      ok("indexeddb: del", !gone);
    } catch (e) {
      ok("indexeddb: put/all", false, String(e));
    }

    // 8. 새 문서 생성 + 탭/미리보기 반영
    const before = docs.length;
    newDoc();
    ok("문서: newDoc 추가", docs.length === before + 1 && !!cur());
    ok("문서: 미리보기 채워짐", document.getElementById("preview").innerHTML.length > 50);

    // 9. HTML 내보내기(단독 실행형) 생성
    const out = await buildStandaloneHtml(cur());
    const outHtml = out && out.html;
    ok("export: 완결형 HTML 문자열", typeof outHtml === "string" && /<!doctype html>/i.test(outHtml));
    ok("export: 내보내기 CSS(c-* 색상) 포함", typeof outHtml === "string" && outHtml.includes(".c-"));
    ok("export: 본문(md-body) 포함", typeof outHtml === "string" && outHtml.includes('class="md-body"'));

  } catch (e) {
    R.push({ name: "치명적 예외", pass: false, detail: String(e && e.stack || e) });
  }
  return { results: R };
})()`;

protocol.__ready = false;

app.whenReady().then(async () => {
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    const filePath = resolveWithinBase(pathname);
    if (!filePath || !fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
    return net.fetch(url.pathToFileURL(filePath).toString());
  });

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 840,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const pageErrors = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) pageErrors.push(message);
  });

  try {
    await win.loadURL("app://local/" + HTML_NAME);
    // 스크립트가 완전히 실행되도록 한 틱 양보
    await win.webContents.executeJavaScript("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const out = await win.webContents.executeJavaScript(RENDERER_TESTS);
    console.log("TEST_RESULTS_JSON_START");
    console.log(JSON.stringify({ results: out.results, pageErrors }, null, 2));
    console.log("TEST_RESULTS_JSON_END");
  } catch (e) {
    console.log("TEST_RESULTS_JSON_START");
    console.log(JSON.stringify({ fatal: String(e && e.stack || e), pageErrors }, null, 2));
    console.log("TEST_RESULTS_JSON_END");
  } finally {
    app.exit(0);
  }
});
