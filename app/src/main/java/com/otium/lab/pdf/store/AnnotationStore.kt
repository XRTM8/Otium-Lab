package com.otium.lab.pdf.store

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import com.otium.lab.core.database.OtiumDbHelper
import com.otium.lab.pdf.model.NormalizedRect
import com.otium.lab.pdf.model.PdfBookmark
import com.otium.lab.pdf.model.PdfHighlight
import org.json.JSONArray

class AnnotationStore(context: Context) {
    private val dbHelper = OtiumDbHelper.getInstance(context)

    private fun Cursor.readHighlights(): List<PdfHighlight> {
        val list = mutableListOf<PdfHighlight>()
        val idIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_ID)
        val pageIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_PAGE)
        val textIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TEXT)
        val colorIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_COLOR)
        val boundsIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_BOUNDS)
        val timeIdx = getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TIMESTAMP)
        val noteIdx = getColumnIndex(OtiumDbHelper.COL_HL_NOTE)

        while (moveToNext()) {
            val bounds = mutableListOf<NormalizedRect>()
            try {
                val arr = JSONArray(getString(boundsIdx))
                for (i in 0 until arr.length()) {
                    bounds.add(NormalizedRect.fromJson(arr.getJSONObject(i)))
                }
            } catch (_: Exception) {}

            list.add(
                PdfHighlight(
                    id = getString(idIdx),
                    pageIndex = getInt(pageIdx),
                    text = getString(textIdx),
                    colorArgb = getLong(colorIdx),
                    bounds = bounds,
                    timestamp = getLong(timeIdx),
                    note = if (noteIdx >= 0) getString(noteIdx) ?: "" else ""
                )
            )
        }
        return list
    }

    fun getHighlights(uri: Uri, pageIndex: Int): List<PdfHighlight> {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            null,
            "${OtiumDbHelper.COL_HL_URI} = ? AND ${OtiumDbHelper.COL_HL_PAGE} = ?",
            arrayOf(uri.toString(), pageIndex.toString()),
            null,
            null,
            "${OtiumDbHelper.COL_HL_TIMESTAMP} ASC"
        )
        return cursor.use { it.readHighlights() }
    }

    fun getAllHighlights(uri: Uri): List<PdfHighlight> {
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            null,
            "${OtiumDbHelper.COL_HL_URI} = ?",
            arrayOf(uri.toString()),
            null,
            null,
            "${OtiumDbHelper.COL_HL_TIMESTAMP} ASC"
        )
        return cursor.use { it.readHighlights() }
    }

    fun saveHighlight(uri: Uri, highlight: PdfHighlight) {
        val db = dbHelper.writableDatabase
        val boundsArr = JSONArray()
        for (b in highlight.bounds) {
            boundsArr.put(b.toJson())
        }
        val values = ContentValues().apply {
            put(OtiumDbHelper.COL_HL_ID, highlight.id)
            put(OtiumDbHelper.COL_HL_URI, uri.toString())
            put(OtiumDbHelper.COL_HL_PAGE, highlight.pageIndex)
            put(OtiumDbHelper.COL_HL_TEXT, highlight.text)
            put(OtiumDbHelper.COL_HL_COLOR, highlight.colorArgb)
            put(OtiumDbHelper.COL_HL_BOUNDS, boundsArr.toString())
            put(OtiumDbHelper.COL_HL_TIMESTAMP, highlight.timestamp)
            put(OtiumDbHelper.COL_HL_NOTE, highlight.note.trim())
        }
        db.insertWithOnConflict(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    fun deleteHighlight(uri: Uri, highlightId: String) {
        val db = dbHelper.writableDatabase
        db.delete(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            "${OtiumDbHelper.COL_HL_ID} = ?",
            arrayOf(highlightId)
        )
    }

    fun clearAllHighlights(uri: Uri) {
        val db = dbHelper.writableDatabase
        db.delete(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            "${OtiumDbHelper.COL_HL_URI} = ?",
            arrayOf(uri.toString())
        )
        db.delete(
            OtiumDbHelper.TABLE_BOOKMARKS,
            "${OtiumDbHelper.COL_BM_URI} = ?",
            arrayOf(uri.toString())
        )
    }

    fun getBookmarks(uri: Uri): List<PdfBookmark> {
        val list = mutableListOf<PdfBookmark>()
        val db = dbHelper.readableDatabase
        val cursor = db.query(
            OtiumDbHelper.TABLE_BOOKMARKS,
            null,
            "${OtiumDbHelper.COL_BM_URI} = ?",
            arrayOf(uri.toString()),
            null,
            null,
            "${OtiumDbHelper.COL_BM_PAGE} ASC"
        )
        cursor.use { c ->
            val idIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_BM_ID)
            val pageIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_BM_PAGE)
            val labelIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_BM_LABEL)
            val timeIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_BM_TIMESTAMP)
            while (c.moveToNext()) {
                list.add(
                    PdfBookmark(
                        id = c.getString(idIdx),
                        pageIndex = c.getInt(pageIdx),
                        label = c.getString(labelIdx) ?: "",
                        timestamp = c.getLong(timeIdx)
                    )
                )
            }
        }
        return list
    }

    fun toggleBookmark(uri: Uri, pageIndex: Int, label: String = ""): Boolean {
        val db = dbHelper.writableDatabase
        val existing = db.query(
            OtiumDbHelper.TABLE_BOOKMARKS,
            arrayOf(OtiumDbHelper.COL_BM_ID),
            "${OtiumDbHelper.COL_BM_URI} = ? AND ${OtiumDbHelper.COL_BM_PAGE} = ?",
            arrayOf(uri.toString(), pageIndex.toString()),
            null,
            null,
            null
        ).use { c -> if (c.moveToFirst()) c.getString(0) else null }

        return if (existing != null) {
            db.delete(OtiumDbHelper.TABLE_BOOKMARKS, "${OtiumDbHelper.COL_BM_ID} = ?", arrayOf(existing))
            false
        } else {
            val bm = PdfBookmark(pageIndex = pageIndex, label = label.trim())
            val values = ContentValues().apply {
                put(OtiumDbHelper.COL_BM_ID, bm.id)
                put(OtiumDbHelper.COL_BM_URI, uri.toString())
                put(OtiumDbHelper.COL_BM_PAGE, bm.pageIndex)
                put(OtiumDbHelper.COL_BM_LABEL, bm.label)
                put(OtiumDbHelper.COL_BM_TIMESTAMP, bm.timestamp)
            }
            db.insertWithOnConflict(OtiumDbHelper.TABLE_BOOKMARKS, null, values, SQLiteDatabase.CONFLICT_REPLACE)
            true
        }
    }

    fun deleteBookmark(bookmarkId: String) {
        val db = dbHelper.writableDatabase
        db.delete(OtiumDbHelper.TABLE_BOOKMARKS, "${OtiumDbHelper.COL_BM_ID} = ?", arrayOf(bookmarkId))
    }
}
