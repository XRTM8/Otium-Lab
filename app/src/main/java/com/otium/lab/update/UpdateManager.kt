package com.otium.lab.update

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.FileProvider
import com.otium.lab.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit

data class UpdateInfo(
    val version: String,
    val notes: String,
    val downloadUrl: String,
    val sha256: String,
    val sizeBytes: Long
)

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data class UpToDate(val currentVersion: String) : UpdateState
    data class Available(val update: UpdateInfo) : UpdateState
    data class Downloading(val progress: Float, val downloadedMb: String, val totalMb: String) : UpdateState
    data class ReadyToInstall(val file: File) : UpdateState
    data class Error(val message: String) : UpdateState
}

class UpdateManager(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    private val feedUrl = "https://github.com/XRTM8/Otium-Mobile/releases/latest/download/latest.json"
    private val apiFallbackUrl = "https://api.github.com/repos/XRTM8/Otium-Mobile/releases/latest"

    fun checkForUpdates(silentOnNetworkError: Boolean = true): Flow<UpdateState> = flow {
        if (!silentOnNetworkError) emit(UpdateState.Checking)
        val current = BuildConfig.VERSION_NAME

        try {
            val updateInfo = fetchFeed()
            if (updateInfo != null && isNewer(updateInfo.version, current)) {
                emit(UpdateState.Available(updateInfo))
            } else {
                emit(UpdateState.UpToDate(current))
            }
        } catch (e: Exception) {
            if (silentOnNetworkError) {
                emit(UpdateState.Idle)
            } else {
                emit(UpdateState.Error(e.localizedMessage ?: "فشل فحص التحديثات"))
            }
        }
    }.flowOn(Dispatchers.IO)

    fun downloadUpdate(update: UpdateInfo): Flow<UpdateState> = flow {
        val totalStrInit = String.format(Locale.US, "%.1f", update.sizeBytes / (1024f * 1024f))
        emit(UpdateState.Downloading(0f, "0.0", totalStrInit))

        val apkFile = File(context.cacheDir, "Otium-update.apk")
        if (apkFile.exists()) apkFile.delete()

        try {
            val request = Request.Builder().url(update.downloadUrl).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    emit(UpdateState.Error("فشل تحميل التحديث: رمز الاستجابة ${response.code}"))
                    return@flow
                }

                val body = response.body ?: throw IllegalStateException("جسم الاستجابة فارغ")
                val totalBytes = if (update.sizeBytes > 0) update.sizeBytes else body.contentLength()
                var downloaded = 0L
                var lastEmitTime = 0L

                val digest = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(8192)

                body.byteStream().use { input ->
                    FileOutputStream(apkFile).use { output ->
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            digest.update(buffer, 0, bytesRead)
                            downloaded += bytesRead

                            val now = System.currentTimeMillis()
                            if (now - lastEmitTime >= 150L || (totalBytes > 0 && downloaded >= totalBytes)) {
                                lastEmitTime = now
                                val progress = if (totalBytes > 0) (downloaded.toFloat() / totalBytes).coerceIn(0f, 1f) else 0f
                                val downMb = String.format(Locale.US, "%.1f", downloaded / (1024f * 1024f))
                                val totMb = String.format(Locale.US, "%.1f", totalBytes.coerceAtLeast(downloaded) / (1024f * 1024f))
                                emit(UpdateState.Downloading(progress, downMb, totMb))
                            }
                        }
                    }
                }

                val computedHash = digest.digest().joinToString("") { "%02x".format(it) }
                if (update.sha256.isNotBlank() && !computedHash.equals(update.sha256, ignoreCase = true)) {
                    apkFile.delete()
                    emit(UpdateState.Error("فشل التحقق من أمان التحديث: البصمة المشفرة غير متطابقة"))
                    return@flow
                }
            }

            emit(UpdateState.ReadyToInstall(apkFile))
        } catch (e: Exception) {
            apkFile.delete()
            emit(UpdateState.Error(e.localizedMessage ?: "حدث خطأ أثناء تحميل التحديث"))
        }
    }.flowOn(Dispatchers.IO)

    fun installApk(file: File) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    val settingsIntent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = android.net.Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(settingsIntent)
                    return
                }
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (_: Exception) {
            android.widget.Toast.makeText(context, "تعذر فتح مثبّت التحديث", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    private fun fetchFeed(): UpdateInfo? {
        val is64Bit = Build.SUPPORTED_ABIS.contains("arm64-v8a")

        // Try raw static feed first (0 GitHub API rate limits)
        try {
            val req = Request.Builder().url(feedUrl).build()
            client.newCall(req).execute().use { res ->
                if (res.isSuccessful && res.body != null) {
                    val json = JSONObject(res.body!!.string())
                    val version = json.getString("version").removePrefix("v").trim()
                    val notes = json.optString("notes", "")
                    val assets = json.optJSONObject("assets")

                    val chosenAsset = if (is64Bit && assets?.has("androidArm64") == true) {
                        assets.getJSONObject("androidArm64")
                    } else if (assets?.has("androidUniversal") == true) {
                        assets.getJSONObject("androidUniversal")
                    } else {
                        assets?.optJSONObject("androidApk")
                    }

                    if (chosenAsset != null) {
                        return UpdateInfo(
                            version = version,
                            notes = notes,
                            downloadUrl = chosenAsset.getString("url"),
                            sha256 = chosenAsset.optString("sha256", ""),
                            sizeBytes = chosenAsset.optLong("size", 0L)
                        )
                    }
                }
            }
        } catch (_: Exception) {
            // Fallback to GitHub Releases API
        }

        // Tier 2: GitHub Releases API fallback
        try {
            val apiReq = Request.Builder()
                .url(apiFallbackUrl)
                .header("Accept", "application/vnd.github.v3+json")
                .build()

            client.newCall(apiReq).execute().use { res ->
                if (res.isSuccessful && res.body != null) {
                    val json = JSONObject(res.body!!.string())
                    val tag = json.getString("tag_name").removePrefix("v").trim()
                    val notes = json.optString("body", "")
                    val assetsArray = json.optJSONArray("assets")

                    var downloadUrl = ""
                    var size = 0L

                    if (assetsArray != null) {
                        for (i in 0 until assetsArray.length()) {
                            val asset = assetsArray.getJSONObject(i)
                            val name = asset.getString("name")
                            if (is64Bit && name.contains("arm64-v8a", ignoreCase = true) && name.endsWith(".apk")) {
                                downloadUrl = asset.getString("browser_download_url")
                                size = asset.optLong("size", 0L)
                                break
                            } else if (name.contains("universal", ignoreCase = true) && name.endsWith(".apk")) {
                                downloadUrl = asset.getString("browser_download_url")
                                size = asset.optLong("size", 0L)
                            }
                        }
                    }

                    if (downloadUrl.isNotBlank()) {
                        return UpdateInfo(
                            version = tag,
                            notes = notes,
                            downloadUrl = downloadUrl,
                            sha256 = "",
                            sizeBytes = size
                        )
                    }
                }
            }
        } catch (_: Exception) {}

        return null
    }

    private fun isNewer(candidate: String, current: String): Boolean {
        val candParts = candidate.split("-")[0].split(".").map { it.toIntOrNull() ?: 0 }
        val currParts = current.split("-")[0].split(".").map { it.toIntOrNull() ?: 0 }

        for (i in 0 until maxOf(candParts.size, currParts.size)) {
            val c = candParts.getOrElse(i) { 0 }
            val cur = currParts.getOrElse(i) { 0 }
            if (c > cur) return true
            if (c < cur) return false
        }
        return false
    }
}
