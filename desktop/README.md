# Markdown Studio — Windows 포터블 데스크톱 빌드

`markdown-studio.html`(단일 자체완결형 HTML 에디터)을 Electron으로 감싸
**설치 없이 실행 가능한** Windows 포터블 앱으로 패키징한다.

원본 HTML은 수정하지 않는다. 이 폴더(`desktop/`)의 래퍼만 있으면 된다.

## 왜 Electron 인가

앱은 File System Access API(`showOpenFilePicker`/`showSaveFilePicker`)와
IndexedDB(최근 파일)를 사용한다. 이 API들은 **보안 컨텍스트**에서만 동작하므로,
`main.js`는 HTML을 `file://` 가 아니라 커스텀 권한 스킴 **`app://`**(standard + secure)로
서빙한다. 그래서 데스크톱 앱에서도 웹 버전과 동일하게 열기/저장/최근 파일이 작동한다.

## 실행 결과물

`npm run pack` 을 실행하면:

```
dist/Markdown Studio-win32-x64/      ← 이 폴더 전체가 포터블 앱
  Markdown Studio.exe                ← 더블클릭해서 실행
  resources/markdown-studio.html     ← 원본 HTML(그대로 복사됨)
  resources/app.asar                 ← 래퍼 로직(main.js)
  ...(Electron 런타임 파일)
dist/MarkdownStudio-Portable-win-x64.zip  ← 배포용 압축본
```

폴더째 USB/다른 PC에 복사한 뒤 `Markdown Studio.exe` 를 실행하면 된다.
관리자 권한·설치·인터넷 불필요.

## 명령어

```bash
npm install        # 의존성 설치 (Electron 런타임 포함, 최초 1회)
npm start          # 개발 실행 — 리포지토리 루트의 원본 HTML을 바로 로드
npm test           # 헤드리스 기능 테스트(렌더/하이라이트/FSA/IndexedDB/내보내기 등 22개 검증)
npm run pack       # 포터블 폴더 + exe 생성 → dist/ (커스텀 아이콘, 단 SAC 차단 가능 — 아래 참고)
npm run pack:portable  # ★SAC 통과 포터블 빌드 → dist/MarkdownStudio-portable/ (권장)
npm run dist:installer # ★설치형 Windows 인스톨러(NSIS) 생성 → dist/MarkdownStudio-Setup-<version>.exe
```

## 설치형 인스톨러(Setup.exe) 만들기

`npm run dist:installer` 는 electron-builder 의 **NSIS** 타깃으로 진짜 설치 프로그램을 만든다.
산출물: `dist/MarkdownStudio-Setup-<version>.exe`

동작(package.json `build.nsis` 설정):
- 설치 마법사 표시(`oneClick:false`) + 설치 경로 변경 허용
- 사용자 단위 설치(`perMachine:false` — 관리자 권한 불필요)
- 바탕화면 + 시작 메뉴 바로가기("Markdown Studio") 생성
- 제어판 "프로그램 추가/제거"에 등록되는 **언인스톨러** 포함
- `.md` 파일 연결 등록(읽기전용 뷰어) — `fileAssociations`

### ⚠ 빌드 전제: winCodeSign 심볼릭 링크 문제

NSIS/electron-builder 는 `winCodeSign` 패키지를 캐시에 풀 때 macOS용 `.dylib` **심볼릭 링크**를
생성하려 한다. Windows에서 **개발자 모드(또는 관리자 권한)가 꺼져 있으면** 이 심링크 생성이 실패해
빌드가 중단된다(`Cannot create symbolic link ...`).

해결 중 하나:
1. **설정 → 개발자용 → "개발자 모드" 켜기** 후 `npm run dist:installer` 재실행(권장, 근본 해결).
2. 캐시를 수동으로 미리 풀어 두기 — 심링크 2개(macOS 전용, Windows 빌드엔 불필요)만 실패하고
   나머지는 정상 추출되므로 그대로 두면 electron-builder가 캐시로 인식해 통과한다:
   ```powershell
   $cache = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   $7za   = "node_modules\7zip-bin\win\x64\7za.exe"
   # 캐시에 받아진 <난수>.7z 중 하나를 winCodeSign-2.6.0 폴더로 추출(심링크 에러는 무시)
   & $7za x -bd (Get-ChildItem $cache -Filter *.7z | Select -First 1).FullName "-o$cache\winCodeSign-2.6.0"
   ```

