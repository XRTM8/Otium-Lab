package com.otium.lab.library

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
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
    val totalPages: Int = 0
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

        // 1. Scanned documents from scans directory
        val scansDir = File(context.filesDir, "scans")
        if (scansDir.exists() && scansDir.isDirectory) {
            val files = scansDir.listFiles { f -> f.extension.equals("pdf", ignoreCase = true) } ?: emptyArray()
            files.sortedByDescending { it.lastModified() }.forEach { f ->
                list.add(
                    StoredDocument(
                        uriString = Uri.fromFile(f).toString(),
                        title = f.nameWithoutExtension,
                        isScanned = true,
                        timestamp = f.lastModified()
                    )
                )
            }
        }

        // 2. Imported / Opened documents from preferences
        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val uriStr = obj.getString("uri")
                if (list.none { it.uriString == uriStr }) {
                    list.add(
                        StoredDocument(
                            uriString = uriStr,
                            title = obj.optString("title", "مستند PDF"),
                            isScanned = obj.optBoolean("isScanned", false),
                            timestamp = obj.optLong("timestamp", System.currentTimeMillis()),
                            lastPage = obj.optInt("lastPage", 1),
                            totalPages = obj.optInt("totalPages", 0)
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        return list.sortedByDescending { it.timestamp }
    }

    fun addOrUpdateDocument(uri: Uri, title: String? = null, isScanned: Boolean = false, page: Int = 1, total: Int = 0) {
        val resolvedTitle = if (!title.isNullOrBlank() && !title.startsWith("document:")) {
            title
        } else {
            resolveDisplayName(context, uri)
        }

        val docs = getDocuments().toMutableList()
        val existingIndex = docs.indexOfFirst { it.uriString == uri.toString() }

        val doc = StoredDocument(
            uriString = uri.toString(),
            title = resolvedTitle,
            isScanned = isScanned,
            timestamp = System.currentTimeMillis(),
            lastPage = page,
            totalPages = total
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

    fun updateProgress(uri: Uri, page: Int, total: Int) {
        val docs = getDocuments().toMutableList()
        val existingIndex = docs.indexOfFirst { it.uriString == uri.toString() }
        if (existingIndex != -1) {
            val existing = docs[existingIndex]
            docs[existingIndex] = existing.copy(
                lastPage = page,
                totalPages = if (total > 0) total else existing.totalPages,
                timestamp = System.currentTimeMillis()
            )
            saveDocuments(docs)
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
}
