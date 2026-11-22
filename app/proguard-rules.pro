# Otium ProGuard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @org.jetbrains.annotations.* <fields>;
    @org.jetbrains.annotations.* <methods>;
}

# UniFFI Native Bridge Keep Rules
-keep class uniffi.** { *; }
-keep class com.otium.bridge.** { *; }

# Apache PDFBox Android
-keep class com.tom_roush.pdfbox.** { *; }
-dontwarn com.tom_roush.pdfbox.**
