package com.otium.lab.library

import android.content.ContentValues
import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class StoredDocument(
    val uriString: String,
    val title: String,
    val isScanned: Boolean,
    val timestamp: Long,
    val lastPage: Int = 1,
    val totalPages: Int = 0,
    val scrollOffset: Int = 0
) {
    val uri: Uri get() = Uri.parse(uriString)
}

class DocumentStore(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("otium_doc_store", Context.MODE_PRIVATE)

    companion object {
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

    fun getStorageUsageBytes(): Long {
        var total = 0L
        try {
            val scansDir = File(context.filesDir, "scans")
            if (scansDir.exists()) {
                scansDir.listFiles()?.forEach { total += it.length() }
            }
            val cacheDir = context.cacheDir
            if (cacheDir.exists()) {
                cacheDir.walkTopDown().forEach { total += it.length() }
            }
        } catch (_: Exception) {}
        return total
    }

    fun clearTemporaryCache() {
        try {
            context.cacheDir.deleteRecursively()
            context.cacheDir.mkdirs()
        } catch (_: Exception) {}
    }

    fun getDocuments(): List<StoredDocument> {
        val list = mutableListOf<StoredDocument>()
        val recentMap = mutableMapOf<String, StoredDocument>()

        // 1. Read stored document metadata & progress from preferences first
        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val uriStr = obj.getString("uri")
                recentMap[uriStr] = StoredDocument(
                    uriString = uriStr,
                    title = obj.optString("title", "مستند PDF"),
                    isScanned = obj.optBoolean("isScanned", false),
                    timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
                    lastPage = obj.optInt("lastPage", 1),
                    totalPages = obj.optInt("totalPages", 0),
                    scrollOffset = obj.optInt("scrollOffset", 0)
                )
            }
        } catch (_: Exception) {}

        // 2. Scanned documents from scans directory (merge with any saved progress)
        val scansDir = File(context.filesDir, "scans")
        if (scansDir.exists() && scansDir.isDirectory) {
            val files = scansDir.listFiles { f -> f.extension.equals("pdf", ignoreCase = true) } ?: emptyArray()
            files.sortedByDescending { it.lastModified() }.forEach { f ->
                val uriStr = Uri.fromFile(f).toString()
                val savedProgress = recentMap[uriStr]
                list.add(
                    StoredDocument(
                        uriString = uriStr,
                        title = f.nameWithoutExtension,
                        isScanned = true,
                        timestamp = f.lastModified(),
                        lastPage = savedProgress?.lastPage ?: 1,
                        totalPages = savedProgress?.totalPages ?: 0,
                        scrollOffset = savedProgress?.scrollOffset ?: 0
                    )
                )
            }
        }

        // 3. Add imported / non-scanned documents from preferences
        for ((_, doc) in recentMap) {
            if (list.none { it.uriString == doc.uriString }) {
                list.add(doc)
            }
        }

        return list.sortedByDescending { it.timestamp }
    }

    fun addOrUpdateDocument(
        uri: Uri,
        title: String? = null,
        isScanned: Boolean = false,
        page: Int = 1,
        total: Int = 0,
        offset: Int = 0
    ) {
        val resolvedTitle = if (!title.isNullOrBlank() && !title.startsWith("document:")) {
            title
        } else {
            resolveDisplayName(context, uri)
        }

        val docs = getDocuments().toMutableList()
        val existingIndex = docs.indexOfFirst { it.uriString == uri.toString() }
        val existing = if (existingIndex != -1) docs[existingIndex] else null

        // Preserve previous reading position if new page is 1 and previous was > 1
        val resolvedPage = if (page > 1) page else (existing?.lastPage ?: 1)
        val resolvedTotal = if (total > 0) total else (existing?.totalPages ?: 0)
        val resolvedOffset = if (page > 1) offset else (existing?.scrollOffset ?: 0)

        val doc = StoredDocument(
            uriString = uri.toString(),
            title = resolvedTitle,
            isScanned = isScanned,
            timestamp = System.currentTimeMillis(),
            lastPage = resolvedPage,
            totalPages = resolvedTotal,
            scrollOffset = resolvedOffset
        )

        if (existingIndex != -1) {
            docs[existingIndex] = doc
        } else {
            docs.add(0, doc)
        }

        saveDocuments(docs)
    }

    fun getLastPage(uri: Uri): Int {
        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            val uriStr = uri.toString()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                if (obj.getString("uri") == uriStr) {
                    return obj.optInt("lastPage", 1)
                }
            }
        } catch (_: Exception) {}
        return 1
    }

    fun getLastScrollOffset(uri: Uri): Int {
        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            val uriStr = uri.toString()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                if (obj.getString("uri") == uriStr) {
                    return obj.optInt("scrollOffset", 0)
                }
            }
        } catch (_: Exception) {}
        return 0
    }

    fun updateProgress(uri: Uri, page: Int, total: Int, offset: Int = 0) {
        if (page < 1) return
        val docs = getDocuments().toMutableList()
        val existingIndex = docs.indexOfFirst { it.uriString == uri.toString() }
        if (existingIndex != -1) {
            val existing = docs[existingIndex]
            docs[existingIndex] = existing.copy(
                lastPage = page,
                totalPages = if (total > 0) total else existing.totalPages,
                scrollOffset = offset,
                timestamp = System.currentTimeMillis()
            )
            saveDocuments(docs)
        } else {
            addOrUpdateDocument(uri = uri, page = page, total = total, offset = offset)
        }
    }

    private fun saveDocuments(docs: List<StoredDocument>) {
        val limited = docs.take(50)
        val arr = JSONArray()
        for (d in limited) {
            val obj = JSONObject().apply {
                put("uri", d.uriString)
                put("title", d.title)
                put("isScanned", d.isScanned)
                put("timestamp", d.timestamp)
                put("lastPage", d.lastPage)
                put("totalPages", d.totalPages)
                put("scrollOffset", d.scrollOffset)
            }
            arr.put(obj)
        }
        prefs.edit().putString("recent_docs", arr.toString()).apply()
    }

    fun deleteDocument(doc: StoredDocument): Boolean {
        if (doc.isScanned && doc.uri.scheme == "file") {
            try {
                val f = File(doc.uri.path ?: "")
                if (f.exists()) f.delete()
            } catch (_: Exception) {}
        }

        // Clean up cached thumbnail and annotations
        try {
            com.otium.lab.library.util.PdfThumbnailLoader.deleteThumbnail(context, doc.uri)
            com.otium.lab.pdf.store.AnnotationStore(context).clearAllHighlights(doc.uri)
        } catch (_: Exception) {}

        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            val newArr = JSONArray()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                if (obj.getString("uri") != doc.uriString) {
                    newArr.put(obj)
                }
            }
            prefs.edit().putString("recent_docs", newArr.toString()).apply()
            return true
        } catch (_: Exception) {
            return false
        }
    }

    fun renameDocument(doc: StoredDocument, newTitle: String): Boolean {
        val cleanTitle = newTitle.trim()
        if (cleanTitle.isBlank()) return false

        val docs = getDocuments().toMutableList()
        val index = docs.indexOfFirst { it.uriString == doc.uriString }
        if (index == -1) return false

        val newUri = if (doc.isScanned && doc.uri.scheme == "file") {
            try {
                val oldFile = File(doc.uri.path ?: "")
                if (oldFile.exists()) {
                    val safeName = "${cleanTitle.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"
                    val newFile = File(oldFile.parentFile, safeName)
                    if (oldFile.renameTo(newFile)) {
                        Uri.fromFile(newFile)
                    } else doc.uri
                } else doc.uri
            } catch (_: Exception) {
                doc.uri
            }
        } else {
            doc.uri
        }

        docs[index] = doc.copy(
            title = cleanTitle,
            uriString = newUri.toString()
        )
        saveDocuments(docs)
        return true
    }

    fun exportToDownloads(doc: StoredDocument): Boolean {
        return try {
            val resolver = context.contentResolver
            val inputStream = if (doc.uri.scheme == "file") {
                File(doc.uri.path ?: "").inputStream()
            } else {
                resolver.openInputStream(doc.uri)
            } ?: return false

            val filename = "${doc.title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

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
