# Markdown Studio — Android 앱 (Capacitor)

안드로이드 앱 전용 영문판 정본 `../markdown-studio-en.html` 을 **한 글자도 고치지 않고**
안드로이드 네이티브 앱으로 감싼 Capacitor 프로젝트입니다. (데스크톱 정본은 한국어
`../markdown-studio.html`; 앱은 이를 완전 영문화한 별도 파일을 싣는다.) 앱 정본을
수정하면 `npm run sync:web` 한 번으로 최신 내용이 그대로 앱에 반영됩니다.

## 구조

```
android-app/
  package.json            # Capacitor 의존성 + 빌드 스크립트
  capacitor.config.json   # appId, appName, webDir(www)
  scripts/
    sync-web.mjs          # ../markdown-studio-en.html → www/index.html 복사(+브리지 주입)
  www/
    capacitor-bridge.js   # ★ 네이티브 연동 브리지(저장/공유/뒤로가기/PDF 안내)
    index.html            # (생성물) sync:web 이 만든다 — 직접 편집 금지
  android/                # (생성물) `npx cap add android` 후 생성되는 네이티브 프로젝트
```

- **앱 정본은 `../markdown-studio-en.html`(영문판).** `www/index.html` 은 빌드 산출물이라 `.gitignore` 대상입니다.
- `capacitor-bridge.js` 는 **브라우저에서는 아무 동작도 하지 않습니다**(`Capacitor.isNativePlatform()`
  체크). 그래서 `www/index.html` 을 그냥 브라우저로 열어도 원본과 100% 동일하게 동작합니다.

## 왜 브리지가 필요한가

안드로이드 WebView 에는 데스크톱 Chrome 의 File System Access API 가 없습니다. 웹 앱은 이때
자동으로 폴백합니다:

| 기능 | 웹 폴백 | WebView 에서 | 브리지 처리 |
|---|---|---|---|
| 열기 | 숨은 `<input type=file>` | ✅ 정상(안드로이드 파일 선택기) | 그대로 사용 |
| 저장(.md) | `<a download>` + blob | ❌ 조용히 무시됨 | **가로채서 Filesystem 저장 → 공유 시트** |
| HTML 내보내기 | `<a download>` + blob | ❌ 무시됨 | **동일하게 네이티브 저장 → 공유** |
| PDF 내보내기 | `window.print()` | ❌ WebView 에 인쇄창 없음 | 안내 토스트(“HTML로 내보낸 뒤 공유 시트의 인쇄/PDF 저장”) |
| Recents | IndexedDB | ✅ 정상 | 그대로 사용 |

저장 시 `Documents/MarkdownStudio/<파일명>` 에 쓰고 곧바로 **공유 시트**를 띄워, 사용자가
파일 앱·드라이브·메일 등 원하는 곳으로 보낼 수 있게 합니다(별도 저장소 권한 불필요).

## 사전 준비

- **Node.js** — Capacitor CLI 실행용
- **Android Studio + SDK** — 네이티브 빌드·에뮬레이터/기기 실행용.
  `android/local.properties` 에 SDK 경로가 있어야 합니다(이미 설정됨):
  ```
  sdk.dir=C:/Users/gate1/AppData/Local/Android/Sdk
  ```
  ⚠ **Android SDK Platform 36** 이 설치돼 있어야 합니다(compileSdk 36). Android Studio
  *SDK Manager → SDK Platforms → Android 16 (API 36)* 을 체크하거나
  `sdkmanager "platforms;android-36"` 로 설치하세요.
- **JDK 17 (LTS)** — ⚠ 중요. 이 프로젝트의 Gradle 8.13 은 Java 23 까지만 지원하는데,
  이 PC 의 기본 JDK(Android Studio 번들 JBR)는 **25** 라 그대로 빌드하면
  `Unsupported class file major version 69` 로 실패합니다. (AGP 8.11 이 요구하는 JDK 도
  17 이라 17 고정이 그대로 맞습니다.) Temurin 17 을 설치해 두었고,
  빌드 JDK 를 17 로 고정하는 설정이 두 군데 들어가 있습니다:
  - `android/gradle.properties` → `org.gradle.java.home=…/jdk-17…` (Android Studio·CLI 공통)
  - `scripts/build-apk.mjs` → CLI 빌드 시 JDK 17 을 자동 탐색해 `JAVA_HOME` 으로 주입
  JDK 설치(미설치 시):
  ```powershell
  winget install --id EclipseAdoptium.Temurin.17.JDK -e
  ```

