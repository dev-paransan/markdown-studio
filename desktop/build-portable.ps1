# build-portable.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Windows Smart App Control(SAC) 대응 포터블 빌드.
#
# 배경: electron-packager / electron-builder 는 원본 electron.exe 를 rcedit 로
# 재기록(아이콘·버전)하면서 바이트를 바꾼다. 그 결과 Microsoft ISG 평판 해시가
# 달라져 SAC 가 "미확인 앱"으로 차단한다.
#
# 이 스크립트는 원본 electron.exe 를 "바이트 그대로" rename 만 해서 쓰므로
# ISG 평판이 유지되어 SAC 를 통과한다. 대신 커스텀 아이콘/버전 정보는 없다
# (제대로 브랜딩하려면 신뢰된 인증서로 코드 서명해야 함 — README 참고).
#
# 사용법:  desktop 폴더에서  powershell -ExecutionPolicy Bypass -File build-portable.ps1
# 산출물:  desktop\dist\MarkdownStudio-portable\Markdown Studio.exe
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcDist = Join-Path $here "node_modules\electron\dist"
$html    = Join-Path $here "..\markdown-studio.html"
$mermaid = Join-Path $here "..\mermaid.min.js"
$dst     = Join-Path $here "dist\MarkdownStudio-portable"

if (-not (Test-Path $srcDist)) { throw "electron dist 없음. 먼저 'npm install' 실행: $srcDist" }
if (-not (Test-Path $html))    { throw "markdown-studio.html 없음: $html" }

Write-Host "[1/4] 이전 산출물 정리..."
if (Test-Path $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }

Write-Host "[2/4] Electron 런타임 복사..."
Copy-Item -LiteralPath $srcDist -Destination $dst -Recurse -Force

Write-Host "[3/4] 앱 리소스 구성..."
Remove-Item -LiteralPath (Join-Path $dst "resources\default_app.asar") -Force -ErrorAction SilentlyContinue
$appDir = Join-Path $dst "resources\app"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item (Join-Path $here "main.js")            (Join-Path $appDir "main.js") -Force
Copy-Item $html                                   (Join-Path $appDir "markdown-studio.html") -Force
if (Test-Path $mermaid) {                          # mermaid 다이어그램 렌더용(HTML 옆에 동봉 → app:// same-origin 로드)
  Copy-Item $mermaid                              (Join-Path $appDir "mermaid.min.js") -Force
}
'{ "name": "markdown-studio", "version": "1.1.0", "main": "main.js" }' |
  Out-File -FilePath (Join-Path $appDir "package.json") -Encoding utf8

Write-Host "[4/4] 서명 보존 exe 생성(rename)..."
$exe = Join-Path $dst "Markdown Studio.exe"
Copy-Item (Join-Path $dst "electron.exe") $exe -Force
Remove-Item -LiteralPath (Join-Path $dst "electron.exe") -Force

$h1 = (Get-FileHash (Join-Path $srcDist "electron.exe") -Algorithm SHA256).Hash
$h2 = (Get-FileHash $exe -Algorithm SHA256).Hash
if ($h1 -ne $h2) { throw "무결성 실패: rename 된 exe 가 원본과 다릅니다(서명/평판 깨짐)." }

Write-Host "[+] 불필요한 언어 locale 정리(en-US·ko 만 유지)..."
$loc = Join-Path $dst "locales"
if (Test-Path $loc) {
  $keep = @("en-US.pak", "ko.pak")   # 그 밖은 Chromium 이 en-US 로 폴백하므로 안전하게 제거
  Get-ChildItem $loc -File | Where-Object { $keep -notcontains $_.Name } | Remove-Item -Force
}

$size = (Get-ChildItem $dst -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ""
Write-Host ("완료. SAC 통과 포터블 빌드 (총 {0:N0} MB):" -f ($size/1MB)) -ForegroundColor Green
Write-Host "  $exe"
Write-Host "이 폴더 전체를 함께 유지하고, .md 연결 프로그램을 위 exe 로 지정하십시오."
