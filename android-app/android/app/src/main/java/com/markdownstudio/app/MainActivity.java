package com.markdownstudio.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.ValueCallback;

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
        handleFileIntent(getIntent());
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
