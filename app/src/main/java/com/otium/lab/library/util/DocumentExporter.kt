package com.otium.lab.library.util

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

object DocumentExporter {
    fun exportToDownloads(context: Context, uri: Uri, title: String): Boolean {
        return try {
            val resolver = context.contentResolver
            val inputStream = if (uri.scheme == "file") {
                File(uri.path ?: "").inputStream()
            } else {
                resolver.openInputStream(uri)
            } ?: return false

            val filename = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val destUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                resolver.openOutputStream(destUri)?.use { out ->
                    inputStream.use { it.copyTo(out) }
                }
                true
            } else {
                @Suppress("DEPRECATION")
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (!downloadsDir.exists()) downloadsDir.mkdirs()
                val destFile = File(downloadsDir, filename)
                destFile.outputStream().use { out ->
                    inputStream.use { it.copyTo(out) }
                }
                true
            }
        } catch (_: Exception) {
            false
        }
    }
}
