# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ────────────────────────────────────────────────────────────
# Capacitor / WebView keep 규칙
# Capacitor 는 플러그인을 어노테이션·리플렉션으로 찾아 호출하고, 웹(JS)과
# @JavascriptInterface 로 통신한다. R8 이 이들을 지우거나 이름을 바꾸면
# 앱이 뜨자마자 브리지가 깨져 크래시/무동작이 된다. 아래로 보호한다.
# (Capacitor AAR 이 자체 consumer 규칙도 넣지만, 방어적으로 명시한다.)
-keepattributes *Annotation*, JavascriptInterface

# Capacitor 코어·플러그인 클래스와 그 멤버
-keep public class com.getcapacitor.** { *; }
-keep public class com.capacitorjs.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }

# 어노테이션으로 노출되는 메서드/콜백 유지
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}

# @JavascriptInterface 로 웹에 노출되는 네이티브 멤버
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Cordova 브리지(capacitor-cordova-android-plugins)도 리플렉션 사용
-keep class org.apache.cordova.** { *; }

# 우리 앱 클래스(MainActivity 등 — 인텐트로 .md 열기 처리, __mdsOpenIncoming 호출)
-keep class com.markdownstudio.app.** { *; }
