/* capacitor-bridge.js — Markdown Studio 안드로이드(Capacitor) 네이티브 연동 브리지
 *
 * 정본 HTML(markdown-studio.html)은 한 글자도 고치지 않는다. 이 스크립트만 sync 시
 * </body> 앞에 주입되어, 안드로이드 WebView에서 부족한 기능을 네이티브로 메꾼다.
 *
 * ── 왜 필요한가 ──
 *   웹 앱은 File System Access API(showSaveFilePicker 등)가 없으면 자동으로
 *   폴백한다: 저장/내보내기는 <a download> + blob URL 클릭으로 처리한다.
 *   그런데 안드로이드 WebView는 이 blob 다운로드를 무시(파일이 어디에도 안 생김)한다.
 *   그래서 여기서 <a download> 클릭을 가로채 Capacitor Filesystem 으로 실제 파일을
 *   쓰고, Share 시트를 띄워 사용자가 원하는 위치(파일/드라이브/메일)로 보관하게 한다.
 *
 * ── 브라우저에서는 ──
 *   Capacitor.isNativePlatform()이 false 이므로 이 스크립트는 즉시 종료한다.
 *   즉 www/index.html 을 그냥 브라우저로 열면 원본과 100% 동일하게 동작한다.
 */
(function () {
  "use strict";

  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== "function" || !Cap.isNativePlatform()) {
    return; // 브라우저(비-네이티브): 아무것도 하지 않음
  }

  var Plugins = Cap.Plugins || {};
  var Filesystem = Plugins.Filesystem;
  var Share = Plugins.Share;

  var DIR = "MarkdownStudio"; // 저장 하위 폴더

  /* ── 가벼운 토스트(앱 내부 toast()는 스크립트 스코프라 접근 불가) ── */
  function toast(msg) {
    try {
      var el = document.createElement("div");
      el.textContent = msg;
      el.style.cssText =
        "position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));" +
        "transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;" +
        "border-radius:10px;font:14px/1.4 -apple-system,system-ui,sans-serif;z-index:2147483647;" +
        "max-width:80vw;box-shadow:0 6px 24px rgba(0,0,0,.28);opacity:0;transition:opacity .18s";
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.style.opacity = "1"; });
      setTimeout(function () {
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); }, 220);
      }, 2200);
    } catch (_) {}
  }

  /* ── blob:/data: URL → 텍스트 (이 앱의 저장·내보내기 페이로드는 모두 UTF-8 텍스트) ── */
  function urlToText(url) {
    return fetch(url).then(function (r) { return r.text(); });
  }

  function ensureMdExt(name) {
    return /\.[a-z0-9]+$/i.test(name) ? name : name + ".md";
  }

  /* ── 네이티브 저장: Documents/MarkdownStudio/<name> 에 쓰고 Share 시트를 연다 ── */
  function nativeSave(url, filename) {
    if (!Filesystem) { toast("저장 플러그인을 찾을 수 없습니다."); return; }
    var name = ensureMdExt(filename || "document.md");
    urlToText(url)
      .then(function (text) {
        return writeInto("DOCUMENTS", name, text).catch(function () {
          // Documents 쓰기가 막히면(기기/버전 차이) 캐시로 폴백
          return writeInto("CACHE", name, text);
        });
      })
      .then(function (res) {
        toast("저장됨 · " + name);
        if (Share && res && res.uri) {
          Share.share({
            title: name,
            text: name,
            url: res.uri,
            dialogTitle: "저장 / 공유",
          }).catch(function () { /* 사용자가 공유 취소 — 무시 */ });
        }
      })
      .catch(function (e) {
        toast("저장 실패: " + (e && e.message ? e.message : e));
      });
  }

  function writeInto(directory, name, text) {
    return Filesystem.writeFile({
      path: DIR + "/" + name,
      data: text,
      directory: directory,   // "DOCUMENTS" | "CACHE"
      encoding: "utf8",
      recursive: true,
    });
  }

  /* ── <a download> 클릭 가로채기 ──
     legacySave(.md 저장)·downloadBlob(HTML 내보내기)이 모두 이 경로를 탄다.
     download 속성이 있고 href 가 blob:/data: 인 클릭만 네이티브로 넘긴다. */
  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      var dl = this.getAttribute("download");
      var href = this.href || "";
      if (dl != null && (/^blob:/i.test(href) || /^data:/i.test(href))) {
        nativeSave(href, dl || this.getAttribute("download") || "document.md");
        return; // 기본 다운로드(무시됨) 대신 네이티브 저장으로 대체
      }
    } catch (_) {}
    return origClick.apply(this, arguments);
  };

  /* ── PDF 내보내기 안내 ──
     웹 앱의 PDF 내보내기는 window.print() 에 의존하는데, 안드로이드 WebView 에는
     인쇄 대화상자가 없어 조용히 실패한다. 오해를 막기 위해 안내 토스트로 대체한다.
     (HTML 로 내보낸 뒤 공유 시트의 '인쇄'/'PDF로 저장'을 쓰면 된다.) */
  var origPrint = window.print;
  window.print = function () {
    toast("PDF는 ‘HTML로 내보내기’ 후 공유 시트의 인쇄/PDF 저장을 이용하세요.");
    // 필요 시 원래 동작도 시도(대개 no-op)
    try { if (typeof origPrint === "function") origPrint.call(window); } catch (_) {}
  };

  /* ── 하드웨어 뒤로가기 버튼 ──
     기본 동작은 앱 종료다. 사이드바가 열려 있으면 먼저 닫고, 아니면 앱을 백그라운드로. */
  var App = Plugins.App;
  if (App && App.addListener) {
    App.addListener("backButton", function () {
      // 최근 문서 바텀시트가 열려 있으면 먼저 닫는다.
      var sheet = document.getElementById("mSheet");
      if (sheet && sheet.classList.contains("open")) {
        sheet.classList.remove("open");
        sheet.setAttribute("aria-hidden", "true");
        return;
      }
      App.minimizeApp ? App.minimizeApp() : App.exitApp && App.exitApp();
    });
  }

  console.log("[capacitor-bridge] native integration active");
})();
