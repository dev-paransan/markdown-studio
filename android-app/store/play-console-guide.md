# Google Play Console 등록 절차 — Markdown Studio

이 앱(`com.markdownstudio.app`, 게시자 **PARANSAN**)을 Google Play에 올리기 위한 단계별 안내입니다.
준비된 산출물은 모두 `android-app/store/` 및 빌드 출력 폴더에 있습니다.

> ⚠️ Play Console UI 라벨은 수시로 바뀝니다. 아래 항목명이 화면과 약간 다를 수 있으니 "의미"로 찾으세요.

---

## 0. 준비물 체크리스트

| 항목 | 값 / 위치 | 상태 |
|---|---|---|
| 서명된 AAB | `android-app/android/app/build/outputs/bundle/release/app-release.aab` (현재 빌드: versionCode 4 / versionName 1.1.2, targetSdk 36, 서명 `O=PARANSAN`) | ✅ |
| 개인정보처리방침 URL | https://markdown-studio-privacy.vercel.app | ✅ |
| 앱 이름 / 짧은 설명 / 전체 설명 | `store/listing-en.md` | ✅ |
| 피처 그래픽 1024×500 | `store/feature-graphic.png` | ✅ |
| 고해상도 아이콘 512×512 | `store/play-icon-512.png` | ✅ |
| 폰 스크린샷 (최소 2장) | 직접 캡처 필요 (실기기/Android Studio) | ⬜ |
| 업로드 키스토어 백업 | `android-app/keystore/mds-prod-paransan.jks` + 비밀번호 (오프라인 2곳) | ⬜ 꼭 백업 |
| 개발자 계정 등록비 | US$25 (1회) | ⬜ |

---

## 1. 개발자 계정 등록 (최초 1회)

1. https://play.google.com/console 접속 → `dev.paransan@gmail.com`으로 로그인.
2. **개인(Personal)** 또는 **조직(Organization)** 계정 선택.
   - PARANSAN이 사업자 등록된 조직이면 Organization(D-U-N-S 번호 필요할 수 있음), 아니면 Personal.
3. 등록비 **US$25** 결제.
4. 신원 확인(신분증/주소) 완료. 승인까지 수 시간~수 일.

> ⚠️ **신규 개인 계정 규정(중요):** 2023-11-13 이후 만든 **개인** 개발자 계정은
> **프로덕션 출시 전에 "비공개 테스트(Closed testing)"를 최소 12명 테스터가 14일 연속**
> 참여한 뒤에야 프로덕션 액세스를 신청할 수 있습니다. (7번 참고) 조직 계정은 예외.

---

## 2. 앱 만들기

Play Console → **모든 앱 → 앱 만들기(Create app)**

- **앱 이름:** `Markdown Studio`
- **기본 언어:** English (United States) — 앱이 영문이므로. (한국어 등록정보는 나중에 추가 가능)
- **앱 or 게임:** App
- **무료 or 유료:** Free (되돌릴 수 없음 주의)
- 개발자 프로그램 정책 · 미국 수출법 동의 체크 → 만들기.

> 패키지명 `com.markdownstudio.app`은 첫 AAB 업로드 시 자동 고정됩니다(이후 변경 불가).

---

## 3. 앱 설정 — "앱 콘텐츠(App content)" / 정책

좌측 **정책 및 프로그램 → 앱 콘텐츠**에서 아래를 모두 채웁니다(대시보드가 하나씩 안내).

### 3-1. 개인정보처리방침
- URL: **https://markdown-studio-privacy.vercel.app**

### 3-2. 앱 액세스 권한(App access)
- "모든 기능이 제한 없이 제공됨(All functionality is available without special access)" 선택.
  (로그인·계정이 없으므로.)

### 3-3. 광고(Ads)
- "앱에 광고 없음(No, my app does not contain ads)" 선택.

### 3-4. 콘텐츠 등급(Content rating)
- 설문 시작 → 카테고리 **유틸리티/생산성/커뮤니케이션** 계열 선택.
- 폭력·성적·욕설·약물·도박·사용자간 공유: 전부 **아니요**.
- 제출 → 예상 등급 **전체이용가(Everyone / PEGI 3)**.

### 3-5. 타겟층 및 콘텐츠(Target audience)
- 대상 연령: 13세 이상(또는 전체) 선택. 아동 대상 아님 → "아니요".

### 3-6. 데이터 보안(Data safety) — `store/listing-en.md` 기준
- "이 앱이 필수 사용자 데이터를 수집/공유합니까?" → **아니요(No)**
- 결과: **데이터 미수집 · 미공유**로 표기.
- 삭제 요청 경로: 해당 없음(수집 데이터 없음). 모든 데이터는 기기 로컬.
- (인터넷 권한은 사용자가 문서에 넣은 이미지 URL을 내보내기 때 가져오는 용도이며, 개인정보 수집이 아님.)

### 3-7. 기타(정부 앱·금융·건강 등)
- 전부 해당 없음으로 표시.

---

## 4. 스토어 등록정보(Store listing)

좌측 **성장 → 스토어 등록정보 → 기본 스토어 등록정보(Main store listing)**
(문구 원문: `store/listing-en.md`)

