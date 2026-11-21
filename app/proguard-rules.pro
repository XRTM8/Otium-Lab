# Otium ProGuard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @org.jetbrains.annotations.* <fields>;
    @org.jetbrains.annotations.* <methods>;
}

# UniFFI Native Bridge Keep Rules
-keep class uniffi.** { *; }
-keep class com.otium.bridge.** { *; }

# Pdfium Android
-keep class com.github.barteksc.pdfviewer.** { *; }
-keep class com.shockwave.** { *; }
