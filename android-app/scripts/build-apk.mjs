// build-apk.mjs — 커맨드라인에서 디버그 APK 를 빌드한다.
//
// 이 PC 에는 java 가 PATH 에도 JAVA_HOME 에도 없고(기본 JDK 는 Android Studio 번들
// JBR 25), 프로젝트의 Gradle 8.13 은 Java 23 까지만 지원한다(AGP 8.11 이 요구하는
// JDK 도 17 이다). 그래서 여기서 JDK 17 을 자동으로 찾아 JAVA_HOME 으로 넣어
// gradlew 를 실행한다.
//   1) 먼저 정본 HTML 을 www/ 로 다시 동기화(sync-web)
//   2) JDK 17 을 찾아 JAVA_HOME 설정
//   3) android/gradlew.bat assembleDebug 실행
//
// JDK 17 경로가 다르면 아래 JDK17_CANDIDATES 를 고치거나, 환경변수 JAVA17_HOME 을
// 지정하면 그 값을 우선 사용한다.

import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(__dirname, "..");
const androidDir = join(projectDir, "android");

function findJdk17() {
  if (process.env.JAVA17_HOME && existsSync(join(process.env.JAVA17_HOME, "bin", "java.exe"))) {
    return process.env.JAVA17_HOME;
  }
  const roots = [
    "C:/Program Files/Eclipse Adoptium",
    "C:/Program Files/Java",
    "C:/Program Files/Microsoft",
    "C:/Program Files/Zulu",
    "C:/Program Files/Amazon Corretto",
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (/(^|[-_])(jdk-?17|zulu17|corretto-17)/i.test(name)) {
        const home = join(root, name);
        if (existsSync(join(home, "bin", "java.exe"))) return home;
      }
    }
  }
  return null;
}

// 1) 웹 자산 동기화 (정본 HTML → www/) 후 Capacitor 로 네이티브 자산에 복사
console.log("[build-apk] 웹 자산 동기화…");
let r = spawnSync(process.execPath, [join(__dirname, "sync-web.mjs")], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status || 1);

// www/ → android/app/src/main/assets/public. 이 단계를 빼먹으면 APK 에 옛 자산이 들어간다.
console.log("[build-apk] cap copy android…");
r = spawnSync(`npx cap copy android`, {
  cwd: projectDir,
  stdio: "inherit",
  shell: true,
});
if (r.status !== 0) process.exit(r.status || 1);

// 2) JDK 17 탐색
const jdk = findJdk17();
if (!jdk) {
  console.error("[build-apk] JDK 17 을 찾지 못했습니다. Temurin 17 설치:");
  console.error("            winget install --id EclipseAdoptium.Temurin.17.JDK -e");
  console.error("            또는 JAVA17_HOME 환경변수로 경로를 지정하세요.");
  process.exit(1);
}
console.log(`[build-apk] JDK 17: ${jdk}`);

// 3) gradlew <tasks> — 기본은 assembleDebug. 인자로 다른 태스크 지정 가능.
//    예) node scripts/build-apk.mjs assembleRelease bundleRelease
const tasks = process.argv.slice(2).filter(Boolean);
const gradleTasks = tasks.length ? tasks.join(" ") : "assembleDebug";
const gradlew = join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
console.log(`[build-apk] gradlew ${gradleTasks} …`);
// Windows 의 .bat 은 shell 을 통해야 실행된다(shell:true). 인자는 명령 문자열에
// 직접 이어 붙인다(shell:true + args 배열 조합의 Node 경고 회피).
r = spawnSync(`"${gradlew}" ${gradleTasks}`, {
  cwd: androidDir,
  stdio: "inherit",
  env: { ...process.env, JAVA_HOME: jdk },
  shell: true,
});
if (r.status !== 0) process.exit(r.status || 1);

console.log("\n[build-apk] 완료 → android/app/build/outputs/ 아래 산출물 확인");
