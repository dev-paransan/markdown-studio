// make-assets.mjs — 앱 아이콘/스플래시 소스 PNG 를 생성한다.
//
// 디자이너 원본 이미지가 없으므로, 앱 브랜드 색(잉크 #16202b · 종이 #fbfbf8 ·
// 액센트 틸그린 #2e7d6e)에 맞춰 마크다운 마크("M▾")를 SVG 로 그리고 sharp 로
// 래스터화해 @capacitor/assets 가 요구하는 파일들을 만든다.
//   assets/icon-only.png       1024²  액센트 배경 + 흰 마크(레거시 정사각 아이콘)
//   assets/icon-background.png 1024²  액센트 단색(어댑티브 배경)
//   assets/icon-foreground.png 1024²  흰 마크(투명 배경, 어댑티브 전경 · 세이프존 내)
//   assets/splash.png          2732²  종이 배경 + 액센트 마크(라이트 스플래시)
//   assets/splash-dark.png     2732²  잉크 배경 + 종이 마크(다크 스플래시)
// 이후 `npx capacitor-assets generate --android` 가 이 소스들로 실제 리소스를 만든다.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp"); // @capacitor/assets 와 함께 설치됨

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "..", "assets");
mkdirSync(outDir, { recursive: true });

const INK = "#16202b";
const PAPER = "#fbfbf8";
const ACCENT = "#2e7d6e";

// 1024 좌표계에 그린 마크다운 마크("M" + 아래 화살표). stroke 색만 바꿔 재사용.
function mark(color, sw = 66) {
  return `
    <g fill="none" stroke="${color}" stroke-width="${sw}"
       stroke-linecap="round" stroke-linejoin="round">
      <path d="M 300 664 L 300 360 L 402 472 L 504 360 L 504 664"/>
      <path d="M 656 360 L 656 590"/>
    </g>
    <path d="M 596 536 L 656 612 L 716 536 Z" fill="${color}"/>`;
}

function svg({ size = 1024, bg = "none", markColor, markScale = 1, radius = 0 }) {
  // markScale·중심 정렬: 1024 마크를 size 캔버스 중앙에 배치
  const s = (size / 1024) * markScale;
  const tx = (size - 1024 * s) / 2;
  const ty = (size - 1024 * s) / 2;
  const bgRect =
    bg === "none"
      ? ""
      : `<rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${bg}"/>`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
       ${bgRect}
       <g transform="translate(${tx} ${ty}) scale(${s})">${mark(markColor)}</g>
     </svg>`
  );
}

async function png(name, buf) {
  const p = join(outDir, name);
  await sharp(buf).png().toFile(p);
  console.log("[make-assets]  " + name);
}

const tasks = [
  ["icon-background.png", svg({ size: 1024, bg: ACCENT, markColor: ACCENT })], // 단색(전경 없음)
  ["icon-foreground.png", svg({ size: 1024, bg: "none", markColor: PAPER, markScale: 0.72 })],
  ["icon-only.png", svg({ size: 1024, bg: ACCENT, markColor: PAPER })],
  ["splash.png", svg({ size: 2732, bg: PAPER, markColor: ACCENT, markScale: 0.42 })],
  ["splash-dark.png", svg({ size: 2732, bg: INK, markColor: PAPER, markScale: 0.42 })],
];

console.log("[make-assets] 아이콘/스플래시 소스 생성 →", outDir);
for (const [name, buf] of tasks) await png(name, buf);
console.log("[make-assets] 완료. 다음: npx capacitor-assets generate --android");
