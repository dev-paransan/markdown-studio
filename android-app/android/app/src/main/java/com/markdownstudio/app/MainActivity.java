package com.markdownstudio.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.view.View;
import android.webkit.ValueCallback;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.OnApplyWindowInsetsListener;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * .md/텍스트 파일을 '열기(VIEW)' 또는 '공유(SEND)'로 받으면, 내용을 읽어 WebView 의
 * window.__mdsOpenIncoming({name,text}) 로 넘겨 새 문서로 연다. (정본 markdown-studio.html 이
 * 그 진입점을 정의한다.) 앱이 아직 로드 전이면(콜드 스타트) 함수가 생길 때까지 재시도한다.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyEdgeToEdgeInsets();
        handleFileIntent(getIntent());
    }

    /**
     * targetSdk 36(Android 16)부터는 edge-to-edge 가 강제된다. windowOptOutEdgeToEdgeEnforcement
     * 는 Android 16 에서 무시되므로 앱이 직접 인셋을 처리해야 한다 — 그대로 두면 WebView 가
     * 상태표시줄·내비게이션바 밑까지 깔려 웹 상단바(#mbar)와 하단 상태바(#status)가 가려진다.
     *
     * 콘텐츠 루트(android.R.id.content)에 시스템바·디스플레이 컷아웃·IME 인셋을 패딩으로 주어
     * 예전(fitsSystemWindows) 과 같은 화면을 유지한다. 패딩 영역은 루트 배경색
     * (@color/mds_system_bar_bg = 웹 상단바와 같은 #F1F1EC)으로 칠해진다.
     *
     * IME 를 인셋에 포함하는 이유: decorFitsSystemWindows=false 에서는 adjustResize 가 창을
     * 줄여주지 않으므로(API 30+) 키보드가 편집기를 덮는다. ime() 인셋을 패딩에 더해 예전
     * adjustResize 와 같은 동작을 되살린다.
     *
     * API 30 미만은 손대지 않는다 — WindowInsetsCompat.Type.ime() 가 API 30+ 에서만 신뢰할 수
     * 있고, edge-to-edge 강제도 Android 15/16 에서만 일어나기 때문이다.
     */
    @SuppressWarnings("deprecation") // setStatusBarColor/setNavigationBarColor: API 35+ 에서 no-op 으로 폐기(그래서 35 미만에서만 호출)
    private void applyEdgeToEdgeInsets() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;   // API 30 미만: 기존 동작 유지

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        final View root = findViewById(android.R.id.content);
        if (root == null) return;
        root.setBackgroundColor(ContextCompat.getColor(this, R.color.mds_system_bar_bg));

        ViewCompat.setOnApplyWindowInsetsListener(root, new OnApplyWindowInsetsListener() {
            @Override
            public WindowInsetsCompat onApplyWindowInsets(View v, WindowInsetsCompat insets) {
                Insets pad = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                        | WindowInsetsCompat.Type.ime()
                );
                v.setPadding(pad.left, pad.top, pad.right, pad.bottom);
                return WindowInsetsCompat.CONSUMED;
            }
        });
        ViewCompat.requestApplyInsets(root);

        // 종이(라이트) 테마이므로 시스템바 아이콘은 어둡게.
        WindowInsetsControllerCompat bars =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(true);
        bars.setAppearanceLightNavigationBars(true);

        // API 30~34: 시스템이 그리는 바 배경·대비 스크림을 걷어내 위 패딩 색이 그대로 보이게 한다.
        // (35 = VANILLA_ICE_CREAM. 상수 대신 숫자를 쓰는 이유는 낮은 compileSdk 로 내려도 컴파일되게.)
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleFileIntent(intent);
    }

    private void handleFileIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;
        android.util.Log.i("MDS", "handleFileIntent action=" + action + " consumed=" + intent.getBooleanExtra("mds_consumed", false));
        if (intent.getBooleanExtra("mds_consumed", false)) return;   // 같은 인텐트 재처리 방지
        intent.putExtra("mds_consumed", true);

        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri == null) {
                CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                if (shared != null) {
                    deliver("shared.md", shared.toString());
                }
                return;
            }
        }
        if (uri == null) return;

        final Uri fUri = uri;
        // 콘텐츠 읽기는 메인 스레드 밖에서.
        new Thread(new Runnable() {
            @Override public void run() {
                final String name = queryName(fUri);
                final String content = readText(fUri);
                if (content != null) {
                    runOnUiThread(new Runnable() {
                        @Override public void run() { deliver(name, content); }
                    });
                }
            }
        }).start();
    }

    private String queryName(Uri uri) {
        String name = "무제.md";
        try {
            Cursor c = getContentResolver().query(uri, null, null, null, null);
            if (c != null) {
                try {
                    if (c.moveToFirst()) {
                        int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) {
                            String n = c.getString(idx);
                            if (n != null && n.length() > 0) name = n;
                        }
                    }
                } finally { c.close(); }
            }
        } catch (Exception ignored) {}
        // content:// 로도 이름을 못 얻으면 경로 마지막 조각 시도
        if ("무제.md".equals(name)) {
            String last = uri.getLastPathSegment();
            if (last != null && last.length() > 0) {
                int slash = last.lastIndexOf('/');
                name = slash >= 0 ? last.substring(slash + 1) : last;
            }
        }
        return name;
    }

    private String readText(Uri uri) {
        InputStream is = null;
        try {
            is = getContentResolver().openInputStream(uri);
            if (is == null) return null;
            BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[8192];
            int n;
            while ((n = br.read(buf)) != -1) sb.append(buf, 0, n);
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (is != null) { try { is.close(); } catch (Exception ignored) {} }
        }
    }

    private void deliver(String name, String text) {
        try {
            JSONObject o = new JSONObject();
            o.put("name", name);
            o.put("text", text);
            // o.toString() 은 유효한 JSON = 유효한 JS 객체 리터럴(따옴표·개행 등 이스케이프됨)
            final String js = "window.__mdsOpenIncoming(" + o.toString() + ")";
            injectWithRetry(js, 20);
        } catch (Exception ignored) {}
    }

    private void injectWithRetry(final String js, final int triesLeft) {
        if (triesLeft <= 0 || getBridge() == null || getBridge().getWebView() == null) return;
        final Handler h = new Handler(Looper.getMainLooper());
        getBridge().getWebView().evaluateJavascript(
            "typeof window.__mdsOpenIncoming==='function'",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if ("true".equals(value)) {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    } else {
                        h.postDelayed(new Runnable() {
                            @Override public void run() { injectWithRetry(js, triesLeft - 1); }
                        }, 300);
                    }
                }
            });
    }
}
