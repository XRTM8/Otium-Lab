package com.otium.lab.library

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class StoredDocument(
    val uriString: String,
    val title: String,
    val isScanned: Boolean,
    val timestamp: Long
) {
    val uri: Uri get() = Uri.parse(uriString)
}

class DocumentStore(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("otium_doc_store", Context.MODE_PRIVATE)

    fun getDocuments(): List<StoredDocument> {
        val list = mutableListOf<StoredDocument>()

        // 1. First add all scanned files from scans/ directory
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

        // 2. Add saved recents from SharedPreferences
        val jsonStr = prefs.getString("recent_docs", "[]") ?: "[]"
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val uriStr = obj.getString("uri")
                // Avoid duplicates
                if (list.none { it.uriString == uriStr }) {
                    list.add(
                        StoredDocument(
                            uriString = uriStr,
                            title = obj.getString("title"),
                            isScanned = obj.optBoolean("isScanned", false),
                            timestamp = obj.optLong("timestamp", System.currentTimeMillis())
                        )
                    )
                }
            }
        } catch (_: Exception) {}

        return list.sortedByDescending { it.timestamp }
    }

    fun addRecentDocument(uri: Uri, title: String, isScanned: Boolean = false) {
        val docs = getDocuments().toMutableList()
        // Remove if exists
        docs.removeAll { it.uriString == uri.toString() }
        // Prepend
        docs.add(
            0,
            StoredDocument(
                uriString = uri.toString(),
                title = title,
                isScanned = isScanned,
                timestamp = System.currentTimeMillis()
            )
        )

        // Save up to 50 recent documents
        val limited = docs.take(50)
        val arr = JSONArray()
        for (doc in limited) {
            val obj = JSONObject().apply {
                put("uri", doc.uriString)
                put("title", doc.title)
                put("isScanned", doc.isScanned)
                put("timestamp", doc.timestamp)
            }
            arr.put(obj)
        }
        prefs.edit().putString("recent_docs", arr.toString()).apply()
    }

    fun deleteDocument(doc: StoredDocument): Boolean {
        if (doc.isScanned && doc.uri.scheme == "file") {
            try {
                val f = File(doc.uri.path!!)
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
