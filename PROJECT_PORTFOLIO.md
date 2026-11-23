# حافظة مشروع Otium Mobile (Project Master Portfolio)
> **دليل المزامنة والمرجع الثابت للذكاء الاصطناعي والمطورين (Handover Document)**
> **تاريخ آخر تحديث:** 23 نوفمبر 2026 | **الإصدار الحالي المعتمد:** `v2.3.1`

---

## 1. الهيكل العام ومسارات المشروع

| العنصر | المسار الفعلي على الجهاز | الوصف |
| :--- | :--- | :--- |
| **مستودع كود تطبيق الموبايل** | `E:\PROJECTS\Otium-Mobile` | تطبيق Android الأصلي (Kotlin + Jetpack Compose + Rust Bridge) |
| **مستودع GitHub الرسمي** | `https://github.com/XRTM8/Otium-Mobile.git` | الفرع الأساسي: `main` |
| **أحدث حزمة APK موقعة ومثبتة** | `E:\PROJECTS\pdf\Otium-Lab_2.3.1_arm64-v8a.apk` | الحزمة الرسمية الموقعة الجاهزة للاستخدام الفوري |

---

## 2. جدول الإصدارات وتاريخ التعديلات (Version History)

لتجنب أي تكرار أو إعادة للأخطاء السابقة، هذا هو السجل الكامل للإصدارات:

* **v2.3.0 (النسخة السابقة):**
  - ربط النوايا النظامية لفتح PDF وتصحيح FileProvider ومسارات التحديث.
* **v2.3.1 (Hardware Volume Key Page Turn & Encrypted Document Safeguard):**
  - **تفعيل التقليب الفعلي بأزرار الصوت (Hardware Volume Page Turn Engine):** ربط إعداد "التقليب بأزرار الصوت" بمستمع أحداث المفاتيح المادي (`onKeyDown` في `MainActivity` و `ReaderKeyEvents`)، ليقوم زرا رفع وخفض الصوت بتبديل الصفحات بسلاسة تامة في القارئ مع تنظيف فوري عند الخروج وعدم التأثير على باقي التطبيق.
  - **حماية وإشعار المستندات المشفرة (Encrypted PDF Safety):** التعامل الذكي مع ملفات الـ PDF المحمية بكلمات مرور وعرض تنبيه عربي إرشادي واضح بدلاً من انهيار الريندر باستثناءات أمنية غير مفهومة.
  - **تحسين معمارية ألوان القراءة:** نقل خصائص الألوان إلى `PageColorMode` بصورة نظيفة ومحكمة مع الحفاظ على مقاسات الشاشات < 200 سطر.

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
