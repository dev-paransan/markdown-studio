// sync-web.mjs — 안드로이드 앱 정본(영문판) HTML을 Capacitor 웹 자산(www/)으로 복사한다.
//
// 상위 폴더의 markdown-studio-en.html(안드로이드 앱 전용 영문판)을 읽어 www/index.html 로
// 내보낸다. 데스크톱 정본은 markdown-studio.html(한국어)이고, 안드로이드 앱은 이 영문판을
// 별도 정본으로 쓴다. 웹 앱 로직을 고치면 두 파일 모두에 반영해야 한다.
// 이때 </body> 바로 앞에 네이티브 브리지 <script>(capacitor-bridge.js) 한 줄을
// 주입한다. 정본 HTML 자체는 절대 수정하지 않는다 — 이 스크립트가 매 빌드마다
// 최신 정본을 다시 복사하므로, 앱 정본을 고치면 `npm run sync:web` 만 다시 돌리면 된다.
//
// 브리지는 브라우저(비-네이티브)에서는 아무 일도 하지 않으므로, www/index.html 을
// 그냥 브라우저로 열어도 원본과 동일하게 동작한다.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");        // android-app/
const repoDir = resolve(projectDir, "..");          // md_editor/

const SRC = join(repoDir, "markdown-studio-en.html");   // 안드로이드 앱 전용 영문판 정본
const OUT = join(projectDir, "www", "index.html");
const BRIDGE_SRC = join(projectDir, "www", "capacitor-bridge.js"); // 이미 www/ 에 존재

if (!existsSync(SRC)) {
  console.error(`[sync-web] 정본 HTML을 찾을 수 없습니다: ${SRC}`);
  process.exit(1);
}

let html = readFileSync(SRC, "utf8");

// 브리지 <script> 주입.
// 주의: 이 정본 HTML 에는 최상위 </body>/</html> 태그가 없다(파일이 마지막 인라인
// <script> 로 끝난다). 게다가 파일 중간에는 내보내기 템플릿 문자열 안에 리터럴
// "</body>" 가 들어 있으므로, </body> 를 기준으로 삽입하면 그 문자열을 오염시킨다.
// 따라서 무조건 파일 맨 끝(EOF)에 최상위 <script> 로 덧붙인다 — 메인 스크립트가
// 모두 로드된 뒤 마지막에 실행되므로 브리지가 필요한 DOM/전역은 이미 준비돼 있다.
const TAG = '<script src="capacitor-bridge.js"></script>';
// 주의: 정본 HTML 본문 주석에도 "capacitor-bridge.js" 문자열이 등장할 수 있으므로,
// 단순 부분 문자열이 아니라 실제 <script> 태그 전체가 이미 있는지로 판단한다.
// (부분 문자열로 검사하면 주석 때문에 주입이 건너뛰어져 브리지가 로드되지 않는다.)
if (!html.includes(TAG)) {
  html = html.replace(/\s*$/, "") + `\n${TAG}\n`;
}

writeFileSync(OUT, html, "utf8");
console.log(`[sync-web] ${SRC}`);
console.log(`[sync-web]   → ${OUT} (브리지 스크립트 주입 완료)`);

// mermaid.min.js 동봉 — ```mermaid 블록을 SVG로 렌더할 때 지연 로드되는 라이브러리.
// 정본 HTML 옆(repo 루트)의 파일을 www/ 로 복사해 앱에서 오프라인으로 same-origin 로드되게 한다.
const MERMAID_SRC = join(repoDir, "mermaid.min.js");
const MERMAID_OUT = join(projectDir, "www", "mermaid.min.js");
if (existsSync(MERMAID_SRC)) {
  copyFileSync(MERMAID_SRC, MERMAID_OUT);
  console.log(`[sync-web]   → ${MERMAID_OUT} (mermaid 동봉)`);
} else {
  console.warn(`[sync-web] 경고: ${MERMAID_SRC} 가 없습니다. mermaid 다이어그램이 앱에서 렌더되지 않습니다.`);
}

if (!existsSync(BRIDGE_SRC)) {
  console.warn(`[sync-web] 경고: ${BRIDGE_SRC} 가 없습니다. 저장이 브라우저 폴백으로 동작할 수 있습니다.`);
}