### ⚠ 코드 서명 / SAC

서명 없이 빌드하면 인스톨러·내부 exe가 **서명되지 않아**(`signing is skipped`) SmartScreen이
"알 수 없는 게시자" 경고를 띄우고, Smart App Control(SAC)이 켜진 PC에서는 **실행이 차단된다**.

- **SAC 통과 = 반드시 "신뢰된 CA(가능하면 EV) 인증서" 서명이 필요하다.** SAC는 로컬 신뢰
  저장소가 아니라 Microsoft ISG 클라우드 평판을 보므로, **자체 서명(self-signed) 인증서로는
  SAC를 통과할 수 없다**(로컬에 루트를 신뢰시켜도 소용없음).
- 자체 서명은 "SAC 꺼진 PC"에서 SmartScreen 경고를 "추가 정보 → 실행"으로 넘겨 테스트하는
  용도로만 쓸모가 있다.
- 서명 없이 SAC 통과 즉시 실행이 필요하면 `npm run pack:portable`(원본 electron.exe 바이트
  보존 → ISG 평판 유지) 를 쓴다.

#### 정식 서명 빌드 방법 (CA/EV pfx 보유 시)

`package.json` 을 수정할 필요 없다. 서명 재료를 **환경변수**로 넘기면 electron-builder 가
빌드 중 자동으로 내부 exe·언인스톨러·Setup.exe 를 모두 서명한다(타임스탬프 포함):

```powershell
$env:CSC_LINK = "C:\path\to\your-codesign.pfx"   # pfx/p12 파일 경로 (또는 base64 문자열)
$env:CSC_KEY_PASSWORD = "인증서비밀번호"
npm run dist:installer
```

빌드 후 서명 확인:

```powershell
Get-AuthenticodeSignature "dist\MarkdownStudio-Setup-<version>.exe" |
  Select-Object Status, @{n='Signer';e={$_.SignerCertificate.Subject}}
# 정식 CA 인증서면 Status = Valid.
# 자체 서명이면 루트 미신뢰로 Status = UnknownError (서명 자체는 박혀 있음).
```

> 검증 이력: 위 환경변수 방식으로 자체 서명 pfx 를 넘겨 Setup.exe·내부 exe·언인스톨러가
> 모두 서명(DigiCert 타임스탬프 포함)되는 것을 확인했다. 정식 CA/EV pfx 로 교체만 하면
> 동일 절차로 SAC·SmartScreen 정식 통과 빌드가 나온다.
> EV 인증서는 보통 HSM/USB 토큰에 담겨 나오므로 이때는 `CSC_LINK` 대신
> `win.signtoolOptions.certificateSubjectName`(설치된 인증서 주체명)으로 지정한다.

#### 테스트용 인증서를 OpenSSL 로 만들기 (자체 서명)

정식 CA 인증서가 없을 때, OpenSSL 로 Code Signing EKU 를 가진 pfx 를 만들어 서명 파이프라인을
검증할 수 있다(SAC 는 통과 못 하지만, SAC 꺼진 PC 테스트·서명 흐름 점검용). Git Bash 에서:

```bash
export MSYS_NO_PATHCONV=1   # Git Bash 가 /CN=... 을 경로로 바꾸는 것 방지
openssl req -x509 -newkey rsa:3072 -keyout mds-key.pem -out mds-cert.pem -days 1095 -nodes \
  -subj "/CN=Markdown Studio (paransan)/O=paransan/C=KR" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning"
openssl pkcs12 -export -out mds-openssl.pfx -inkey mds-key.pem -in mds-cert.pem \
  -passout pass:<암호>
```

그런 다음 위 "정식 서명 빌드 방법"의 `CSC_LINK` 에 이 pfx 경로를, `CSC_KEY_PASSWORD` 에 암호를
넣고 `npm run dist:installer` 를 실행하면 electron-builder 가 signtool 로 전부 서명한다.

SignTool 로 직접 서명/검증도 가능하다(Windows SDK 의 `signtool.exe`):

```powershell
# 개별 파일 직접 서명 (SHA256 + RFC3161 타임스탬프)
signtool sign /f mds-openssl.pfx /p <암호> /fd SHA256 `
  /tr http://timestamp.digicert.com /td SHA256 "dist\MarkdownStudio-Setup-<version>.exe"
