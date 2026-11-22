# حافظة مشروع Otium Mobile (Project Master Portfolio)
> **دليل المزامنة والمرجع الثابت للذكاء الاصطناعي والمطورين (Handover Document)**
> **تاريخ آخر تحديث:** 22 نوفمبر 2026 | **الإصدار الحالي المعتمد:** `v2.2.9`

---

## 1. الهيكل العام ومسارات المشروع

| العنصر | المسار الفعلي على الجهاز | الوصف |
| :--- | :--- | :--- |
| **مستودع كود تطبيق الموبايل** | `E:\PROJECTS\Otium-Mobile` | تطبيق Android الأصلي (Kotlin + Jetpack Compose + Rust Bridge) |
| **مستودع GitHub الرسمي** | `https://github.com/XRTM8/Otium-Mobile.git` | الفرع الأساسي: `main` |
| **أحدث حزمة APK موقعة ومثبتة** | `E:\PROJECTS\pdf\Otium-Lab_2.2.9_arm64-v8a.apk` | الحزمة الرسمية الموقعة الجاهزة للاستخدام الفوري |

---

## 2. جدول الإصدارات وتاريخ التعديلات (Version History)

لتجنب أي تكرار أو إعادة للأخطاء السابقة، هذا هو السجل الكامل للإصدارات:

* **v2.2.8 (النسخة السابقة):**
  - استقرار الذاكرة وأغلفة المستندات وكاش الريندر الديناميكي.
* **v2.2.9 (Comprehensive Bug Fixes & Gesture Architecture Polish):**
  - **فصل وحل تعارض إيماءات التمرير والتكبير (Gesture Conflict Resolution):** بناء محرك إيماءات مخصص (`PdfGestureDetector.kt`) يسمح للتمرير الرأسي (`LazyColumn`) والتقليب الأفقي (`HorizontalPager`) بالعمل بسلاسة فائقة 120fps عند المقياس الطبيعي (1.0x) دون اعتراض أحادي اللمس، مع تفعيل الـ Pinch-to-Zoom بإصبعين والتحريك الحر عند التكبير دون أي صراع مع النقر والنقر المزدوج.
  - **معالجة دوران صور الاستوديو (Gallery EXIF Orientation Fix):** تصحيح زوايا الدوران التلقائية للصور الملتقطة عمودياً والمستوردة من المعرض عبر فحص `ExifInterface` وتدويرها بدقة لتفادي ظهور الصور بالوضع العرضي.
  - **تثبيت التدوير أثناء القص والفلترة (Rotation Persistence):** تحديث بايتات الصورة الأصلية `activeBytes` فور تدويرها في شاشة القص، مما يضمن تطبيق قص المنظور (Warping) وتبديل الفلاتر على الصورة بالزاوية الصحيحة للمستخدم.
  - **سد تسريبات الموارد والخيوط (Thread & Descriptor Leak Prevention):** إغلاق وإيقاف الـ Executor Thread في `NativePdfRenderer` عند الخروج، وإغلاق صفحات `PdfRenderer.Page` و `stream` داخل كتل `try-finally` مضمونة لتفادي `IllegalStateException` وانسكاب الـ Descriptors.
  - **تزامن محرك النصوص واستخراج الكلمات بدقة بالغة (Word-Level Precision & Concurrency):** حماية كائن `PDDocument` بقفل `Mutex` لمنع أخطاء `ConcurrentModificationException` أثناء التمرير السريع، وتجميع أحرف `TextPosition` على مستوى الكلمة المفردة لتوفير تحديد وتظليل دقيق للغاية لكل كلمة بدلاً من السطر بالكامل.
  - **تنظيف البيانات اليتيمة عند حذف المستند:** مسح التظليلات (`AnnotationStore`) وأغلفة المعاينة من القرص (`PdfThumbnailLoader`) فور حذف المستند من المكتبة.
  - **ملاءمة العرض الأفقي للمستندات:** تطبيق `ContentScale.Fit` في وضع القراءة الأفقي لعرض الصفحات الطويلة كاملة دون اقتصاص رأسي.

---

## 3. الهوية البصرية الحالية المعتمدة (Velvet Regal Burgundy)

تم اعتماد هذه اللوحة في ملف `app/src/main/java/com/otium/lab/ui/theme/ThemeManager.kt`:

1. **الأبيض الناصع (LIGHT):**
   - الخلفية: `#FFFFFF`، البطاقات والأسطح: `#F8FAFC`.
   - اللون الأساسي والأزرار: عنابي ملكي عميق `Color(0xFF881337)`.
   - الحاويات: وردي مخملي خافت `Color(0xFFFFE4E6)`.
2. **الكريمي الورقي (CREAM):**
   - الخلفية: ورق ياباني طبيعي دافئ `#FBF7EE`، والبطاقات: `#F3ECE0`.
   - اللون الأساسي والأزرار: عنابي ملكي عميق `Color(0xFF881337)` (بدون كرزي).
   - النصوص: بني إسبريسو `#231815` مريح للقراءة المطولة دون إجهاد.
3. **الأموليد الأسود (AMOLED):**
   - الخلفية: سواد مطلق 100% (`#000000`) لإطفاء بكسلات الشاشة.
   - البطاقات: زجاج داكن فاحم `Color(0xFF0D0D10)`.
   - اللون الأساسي والأزرار: عنابي مخملي راقي متزن `Color(0xFFBE123C)` غير فاقع ولا يجهد العين في الظلام.

---

## 4. إعدادات التوقيع والشهادات الرقمية (Signing Credentials)

* **ملف الـ Keystore الدائم (30 عاماً 2026–2056):**
  `E:\PROJECTS\Otium-Lab\app\signing\otium-lab.jks`
* **الاسم المستعار (Alias):** `otium-lab`
* **كلمة مرور الشهادة والمخزن:** `otiumlab2026`
* **نوع التشفير:** RSA 4096-bit
* **نظام التوقيع:** `APK Signature Scheme v2 (Enabled)`

---

## 5. دليل الأوامر وتجميع الإصدارات (Runbook)

يجب تنفيذ جميع الأوامر من مجلد `E:\PROJECTS\Otium-Lab`:

1. **رفع رقم الإصدار (Version Bump):**
   ```powershell
   & "E:\PROJECTS\ARGON\src-tauri\tools\node.exe" "scripts\bump-version.mjs" "<NEW_VERSION>"
   ```
2. **بناء الحزمة الموقعة (Release Build):**
   ```powershell
   .\gradlew assembleRelease --stacktrace
   ```
3. **فحص صحة التوقيع (Verify Signature):**
   ```powershell
   & "C:\Android\Sdk\build-tools\35.0.0\apksigner.bat" verify --verbose "app\build\outputs\apk\release\app-arm64-v8a-release.apk"
   ```
4. **توليد خلاصة التحديث التلقائي (Generate Feed):**
   ```powershell
   & "E:\PROJECTS\ARGON\src-tauri\tools\node.exe" "scripts\generate-latest-json.mjs" "<NEW_VERSION>" "<RELEASE_NOTES>"
   ```
5. **نسخ الحزمة لمجلد التوزيع (Sync to Workspace):**
   ```powershell
   Copy-Item -Path "dist\Otium-Lab_<NEW_VERSION>_arm64-v8a.apk" -Destination "E:\PROJECTS\pdf\Otium-Lab_<NEW_VERSION>_arm64-v8a.apk" -Force
   ```
6. **الالتزام ودفع التحديث إلى GitHub (Commit & Push Tags):**
   ```powershell
   git add -A
   git commit -m "feat: description (v<NEW_VERSION>)"
   git tag -a "v<NEW_VERSION>" -m "Otium Release v<NEW_VERSION>"
   git push origin main --tags
   ```

---

## 6. القواعد الهندسية الصارمة (Strict Architectural Rules)

1. **حجم الملفات:**
   - شاشات التنسيق (`*Screen.kt`): **أقل من 200 سطر دائماً**.
   - المكونات الجزئية (`components/*`): **أقل من 150 سطر دائماً**.
2. **الحوارات المنبثقة:**
   - يمنع منعاً باتاً كتابة `AlertDialog` داخل الشاشة مباشرة، ويجب عزل كل حوار في ملف مستقل داخل مجلد `components/`.
3. **السيادة والخصوصية (Offline-First):**
   - عدم استخدام أي API خارجي أو سحابي للمستندات؛ المسح والقراءة والتخزين محلي 100%.
4. **منع الحشو (Zero AI Slop):**
   - كل سطر كود يضاف يجب أن يكون مبنياً على وظيفة حقيقية، مختبراً، ومحققاً من بنائه دون أخطاء.