## 최초 셋업 (한 번만) — ✅ 이미 완료됨

```bash
cd android-app
npm install                 # Capacitor + 플러그인 설치
npm run sync:web            # 정본 HTML → www/index.html 생성
npx cap add android         # android/ 네이티브 프로젝트 생성
```

## 개발·실행

```bash
npm run sync                # 웹 자산 갱신 + cap sync (플러그인/설정 반영)
npx cap open android        # Android Studio 로 열어서 ▶ 실행 (에뮬레이터/기기)
```

웹 앱(`../markdown-studio.html`)을 고친 뒤에는 **`npm run sync`** 만 다시 돌리면 됩니다.
Android Studio 로 실행할 때는 Studio 가 자체 JDK 로 부팅하고, `org.gradle.java.home`
설정 덕분에 빌드는 JDK 17 로 수행됩니다.

## APK 빌드 (디버그) — ✅ 검증됨

```bash
npm run build:apk
# 결과: android/app/build/outputs/apk/debug/app-debug.apk  (약 3.8MB)
```

`build:apk` 는 ① 웹 자산 재동기화 → ② JDK 17 자동 탐색 → ③ gradlew assembleDebug 를
순서대로 수행하므로, `JAVA_HOME` 을 미리 설정할 필요가 없습니다.

릴리스(서명) 빌드·Play 스토어 배포는 Android Studio 의 *Build > Generate Signed Bundle / APK*
로 진행하세요(키스토어 필요).

## 앱 아이콘 / 스플래시 — ✅ 적용됨

브랜드 색(잉크 `#16202b` · 종이 `#fbfbf8` · 액센트 `#2e7d6e`)에 맞춘 마크다운 마크
("M↓") 아이콘·스플래시가 이미 적용돼 있습니다. 소스 이미지는 `scripts/make-assets.mjs`
가 SVG → PNG 로 생성합니다(별도 디자인 파일 불필요).

아이콘을 다시 만들려면:

```bash
npm run assets
# = node scripts/make-assets.mjs  (assets/*.png 생성)
#   → npx capacitor-assets generate --android  (android/.../res 리소스 74개 생성)
```

디자인을 바꾸려면 `scripts/make-assets.mjs` 의 SVG(마크 path·색)를 수정하거나,
`assets/` 에 직접 만든 `icon-only.png`(1024²)·`splash.png`(2732²) 등을 넣고
`npx capacitor-assets generate --android` 를 실행하세요.

## 릴리스 서명 빌드 — ✅ 파이프라인 구성·검증됨

Play 스토어용 서명된 APK/AAB 를 만드는 파이프라인이 구성돼 있습니다.

```bash
npm run build:release
# → android/app/build/outputs/apk/release/app-release.apk   (서명됨)
#   android/app/build/outputs/bundle/release/app-release.aab (Play 업로드용, 서명됨)
```

- 자격증명은 `keystore.properties`(⚠ `.gitignore` 처리, 커밋 금지)에서 읽습니다.
- 키스토어는 `keystore/mds-release.jks` 입니다.
- `android/app/build.gradle` 의 `signingConfigs.release` 가 이 값을 참조합니다.
  `keystore.properties` 가 없으면 release 빌드는 자동으로 미서명으로 떨어집니다.

> **⚠ 중요 — 실배포 전 확인**
> 현재 키스토어/비밀번호는 **파이프라인 검증용 개발 자격증명**입니다. Play 에 처음
> 올리기 전에 강력한 비밀번호로 재발급하거나 새 업로드 키를 만들고, `mds-release.jks`
> 와 비밀번호를 **반드시 안전하게 백업**하세요. Play 에 한 번 올린 뒤 이 키를 잃으면
> 앱 업데이트가 불가능합니다.

새 키스토어 생성 예:

```powershell
keytool -genkeypair -v -keystore keystore/mds-release.jks -keyalg RSA -keysize 2048 `
  -validity 10000 -alias mds -dname "CN=Markdown Studio, O=..., C=KR"
