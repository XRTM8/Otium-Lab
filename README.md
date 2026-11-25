# Otium Mobile

## العربية

تطبيق أندرويد لقراءة ملفات PDF ومسح المستندات بالكاميرا. الواجهة مكتوبة بـ Kotlin وJetpack Compose، وتستخدم أجزاء Rust للبحث العربي ومعالجة الصور.

### الموجود في المستودع

- مكتبة محلية لإضافة ملفات PDF والبحث عنها وإعادة تسميتها وحذفها وتصديرها، مع استئناف القراءة.
- قارئ PDF يعرض الصفحات عبر `PdfRenderer`، ويدعم البحث في النص، الفهرس، التحديد والتظليل، تغيير طريقة العرض وألوان القراءة، والتنقل بأزرار الصوت.
- ماسح مستندات عبر CameraX مع كشف حدود الصفحة أثناء المعاينة، وتصحيح القص والمنظور، ومراجعة الصفحات وترتيبها قبل تصدير PDF.
- حزم Rust في `crates/` للبحث وتطبيع النص العربي، حسابات المنظور ومعالجة الصور، مع جسر UniFFI إلى تطبيق أندرويد.
- إعدادات للمظهر والقراءة والتخزين، وفحص تحديثات التطبيق.

### البنية والبناء

`app/` يحتوي تطبيق أندرويد واختباراته، و`crates/` يحتوي الحزم الأصلية. ملفات الربط ومكتبات `.so` مضمنة في `app/src/main/`. الحد الأدنى للنظام هو Android 8.0 ‏(API 26)، ويستخدم البناء JDK 17 وAndroid SDK 35. لبناء نسخة التطوير من جذر المستودع:

```bash
./gradlew assembleDebug
```

لإعادة بناء أجزاء Rust تحتاج أدوات Rust وAndroid NDK. تفاصيل تقسيم الكود في [ARCHITECTURE.md](ARCHITECTURE.md).

الترخيص: [GPL-3.0](LICENSE).

## English

Otium Mobile is an Android PDF reader and document scanner. Its interface uses Kotlin and Jetpack Compose; Rust crates handle Arabic text search and image processing.

### Repository contents

- A local PDF library for adding, searching, renaming, deleting, and exporting documents, with reading position saved.
- A PDF reader using Android `PdfRenderer`, with text search, outlines, selection and highlights, reading layouts and color modes, and volume-key navigation.
- A CameraX scanner with live page-edge detection, crop and perspective correction, image filters, page review and ordering, and PDF export.
- Rust crates under `crates/` for Arabic text normalization and search, perspective calculations, image processing, and a UniFFI bridge to Android.
- Appearance, reading, and storage settings, plus an in-app update check.

### Layout and build

`app/` contains the Android application and tests. `crates/` contains the native code. Generated bindings and `.so` libraries are included under `app/src/main/`. The minimum supported version is Android 8.0 (API 26); the build uses JDK 17 and Android SDK 35. From the repository root:

```bash
./gradlew assembleDebug
```

Rebuilding the Rust components also requires Rust and the Android NDK. See [ARCHITECTURE.md](ARCHITECTURE.md) for the code layout.

License: [GPL-3.0](LICENSE).


---

للتواصل / Contact: [@MA.XRT](https://www.instagram.com/ma.xrt/)
