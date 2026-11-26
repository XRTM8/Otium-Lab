import com.android.build.api.variant.FilterConfiguration

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

val versionMajor = 3
val versionMinor = 3
val versionPatch = 1
val baseVersionCode = (versionMajor * 1_000_000) + (versionMinor * 10_000) + (versionPatch * 100)
val appVersionName = "$versionMajor.$versionMinor.$versionPatch"

android {
    namespace = "com.otium.lab"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.otium.lab"
        minSdk = 26
        targetSdk = 35
        versionCode = baseVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    signingConfigs {
        create("release") {
            val keystoreFile = file("signing/otium-lab.jks")
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "otiumlab2026"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "otium-lab"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "otiumlab2026"
            } else {
                val debugSigning = getByName("debug")
                storeFile = debugSigning.storeFile
                storePassword = debugSigning.storePassword
                keyAlias = debugSigning.keyAlias
                keyPassword = debugSigning.keyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a")
            isUniversalApk = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Monotonic versionCode per ABI to ensure arm64-v8a is preferred on 64-bit devices
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { output ->
            val abi = output.filters.find { it.filterType == FilterConfiguration.FilterType.ABI }?.identifier
            val abiOffset = when (abi) {
                "arm64-v8a" -> 2
                else -> 1 // Universal APK
            }
            output.versionCode.set(baseVersionCode + abiOffset)
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)

    // Native Bridge UniFFI (JNA)
    implementation(libs.jna)

    // PDFBox Android (Offline Text Extraction & Positioning)
    implementation(libs.pdfbox.android)

    // Network & In-App Updater
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)

    // Performance & Ahead-of-Time (AOT) Baseline Profile Execution
    implementation(libs.androidx.profileinstaller)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)

    debugImplementation(libs.androidx.ui.tooling)
}
