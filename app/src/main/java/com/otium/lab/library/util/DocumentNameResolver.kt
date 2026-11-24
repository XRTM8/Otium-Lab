package com.otium.lab.library.util

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File

object DocumentNameResolver {
    fun resolveDisplayName(context: Context, uri: Uri): String {
        if (uri.scheme == "file") {
            return File(uri.path ?: "").nameWithoutExtension.ifBlank { "مستند PDF" }
        }
        if (uri.scheme == "content") {
            try {
                context.contentResolver.query(
                    uri,
                    arrayOf(OpenableColumns.DISPLAY_NAME),
                    null,
                    null,
                    null
                )?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex != -1 && cursor.moveToFirst()) {
                        val name = cursor.getString(nameIndex)
                        if (!name.isNullOrBlank()) {
                            return name.substringBeforeLast('.')
                        }
                    }
                }
            } catch (_: Exception) {}
        }
        val raw = uri.lastPathSegment ?: "مستند PDF"
        val clean = raw.substringAfterLast('/').substringAfterLast(':')
        return if (clean.matches(Regex("^\\d+$")) || clean.isBlank()) "مستند بدون عنوان" else clean.substringBeforeLast('.')
    }
}