- **앱 이름:** `Markdown Studio`
- **짧은 설명(80자):** `Private, offline Markdown editor — live preview, code highlighting & export.`
- **전체 설명:** `listing-en.md`의 Full description 블록 복사.
- **앱 아이콘:** `store/play-icon-512.png` (512×512)
- **그래픽 이미지(피처):** `store/feature-graphic.png` (1024×500)
- **휴대전화 스크린샷:** 최소 2장 업로드(아래 4-1).
- **앱 카테고리:** Productivity, **태그:** Markdown / Text editor / Notes
- **연락처 이메일:** dev.paransan@gmail.com
- (선택) 웹사이트: 개인정보처리방침과 같은 도메인 사용 가능.

### 4-1. 폰 스크린샷 캡처 방법 (택1)
- **Android Studio 에뮬레이터:** 앱 실행 → 우측 툴바 카메라(Screenshot) 버튼. (adb 탭 주입이 아니라 실제 조작이므로 화면 전환이 잘 됩니다.)
- **실기기:** APK(`app-release.apk`) 설치 후 원하는 화면에서 캡처.
- 권장 샷: ① 편집기+미리보기, ② 코드 하이라이트 블록, ③ 문법 가이드(정보 카드), ④ 내보내기 메뉴.
- 규격: 16:9 또는 9:16, 최소 변 320px 이상, PNG/JPG.

---

## 5. 릴리스 업로드 (AAB)

### 5-1. Play 앱 서명(App Signing) — 최초 업로드 시
- 첫 릴리스 업로드 시 Play가 **앱 서명 키를 Google이 관리**하도록 등록합니다.
- 지금 쓰는 `mds-prod-paransan.jks`는 **업로드 키**가 됩니다(Play가 재서명).
- ⚠️ 이 업로드 키(.jks)와 비밀번호를 잃으면 안 되지만, 분실 시 업로드 키는 **재설정 가능**
  (앱 서명 키는 Google이 보관하므로 앱은 계속 업데이트 가능). 그래도 **반드시 백업**하세요.

### 5-2. 트랙 선택
- 좌측 **테스트 → 비공개 테스트(Closed testing)** 트랙을 먼저 사용(신규 개인 계정 요건).
  - "새 릴리스 만들기(Create new release)" → `app-release.aab` 업로드.
  - 릴리스 이름: `1.0 (1)`, 출시 노트(영문) 간단히 작성.
  - **테스터 목록** 생성: 이메일 12개 이상(지인 계정 등) 추가 → 옵트인 링크 공유.
- 조직 계정이거나 요건을 이미 충족했다면 **프로덕션(Production)** 트랙으로 바로 진행 가능.

### 5-3. 검토 후 출시
- "검토(Review release)" → 경고 확인 → "출시 시작(Start rollout)".
- targetSdk 36(Android 16)이라 SDK 관련 차단 경고는 없어야 합니다(이미 반영).
  Play 는 2026-08-31 부터 targetSdk 36 미만 앱의 **업데이트 자체를 막습니다**.

---

## 6. 게시 전 최종 점검(대시보드가 요구하는 항목)

- [ ] 앱 콘텐츠(3번) 전 항목 완료 표시
- [ ] 스토어 등록정보(4번) 필수 이미지·문구 완료
- [ ] 국가/지역 선택(전 세계 또는 원하는 국가)
- [ ] 데이터 보안·콘텐츠 등급 제출 완료
- [ ] 첫 릴리스(AAB) 업로드 및 검토 통과

---

## 7. 신규 개인 계정: 비공개 테스트 → 프로덕션

2023-11-13 이후 개인 계정은:
1. **비공개 테스트 트랙**에 릴리스.
2. **12명 이상**의 테스터가 옵트인하고 **14일 연속** 테스트 참여.
3. 이후 Play Console에 **프로덕션 액세스 신청** 버튼 등장 → 신청·승인.
4. 승인되면 프로덕션 트랙으로 승격 후 단계적 출시(rollout %).

> 테스터는 실제 사용자가 아니어도 되지만, 계정이 옵트인 링크로 참여하고 앱을 설치·유지해야 14일 카운트가 진행됩니다.

---

## 8. 심사 & 게시 후

- 심사: 보통 며칠 ~ 최대 2주. 반려 시 사유에 맞춰 수정 후 재제출.
- **업데이트 배포 시:** `android/app/build.gradle`의 `versionCode`를 **+1**(예: 2), `versionName` 갱신
  → `npm run build:release` → 새 AAB 업로드. (versionCode 중복 업로드는 거부됨.)
- **키 분실 절대 금지:** `mds-prod-paransan.jks` + 비밀번호를 오프라인 안전 보관.

---

## 부록 A. 이 앱에 바로 넣을 값 요약

```
앱 이름            : Markdown Studio
패키지명           : com.markdownstudio.app
기본 언어          : English (United States)
카테고리           : Productivity
연락처 이메일       : dev.paransan@gmail.com
개인정보처리방침    : https://markdown-studio-privacy.vercel.app
광고               : 없음
데이터 수집        : 없음 (Data safety: No data collected)
콘텐츠 등급        : 전체이용가(Everyone)
버전               : versionCode 1 / versionName 1.0
AAB                : android-app/android/app/build/outputs/bundle/release/app-release.aab
```

## 부록 B. 참고 링크
- Play Console: https://play.google.com/console
- 앱 서명: https://support.google.com/googleplay/android-developer/answer/9842756
- 데이터 보안 양식: https://support.google.com/googleplay/android-developer/answer/10787469
- 타겟 API 요구사항: https://developer.android.com/google/play/requirements/target-sdk
