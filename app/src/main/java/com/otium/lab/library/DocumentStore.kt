package com.otium.lab.library

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import com.otium.lab.core.database.OtiumDbHelper
import com.otium.lab.library.util.DocumentExporter
import com.otium.lab.library.util.DocumentNameResolver
import com.otium.lab.library.util.PdfThumbnailLoader
import com.otium.lab.pdf.store.AnnotationStore
import java.io.File

class DocumentStore(private val context: Context) {

    private val dbHelper = OtiumDbHelper.getInstance(context)

    companion object {
        fun resolveDisplayName(context: Context, uri: Uri): String =
            DocumentNameResolver.resolveDisplayName(context, uri)
    }

    fun getStorageUsageBytes(): Long {
        var total = 0L
        try {
            val scansDir = File(context.filesDir, "scans")
            if (scansDir.exists()) scansDir.listFiles()?.forEach { total += it.length() }
            val cacheDir = context.cacheDir
            if (cacheDir.exists()) cacheDir.walkTopDown().forEach { total += it.length() }
        } catch (_: Exception) {}
        return total
    }

    fun clearTemporaryCache() {
        try {
            val cutoff = System.currentTimeMillis() - 60 * 60 * 1000L
            context.cacheDir.listFiles()?.forEach { entry ->
                if (entry.name == "scan_session" && entry.isDirectory) {
                    entry.listFiles()?.forEach { f ->
                        if (f.lastModified() < cutoff) f.delete()
                    }
                } else {
                    entry.deleteRecursively()
                }
            }
        } catch (_: Exception) {}
    }

