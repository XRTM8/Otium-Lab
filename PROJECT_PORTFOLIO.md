# حافظة مشروع Otium Mobile (Project Master Portfolio)
> **دليل المزامنة والمرجع الثابت للذكاء الاصطناعي والمطورين (Handover Document)**
> **تاريخ آخر تحديث:** 22 نوفمبر 2026 | **الإصدار الحالي المعتمد:** `v2.2.8`

---

## 1. الهيكل العام ومسارات المشروع

| العنصر | المسار الفعلي على الجهاز | الوصف |
| :--- | :--- | :--- |
| **مستودع كود تطبيق الموبايل** | `E:\PROJECTS\Otium-Mobile` | تطبيق Android الأصلي (Kotlin + Jetpack Compose + Rust Bridge) |
| **مستودع GitHub الرسمي** | `https://github.com/XRTM8/Otium-Mobile.git` | الفرع الأساسي: `main` |
| **أحدث حزمة APK موقعة ومثبتة** | `E:\PROJECTS\pdf\Otium-Lab_2.2.8_arm64-v8a.apk` | الحزمة الرسمية الموقعة الجاهزة للاستخدام الفوري |

---

## 2. جدول الإصدارات وتاريخ التعديلات (Version History)

لتجنب أي تكرار أو إعادة للأخطاء السابقة، هذا هو السجل الكامل للإصدارات:

* **v2.1.9 (Obsidian Launch & Back Stack):**
  - حل مشكلة وميض الشاشة البيضاء عند فتح التطبيق بطبقة Obsidian Splash Emblem.
  - تطبيق مكدس الرجوع المحكم (5-Layer BackHandler) لمنع الخروج الخطأ من التطبيق.
* **v2.2.0 (Modular Architecture Overhaul):**
  - إعادة هيكلة وتفكيك ملفات المشروع وفق وثيقة `ARCHITECTURE.md`.
  - وضع شرط صارم: كل شاشة < 200 سطر، وكل مكون < 150 سطر، ومنع وضع الحوارات (Dialogs) ضمن ملفات الشاشات.
* **v2.2.1 (CamScanner Stability Fix):**
  - معالجة كراش الكام سكانر عبر `PreviewView.ImplementationMode.COMPATIBLE`.
  - معالجة انهيار الذاكرة (OOM) لكاميرات 50 ميغابكسل مع تنظيف الموارد في دورة حياة Compose.
* **v2.2.2 (Cold Start Speed Optimization):**
  - تسريع فتح التطبيق فلكياً بحذف التأخيرات الاصطناعية (`delay(180)`).
  - فصل قراءة المستندات إلى مسار الخلفية `Dispatchers.IO`.
  - دمج `androidx.profileinstaller` للترجمة المسبقة AOT Compilation عبر ART runtime.
* **v2.2.3 (Velvet Theme & Perspective Warp):**
  - استبدال تنبيهات التحديثات الخضراء بكبسولة العنابي المخملي المنسجمة مع الواجهة.
  - تحسين شكل أزرار وسويتشات الإعدادات.
  - تفعيل القص المنظوري التفاعلي بأربع نقاط حرة عبر مكتبة Rust (`bridgeWarpDocument`).
* **v2.2.4 (Core Intuitive Features):**
  - شريط البحث الفوري في المكتبة (`DocumentSearchBar.kt`).
  - ميزة إعادة تسمية المستندات والملفات الممسوحة (`DocumentRenameDialog.kt`).
  - نافذة طلب اسم المستند قبل الحفظ في الماسح (`DocumentSaveNameDialog.kt`).
  - حفظ نسخة فورية من المستند إلى مجلد التنزيلات العام (`DocumentStore.exportToDownloads`).
  - مؤشر نسبة القراءة (`ص X من Y` مع شريط تقدم) على بطاقات المستندات.
* **v2.2.5 (CamScanner Pro & Loupe):**
  - كشف حواف الورقة التكيفي الذكي بخوارزمية Sobel Gradients & Ray-Casting.
  - إضافة العدسة المكبرة التفاعلية (2x Magnifier Loupe) التي تظهر فوق الإصبع عند سحب زوايا القص.
  - إضافة زر «التقاط ذكي» (Auto-Detect) وزر «كامل الإطار» (Full Frame).
* **v2.2.6 (النسخة السابقة):**
  - تثبيت وتوحيد هوية **العنابي الملكي الفاخر** (`#881337`) في الثيمات، واستبدال الكرزي بالعنابي بناءً على التفضيل الجمالي للمستخدم.
* **v2.2.7 (النسخة السابقة):**
  - حفظ مكان التوقف واستئناف القراءة الفوري والتظليل والنسخ الأصلي عبر PDFBox.
* **v2.2.8 (Memory Stability, Cover Thumbnails & Pinch-to-Zoom Engine):**
  - **حماية الذاكرة ومنع انهيار الماسح (Zero-OOM Scanner Engine):** تخزين الصفحات الممسوحة مؤقتاً كملفات مضغوطة على القرص (`cacheDir/scan_session`) بدلاً من مراكمة الـ Bitmaps الضخمة في الرام، وتصدير الـ PDF عبر تدفق تسلسلي يحرر الذاكرة فورياً بعد كل صفحة.
  - **أغلفة المستندات الحقيقية في المكتبة (Cover Thumbnails):** توليد وعرض أغلفة حقيقية للصفحة الأولى لكل مستند في بطاقات المكتبة وشريط متابعة القراءة عبر محرك كاش مزدوج (RAM + Disk Cache) فائق السرعة (`PdfThumbnailLoader.kt`).
  - **تكبير وتصغير وتحريك متعدد اللمس (Pinch-to-Zoom & Pan):** تكبير مرن بإصبعين يتراوح بين `1.0x` و `4.5x` مع إمكانية التحريك الحر (Pan) في كامل الاتجاهات مع الحفاظ على النقر المزدوج السريع.
  - **جلسة مستند PDF مستمرة في محرك النصوص:** الاحتفاظ بكائن `PDDocument` مفتوحاً طوال جلسة القراءة وإعادة استخدامه عبر الصفحات بدلاً من إعادة فك تشفير وقراءة الملف كاملاً مع كل صفحة.
  - **تحجيم ديناميكي لكاش الريندر:** ضبط سعة كاش صفحات الـ PDF ديناميكياً بحسب حجم ذاكرة الجهاز المتاحة (`maxMemory / 22`) لحماية الأجهزة الاقتصادية والمتوسطة من استنزاف الـ Heap.

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
