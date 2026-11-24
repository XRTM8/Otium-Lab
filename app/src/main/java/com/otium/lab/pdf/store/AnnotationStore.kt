package com.otium.lab.pdf.store

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import com.otium.lab.core.database.OtiumDbHelper
import com.otium.lab.pdf.model.NormalizedRect
import com.otium.lab.pdf.model.PdfHighlight
import org.json.JSONArray

class AnnotationStore(context: Context) {
    private val dbHelper = OtiumDbHelper.getInstance(context)

    fun getHighlights(uri: Uri, pageIndex: Int): List<PdfHighlight> {
        val list = mutableListOf<PdfHighlight>()
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
        cursor.use { c ->
            val idIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_ID)
            val pageIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_PAGE)
            val textIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TEXT)
            val colorIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_COLOR)
            val boundsIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_BOUNDS)
            val timeIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TIMESTAMP)

            while (c.moveToNext()) {
                val bounds = mutableListOf<NormalizedRect>()
                try {
                    val arr = JSONArray(c.getString(boundsIdx))
                    for (i in 0 until arr.length()) {
                        bounds.add(NormalizedRect.fromJson(arr.getJSONObject(i)))
                    }
                } catch (_: Exception) {}

                list.add(
                    PdfHighlight(
                        id = c.getString(idIdx),
                        pageIndex = c.getInt(pageIdx),
                        text = c.getString(textIdx),
                        colorArgb = c.getLong(colorIdx),
                        bounds = bounds,
                        timestamp = c.getLong(timeIdx)
                    )
                )
            }
        }
        return list
    }

    fun getAllHighlights(uri: Uri): List<PdfHighlight> {
        val list = mutableListOf<PdfHighlight>()
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
        cursor.use { c ->
            val idIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_ID)
            val pageIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_PAGE)
            val textIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TEXT)
            val colorIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_COLOR)
            val boundsIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_BOUNDS)
            val timeIdx = c.getColumnIndexOrThrow(OtiumDbHelper.COL_HL_TIMESTAMP)

            while (c.moveToNext()) {
                val bounds = mutableListOf<NormalizedRect>()
                try {
                    val arr = JSONArray(c.getString(boundsIdx))
                    for (i in 0 until arr.length()) {
                        bounds.add(NormalizedRect.fromJson(arr.getJSONObject(i)))
                    }
                } catch (_: Exception) {}

                list.add(
                    PdfHighlight(
                        id = c.getString(idIdx),
                        pageIndex = c.getInt(pageIdx),
                        text = c.getString(textIdx),
                        colorArgb = c.getLong(colorIdx),
                        bounds = bounds,
                        timestamp = c.getLong(timeIdx)
                    )
                )
            }
        }
        return list
    }

    fun saveHighlight(uri: Uri, highlight: PdfHighlight) {
        val db = dbHelper.writableDatabase
        val values = ContentValues().apply {
            put(OtiumDbHelper.COL_HL_ID, highlight.id)
            put(OtiumDbHelper.COL_HL_URI, uri.toString())
            put(OtiumDbHelper.COL_HL_PAGE, highlight.pageIndex)
            put(OtiumDbHelper.COL_HL_TEXT, highlight.text)
            put(OtiumDbHelper.COL_HL_COLOR, highlight.colorArgb)
            val boundsArr = JSONArray()
            for (b in highlight.bounds) {
                boundsArr.put(b.toJson())
            }
            put(OtiumDbHelper.COL_HL_BOUNDS, boundsArr.toString())
            put(OtiumDbHelper.COL_HL_TIMESTAMP, highlight.timestamp)
        }
        db.insertWithOnConflict(
            OtiumDbHelper.TABLE_HIGHLIGHTS,
            null,
            values,
            android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE
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
    }
}