# 검증
signtool verify /pa /v "dist\MarkdownStudio-Setup-<version>.exe"
```

자체 서명이면 `verify` 가 "chain ... terminated in a root"(루트 미신뢰) 로 끝난다 — 서명·타임스탬프
자체는 유효하며, 정식 CA 인증서면 이 오류 없이 통과한다.

빌드 후 실제 exe 자체 검증:

```bash
# 패키징된 exe가 부팅·보안컨텍스트·FSA·렌더링까지 되는지 확인
MDS_SELFTEST=1 MDS_SELFTEST_OUT=/경로/out.json "dist/Markdown Studio-win32-x64/Markdown Studio.exe" --selftest
```

## ⚠ Smart App Control(SAC) 차단 대응

Windows 11의 **Smart App Control**이 켜져 있으면 `npm run pack`으로 만든 `Markdown Studio.exe`가
**"안전하지 않을 수 있는 앱"으로 차단**된다. 원인은 electron-packager가 원본 `electron.exe`를
rcedit로 재기록(아이콘·버전)하면서 바이트가 바뀌어, Microsoft ISG 클라우드 평판 해시가
사라지기 때문이다(원본 electron.exe는 평판이 있어 통과한다).

**해결(무료·즉시): `npm run pack:portable`**
- 원본 `electron.exe`를 바이트 그대로 rename 만 하므로 ISG 평판이 유지되어 SAC를 통과한다.
- 산출물: `dist/MarkdownStudio-portable/Markdown Studio.exe` (이 폴더 전체를 함께 유지).
- 트레이드오프: 커스텀 아이콘/버전 정보는 없다(일반 Electron 아이콘). 기능은 동일하다.
- SAC를 우회하는 것이 아니라, 신뢰된 바이너리를 그대로 써서 SAC가 정상적으로 통과시키는 방식이다.

**제대로 브랜딩해서 배포하려면: 코드 서명**
- 신뢰된 인증서(가능하면 EV)로 `Markdown Studio.exe`를 서명하면 커스텀 아이콘을 유지하면서도
  SAC를 통과한다. 사내 코드서명 인증서가 있으면 `signtool` 또는 electron-builder의
  `win.certificateFile`/`certificateSubjectName` 설정으로 서명 단계를 붙일 수 있다.

### .md 파일 연결(더블클릭)
- `main.js`가 실행 인자로 넘어온 `.md` 경로를 읽어 **읽기전용 뷰어**로 연다.
  단일 인스턴스 락으로, 앱이 이미 떠 있으면 그 창에 파일을 전달한다.
- 파일 연결은 위 `pack:portable` 산출물의 exe로 지정한다:
  `dist\MarkdownStudio-portable\Markdown Studio.exe`
- 편집 모드로 열리게 하려면 `main.js`의 `openFileInWindow` 안 `readonly:true`를 `false`로 바꾼 뒤 재빌드.

## 단일 .exe(자체압축 실행파일)로 만들고 싶다면

`npm run dist`(electron-builder portable 타깃)는 하나의 self-extracting `.exe`를 만든다.
다만 electron-builder가 코드서명용 `winCodeSign` 패키지를 풀 때 macOS 심볼릭 링크를
생성하려 하는데, **Windows에서 개발자 모드(또는 관리자 권한)가 꺼져 있으면 실패**한다.
필요하면 설정 → 개발자용 → "개발자 모드"를 켠 뒤 `npm run dist` 를 실행한다.

기본 산출물인 포터블 폴더(`npm run pack`)는 이 제약이 없어 더 안정적이다.

## 구조

| 파일 | 역할 |
|---|---|
| `main.js` | Electron 메인 프로세스. `app://` 스킴 등록·서빙, 창 생성, 파일 연결(더블클릭) 오픈, 우클릭 편집 컨텍스트 메뉴(복사/붙여넣기 등), 보안 하드닝(sandbox·권한 화이트리스트·네비게이션 차단), 셀프테스트 스위치 |
| `package.json` | 의존성·빌드 스크립트(`pack`/`pack:portable`/`dist`) |
| `build-portable.ps1` | SAC 통과용 서명 보존 포터블 빌드 생성 스크립트(`npm run pack:portable`) |
| `icon.ico` | 앱/실행파일 아이콘(256~16px) |
| `test-harness.js` | 개발용 헤드리스 기능 테스트(원본 HTML 대상) |
| `summarize.js` | 테스트 결과 요약 출력 |
