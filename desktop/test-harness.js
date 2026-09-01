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

    // 10. 문서 지정 CSS — <style> 블록·style 속성 살균/범위 한정
    const st = render("<style>\\np { color: red }\\nbody { background: #eee }\\n</style>\\n\\n본문\\n", true);
    ok("css: <style> 블록 유지", st.includes("<style>") && st.includes("color:red"), st.slice(0, 240));
    ok("css: 선택자를 미리보기로 한정", st.includes("#preview p") && st.includes(".md-body p"), st.slice(0, 240));
    ok("css: body 선택자 → 컨테이너 치환",
       st.replace(/\\s/g, "").includes("#preview,.md-body{background:#eee}"), st.slice(0, 240));
    const stBad = render("<style>\\np { background: url(http://x/y.png) }\\n@import url(evil.css);\\na { position: fixed }\\n</style>\\n", true);
    ok("css: url() 차단", !stBad.includes("url("), stBad);
    ok("css: @import 차단", !/@import/i.test(stBad), stBad);
    ok("css: position 차단", !/position/i.test(stBad), stBad);
    const stEsc = render('<style>p{color:"</style><script>x</script>"}</style>\\n', true);
    ok("css: style 블록에서 태그 탈출 불가", !/<script/i.test(stEsc), stEsc.slice(0, 240));
    const attr = inline('<span style="color:#c00;position:fixed;background:url(x)">빨강</span>');
    ok("css: style 속성 허용", attr.includes("color:#c00"), attr);
    ok("css: style 속성에서 position·url 제거", !/position|url\\(/i.test(attr), attr);
    ok("css: 위험 스킴·표현식 style 값 차단",
       !/expression|javascript/i.test(inline('<b style="width:expression(alert(1));color:javascript:x">x</b>')));

    // 11. 링크·이미지 문법
    const L1 = render("[네이버](https://naver.com)", true);
    ok("링크: 기본", L1.includes('href="https://naver.com"') && L1.includes(">네이버</a>"), L1);
    const L2 = render("![로고](img/a.png)", true);
    ok("링크: 이미지", L2.includes('<img src="img/a.png"') && L2.includes('alt="로고"'), L2);
    const L3 = render('[네이버](https://naver.com "검색")', true);
    ok("링크: title 속성", L3.includes('href="https://naver.com"') && L3.includes('title="검색"'), L3);
    const L4 = render("[위키](https://ko.wikipedia.org/wiki/A_(B))", true);
    ok("링크: 주소 속 괄호", L4.includes('href="https://ko.wikipedia.org/wiki/A_(B)"') && !L4.includes(">)"), L4);
    const L5 = render("[문서](<./내 문서.md>)", true);
    ok("링크: <꺾쇠> 주소(공백)", L5.includes('href="./내 문서.md"'), L5);
    const L6 = render("[네이버][nv]\\n\\n[nv]: https://naver.com", true);
    ok("링크: 참조식", L6.includes('href="https://naver.com"') && !L6.includes("[nv]:"), L6);
    ok("링크: 정의 없는 참조식은 원문", render("[없음][zz]", true).includes("[없음][zz]"));
    ok("링크: 코드펜스 안 정의는 무시",
       !render("\u0060\u0060\u0060\\n[nv]: https://evil.test\\n\u0060\u0060\u0060\\n\\n[nv]", true).includes('href="https://evil.test"'));
    const L7 = render("<https://example.com>", true);
    ok("링크: <꺾쇠> 자동 링크", L7.includes('href="https://example.com"') && !L7.includes("&gt;<"), L7);
    ok("링크: <꺾쇠> 메일", render("<a@b.com>", true).includes('href="mailto:a@b.com"'));
    ok("링크: 대괄호 낀 텍스트", render("[문서 [초안]](https://x.test)", true).includes(">문서 [초안]</a>"));
    ok("링크: 이미지를 감싼 링크",
       /<a [^>]*><img /.test(render("[![t](t.png)](https://x.test)", true)));
    ok("링크: 텍스트 안 강조 유지",
       render("[**굵게**](https://x.test)", true).includes("<strong>굵게</strong>"));
    ok("링크: 주소 속 밑줄이 강조로 깨지지 않음",
       render("https://x.test/a__b__c", true).includes('href="https://x.test/a__b__c"'));
    ok("링크: 링크 텍스트가 URL 이어도 중첩 안 됨",
       !/<a [^>]*>\\s*<a /.test(render("[https://x.test](https://y.test)", true)));
    ok("링크: javascript: 차단", !/href="javascript/i.test(render("[클릭](javascript:alert(1))", true)));
    ok("링크: 엔터티 위장 스킴 차단",
       !/href="javascript/i.test(render("[클릭](javascript&#58;alert(1))", true)));
    ok("링크: data:image/svg 차단", !render("![x](data:image/svg+xml;base64,PHN2Zz4=)", true).includes("<img"));
    ok("링크: data:image/png 허용", render("![x](data:image/png;base64,iVBORw0KGgo=)", true).includes("<img"));

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