    private fun Cursor.toStoredDocument(): StoredDocument = StoredDocument(
        uriString = getString(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_URI)),
        title = getString(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_TITLE)),
        isScanned = getInt(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_IS_SCANNED)) == 1,
        timestamp = getLong(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_TIMESTAMP)),
        lastPage = getInt(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_LAST_PAGE)),
        totalPages = getInt(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_TOTAL_PAGES)),
        scrollOffset = getInt(getColumnIndexOrThrow(OtiumDbHelper.COL_DOC_SCROLL_OFFSET))
    )

    fun getDocuments(): List<StoredDocument> {
        val list = mutableListOf<StoredDocument>()
        val recentMap = mutableMapOf<String, StoredDocument>()

        val db = dbHelper.readableDatabase
        val cursor = db.query(OtiumDbHelper.TABLE_DOCUMENTS, null, null, null, null, null, "${OtiumDbHelper.COL_DOC_TIMESTAMP} DESC")
        cursor.use { c ->
            while (c.moveToNext()) {
                val doc = c.toStoredDocument()
                recentMap[doc.uriString] = doc
            }
        }

        val scansDir = File(context.filesDir, "scans")
        if (scansDir.exists() && scansDir.isDirectory) {
            val files = scansDir.listFiles { f -> f.extension.equals("pdf", ignoreCase = true) } ?: emptyArray()
            files.sortedByDescending { it.lastModified() }.forEach { f ->
                val uriStr = Uri.fromFile(f).toString()
                val saved = recentMap[uriStr]
                list.add(
                    StoredDocument(
                        uriString = uriStr,
                        title = saved?.title?.ifBlank { f.nameWithoutExtension } ?: f.nameWithoutExtension,
                        isScanned = true,
                        timestamp = saved?.timestamp ?: f.lastModified(),
                        lastPage = saved?.lastPage ?: 1,
                        totalPages = saved?.totalPages ?: 0,
                        scrollOffset = saved?.scrollOffset ?: 0
                    )
                )
            }
        }

        for ((_, doc) in recentMap) {
            if (list.none { it.uriString == doc.uriString }) {
                if (doc.uri.scheme == "file" && !File(doc.uri.path ?: "").exists()) continue
                list.add(doc)
            }
        }
        return list.sortedByDescending { it.timestamp }
    }

    fun addOrUpdateDocument(uri: Uri, title: String? = null, isScanned: Boolean = false, page: Int = 1, total: Int = 0, offset: Int = 0) {
        val resolvedTitle = if (!title.isNullOrBlank() && !title.startsWith("document:")) title else resolveDisplayName(context, uri)
        val existing = getDocument(uri)
        val resolvedPage = if (page > 1) page else (existing?.lastPage ?: 1)
        val resolvedTotal = if (total > 0) total else (existing?.totalPages ?: 0)
        val resolvedOffset = if (page > 1) offset else (existing?.scrollOffset ?: 0)

        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put(OtiumDbHelper.COL_DOC_URI, uri.toString())
            put(OtiumDbHelper.COL_DOC_TITLE, resolvedTitle)
            put(OtiumDbHelper.COL_DOC_IS_SCANNED, if (isScanned) 1 else 0)
            put(OtiumDbHelper.COL_DOC_TIMESTAMP, System.currentTimeMillis())
            put(OtiumDbHelper.COL_DOC_LAST_PAGE, resolvedPage)
            put(OtiumDbHelper.COL_DOC_TOTAL_PAGES, resolvedTotal)
            put(OtiumDbHelper.COL_DOC_SCROLL_OFFSET, resolvedOffset)
        }
        db.insertWithOnConflict(OtiumDbHelper.TABLE_DOCUMENTS, null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun getDocument(uri: Uri): StoredDocument? {
        val db = dbHelper.readableDatabase
        val cursor = db.query(OtiumDbHelper.TABLE_DOCUMENTS, null, "${OtiumDbHelper.COL_DOC_URI} = ?", arrayOf(uri.toString()), null, null, null)
        return cursor.use { if (it.moveToFirst()) it.toStoredDocument() else null }
    }

    fun getLastPage(uri: Uri): Int = getDocument(uri)?.lastPage ?: 1

    fun getLastScrollOffset(uri: Uri): Int = getDocument(uri)?.scrollOffset ?: 0

    fun updateProgress(uri: Uri, page: Int, total: Int, offset: Int = 0) {
        if (page < 1) return
        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put(OtiumDbHelper.COL_DOC_LAST_PAGE, page)
            if (total > 0) put(OtiumDbHelper.COL_DOC_TOTAL_PAGES, total)
            put(OtiumDbHelper.COL_DOC_SCROLL_OFFSET, offset)
            put(OtiumDbHelper.COL_DOC_TIMESTAMP, System.currentTimeMillis())
        }
        val updated = db.update(OtiumDbHelper.TABLE_DOCUMENTS, values, "${OtiumDbHelper.COL_DOC_URI} = ?", arrayOf(uri.toString()))
        if (updated == 0) addOrUpdateDocument(uri = uri, page = page, total = total, offset = offset)
    }

    fun deleteDocument(doc: StoredDocument): Boolean {
        if (doc.isScanned && doc.uri.scheme == "file") {
            try { File(doc.uri.path ?: "").takeIf { it.exists() }?.delete() } catch (_: Exception) {}
        }
        try {
            PdfThumbnailLoader.deleteThumbnail(context, doc.uri)
            AnnotationStore(context).clearAllHighlights(doc.uri)
        } catch (_: Exception) {}
        val db = dbHelper.writableDatabase
        return db.delete(OtiumDbHelper.TABLE_DOCUMENTS, "${OtiumDbHelper.COL_DOC_URI} = ?", arrayOf(doc.uriString)) > 0
    }

    fun renameDocument(doc: StoredDocument, newTitle: String): Boolean {
        val cleanTitle = newTitle.trim().ifBlank { return false }
        val newUri = if (doc.isScanned && doc.uri.scheme == "file") {
            try {
                val oldFile = File(doc.uri.path ?: "")
                if (oldFile.exists()) {
                    val baseSanitized = cleanTitle.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")
                        .ifBlank { "document" }
                    var candidate = File(oldFile.parentFile, "$baseSanitized.pdf")
                    var suffix = 1
                    while (candidate.exists() && candidate.absolutePath != oldFile.absolutePath) {
                        candidate = File(oldFile.parentFile, "${baseSanitized}_$suffix.pdf")
                        suffix++
                    }
                    if (candidate.absolutePath == oldFile.absolutePath || oldFile.renameTo(candidate)) {
                        Uri.fromFile(candidate)
                    } else {
                        doc.uri
                    }
                } else doc.uri
            } catch (_: Exception) { doc.uri }
        } else doc.uri

        val db = dbHelper.writableDatabase
        var updatedRows = 0
        db.beginTransaction()
        try {
            val values = ContentValues().apply {
                put(OtiumDbHelper.COL_DOC_TITLE, cleanTitle)
                put(OtiumDbHelper.COL_DOC_URI, newUri.toString())
            }
            updatedRows = db.update(OtiumDbHelper.TABLE_DOCUMENTS, values, "${OtiumDbHelper.COL_DOC_URI} = ?", arrayOf(doc.uriString))
            if (updatedRows == 0) {
                val insertValues = ContentValues().apply {
                    put(OtiumDbHelper.COL_DOC_URI, newUri.toString())
                    put(OtiumDbHelper.COL_DOC_TITLE, cleanTitle)
                    put(OtiumDbHelper.COL_DOC_IS_SCANNED, if (doc.isScanned) 1 else 0)
                    put(OtiumDbHelper.COL_DOC_TIMESTAMP, doc.timestamp)
                    put(OtiumDbHelper.COL_DOC_LAST_PAGE, doc.lastPage)
                    put(OtiumDbHelper.COL_DOC_TOTAL_PAGES, doc.totalPages)
                    put(OtiumDbHelper.COL_DOC_SCROLL_OFFSET, doc.scrollOffset)
                }
                if (db.insertWithOnConflict(OtiumDbHelper.TABLE_DOCUMENTS, null, insertValues, SQLiteDatabase.CONFLICT_REPLACE) != -1L) {
                    updatedRows = 1
                }
            }
            if (newUri.toString() != doc.uriString) {
                val hlValues = ContentValues().apply {
                    put(OtiumDbHelper.COL_HL_URI, newUri.toString())
                }
                db.update(OtiumDbHelper.TABLE_HIGHLIGHTS, hlValues, "${OtiumDbHelper.COL_HL_URI} = ?", arrayOf(doc.uriString))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        if (updatedRows > 0 && newUri != doc.uri) {
            PdfThumbnailLoader.migrateThumbnail(context, doc.uri, newUri)
        }
        return updatedRows > 0
    }

    fun exportToDownloads(doc: StoredDocument): Boolean =
        DocumentExporter.exportToDownloads(context, doc.uri, doc.title)
}