# 이후 keystore.properties 의 비밀번호/별칭을 맞춰 수정
```

## 타겟 SDK — Android 16 (API 36)

Play 스토어는 **2026-08-31 부터 targetSdk 36(Android 16) 미만인 앱의 업데이트를 막습니다.**
그래서 `compileSdk`/`targetSdk` 를 **36** 으로 올렸습니다(`android/variables.gradle`).
같이 따라온 변경은 다음과 같습니다.

| 항목 | 이전 | 현재 | 이유 |
|---|---|---|---|
| compileSdk / targetSdk | 35 | **36** | Play 의 대상 API 수준 요구사항 |
| Android Gradle Plugin | 8.2.1 | **8.11.1** | API 36 은 AGP 8.11+ 에서만 공식 지원(8.9 까지는 최대 35) |
| Gradle | 8.2.1 | **8.13** | AGP 8.11 의 최소 요구 버전 |
| `android.suppressUnsupportedCompileSdk` | 35 | *(제거)* | AGP 가 36 을 정식 지원하므로 경고 억제가 불필요 |
| versionCode / versionName | 3 / 1.1.1 | **4 / 1.1.2** | 스토어 재업로드용(중복 versionCode 는 거부됨) |

### targetSdk 36 동작 변경 대응

- **Edge-to-edge 강제** — Android 16 에서는 `windowOptOutEdgeToEdgeEnforcement` 가 무시되어
  옵트아웃이 불가능합니다. 그대로 두면 WebView 가 상태표시줄·내비게이션바 밑까지 깔려
  웹 상단바(`#mbar`)와 하단 상태바(`#status`)가 가려집니다.
  → `MainActivity.applyEdgeToEdgeInsets()` 가 콘텐츠 루트에 **시스템바·컷아웃·IME 인셋을
  패딩**으로 적용해 기존 레이아웃을 유지합니다. 패딩 영역은 웹 상단바와 같은 색
  (`@color/mds_system_bar_bg` = `#F1F1EC`)으로 칠해집니다. **IME 인셋까지 포함**하는 이유는
  edge-to-edge 에서 `adjustResize` 가 더 이상 창을 줄여주지 않아(API 30+) 키보드가 편집기를
  덮기 때문입니다. API 30 미만 기기는 예전 동작을 그대로 둡니다.
- **예측형 뒤로가기(predictive back) 기본 ON** — `Activity.onBackPressed()` 가 호출되지 않아
  Capacitor 6 App 플러그인의 `backButton` 리스너(`www/capacitor-bridge.js`)가 죽습니다.
  → `AndroidManifest.xml` 의 `android:enableOnBackInvokedCallback="false"` 로 기존 동작을
  유지합니다(Android 16 에서도 아직 유효한 옵트아웃). Capacitor 를 7/8 로 올려
  `OnBackInvokedCallback` 으로 이전하면 이 플래그를 지울 수 있습니다.
- **대화면 방향·크기 제한 무시** — 이 앱은 `screenOrientation`/`resizableActivity` 를 쓰지
  않고 웹 레이아웃이 반응형이라 별도 대응이 필요 없습니다.

> **Android Studio 버전** — AGP 8.11 을 인식하려면 Studio 도 그만큼 최신이어야 합니다
> (Meerkat/Narwhal 이후). Studio 가 오래돼 "AGP 8.11.1 requires a newer Android Studio" 라고
> 하면 Studio 를 업데이트하거나, CLI(`npm run build:apk` / `npm run build:release`)로 빌드하세요
> — CLI 빌드는 Studio 버전과 무관합니다.

### 업그레이드 후 반드시 확인할 것

이 변경은 **안드로이드 SDK 가 없는 환경에서 작성돼 실제 빌드로 검증하지 못했습니다.**
로컬에서 아래를 꼭 확인하세요.

```bash
cd android-app
npm run build:apk     # Gradle 8.13 최초 실행 시 배포판을 새로 내려받습니다(네트워크 필요)
```

- Android 16(API 36) 기기/에뮬레이터: 상단바가 상태표시줄에 가리지 않는지, 하단 상태바가
  내비게이션바에 가리지 않는지, **키보드를 올렸을 때 편집기가 가려지지 않는지**, 뒤로가기
  (오버레이 닫기 → 앱 최소화)가 예전처럼 동작하는지.
- Android 13~15 기기에서도 같은 화면이 나오는지(회귀 확인).

## 알려진 제약

- **PDF 직접 저장 불가** — WebView 에 인쇄 대화상자가 없습니다. HTML 로 내보낸 뒤 공유
  시트의 “인쇄 → PDF로 저장” 을 사용하세요.
- **상대경로 이미지** — 데스크톱은 폴더 핸들로 같은 폴더 이미지를 읽지만, 모바일에는 폴더
  핸들 개념이 없어 상대경로 이미지는 미리보기에 표시되지 않을 수 있습니다(원격 URL·data URI 는 정상).
