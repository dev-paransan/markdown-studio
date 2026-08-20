// make-store-graphics.mjs — Play 스토어 등록용 그래픽 생성.
//   store/feature-graphic.png   1024×500  피처 그래픽(브랜드 배너)
//   store/play-icon-512.png     512×512   고해상도 앱 아이콘
// 앱 아이콘과 동일한 마크·브랜드 색(잉크 #16202b · 종이 #fbfbf8 · 액센트 #2e7d6e)을 쓴다.
// sharp(=@capacitor/assets 의존성)로 SVG 를 래스터화한다.

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "store");
mkdirSync(outDir, { recursive: true });

const INK = "#16202b";
const PAPER = "#fbfbf8";
const ACCENT = "#2e7d6e";
const MUTED = "#5b6773";

// make-assets.mjs 와 동일한 마크(M + 아래 화살표), 1024 좌표계.
function mark(color, sw = 66) {
  return `
    <g fill="none" stroke="${color}" stroke-width="${sw}"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M 300 664 L 300 360 L 402 472 L 504 360 L 504 664"/>
      <path d="M 656 360 L 656 590"/>
    </g>
    <path d="M 596 536 L 656 612 L 716 536 Z" fill="${color}"/>`;
}
// 마크(1024 공간, bbox 대략 x300..716 y360..664, center ~508,512)를
// 지정한 캔버스 좌표 (cx,cy) 중심에 scale s 로 배치.
function placedMark(color, cx, cy, s) {
  const tx = cx - 508 * s, ty = cy - 512 * s;
  return `<g transform="translate(${tx} ${ty}) scale(${s})">${mark(color)}</g>`;
}

async function render(name, svg, w, h) {
  const p = join(outDir, name);
  await sharp(Buffer.from(svg)).resize(w, h).png().toFile(p);
  console.log("[store-graphics]  " + name + `  (${w}x${h})`);
}

// ── 피처 그래픽 1024×500 ──
// 종이 배경 · 좌측 액센트 타일(흰 마크) · 우측 앱명 + 태그라인.
const FONT = `-apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="${PAPER}"/>
  <rect x="0" y="0" width="14" height="500" fill="${ACCENT}"/>
  <rect x="70" y="96" width="308" height="308" rx="68" ry="68" fill="${ACCENT}"/>
  ${placedMark(PAPER, 224, 250, 0.42)}
  <text x="424" y="232" font-family="${FONT}" font-size="72" font-weight="700" fill="${INK}"
        textLength="556" lengthAdjust="spacingAndGlyphs">Markdown Studio</text>
  <text x="427" y="306" font-family="${FONT}" font-size="35" font-weight="400" fill="${MUTED}"
        textLength="520" lengthAdjust="spacingAndGlyphs">Private &#183; offline Markdown editor</text>
  <text x="427" y="364" font-family="${FONT}" font-size="29" font-weight="400" fill="${ACCENT}"
        textLength="540" lengthAdjust="spacingAndGlyphs">Live preview &#183; code highlighting &#183; export</text>
</svg>`;

// ── Play 고해상도 아이콘 512×512 ──
// 어댑티브 아이콘과 동일: 액센트 배경 + 흰 마크(둥근 모서리는 Play 가 마스킹).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${ACCENT}"/>
  ${placedMark(PAPER, 256, 256, 0.5)}
</svg>`;

await render("feature-graphic.png", feature, 1024, 500);
await render("play-icon-512.png", icon, 512, 512);
console.log("[store-graphics] 완료 →", outDir);
