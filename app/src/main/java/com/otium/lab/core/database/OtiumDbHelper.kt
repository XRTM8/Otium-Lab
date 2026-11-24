package com.otium.lab.core.database

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import org.json.JSONArray
import java.io.File

class OtiumDbHelper(private val context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        const val DATABASE_NAME = "otium_core.db"
        const val DATABASE_VERSION = 1

        const val TABLE_DOCUMENTS = "documents"
        const val COL_DOC_URI = "uri_string"
        const val COL_DOC_TITLE = "title"
        const val COL_DOC_IS_SCANNED = "is_scanned"
        const val COL_DOC_TIMESTAMP = "timestamp"
        const val COL_DOC_LAST_PAGE = "last_page"
        const val COL_DOC_TOTAL_PAGES = "total_pages"
        const val COL_DOC_SCROLL_OFFSET = "scroll_offset"

        const val TABLE_HIGHLIGHTS = "highlights"
        const val COL_HL_ID = "id"
        const val COL_HL_URI = "uri_string"
        const val COL_HL_PAGE = "page_index"
        const val COL_HL_TEXT = "text"
        const val COL_HL_COLOR = "color_argb"
        const val COL_HL_BOUNDS = "bounds_json"
        const val COL_HL_TIMESTAMP = "timestamp"

        @Volatile
        private var instance: OtiumDbHelper? = null

        fun getInstance(context: Context): OtiumDbHelper =
            instance ?: synchronized(this) {
                instance ?: OtiumDbHelper(context.applicationContext).also { instance = it }
            }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_DOCUMENTS (
                $COL_DOC_URI TEXT PRIMARY KEY,
                $COL_DOC_TITLE TEXT NOT NULL,
                $COL_DOC_IS_SCANNED INTEGER NOT NULL DEFAULT 0,
                $COL_DOC_TIMESTAMP INTEGER NOT NULL,
                $COL_DOC_LAST_PAGE INTEGER NOT NULL DEFAULT 1,
                $COL_DOC_TOTAL_PAGES INTEGER NOT NULL DEFAULT 0,
                $COL_DOC_SCROLL_OFFSET INTEGER NOT NULL DEFAULT 0
            );
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_docs_time ON $TABLE_DOCUMENTS ($COL_DOC_TIMESTAMP DESC);")

        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_HIGHLIGHTS (
                $COL_HL_ID TEXT PRIMARY KEY,
                $COL_HL_URI TEXT NOT NULL,
                $COL_HL_PAGE INTEGER NOT NULL,
                $COL_HL_TEXT TEXT NOT NULL,
                $COL_HL_COLOR INTEGER NOT NULL,
                $COL_HL_BOUNDS TEXT NOT NULL,
                $COL_HL_TIMESTAMP INTEGER NOT NULL
            );
            """.trimIndent()
        )
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_hl_uri_page ON $TABLE_HIGHLIGHTS ($COL_HL_URI, $COL_HL_PAGE);")

        migrateFromPreferences(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Future schema migrations
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        migrateFromPreferences(db)
    }

    private fun migrateFromPreferences(db: SQLiteDatabase) {
        try {
            val docPrefs = context.getSharedPreferences("otium_doc_store", Context.MODE_PRIVATE)
            val jsonStr = docPrefs.getString("recent_docs", null)
            if (!jsonStr.isNullOrBlank()) {
                val arr = JSONArray(jsonStr)
                db.beginTransaction()
                try {
                    val stmt = db.compileStatement(
                        """
                        INSERT OR REPLACE INTO $TABLE_DOCUMENTS 
                        ($COL_DOC_URI, $COL_DOC_TITLE, $COL_DOC_IS_SCANNED, $COL_DOC_TIMESTAMP, $COL_DOC_LAST_PAGE, $COL_DOC_TOTAL_PAGES, $COL_DOC_SCROLL_OFFSET)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """.trimIndent()
                    )
                    for (i in 0 until arr.length()) {
                        val obj = arr.getJSONObject(i)
                        stmt.bindString(1, obj.optString("uri", ""))
                        stmt.bindString(2, obj.optString("title", "مستند PDF"))
                        stmt.bindLong(3, if (obj.optBoolean("isScanned", false)) 1L else 0L)
                        stmt.bindLong(4, obj.optLong("timestamp", System.currentTimeMillis()))
                        stmt.bindLong(5, obj.optLong("lastPage", 1L))
                        stmt.bindLong(6, obj.optLong("totalPages", 0L))
                        stmt.bindLong(7, obj.optLong("scrollOffset", 0L))
                        stmt.executeInsert()
                    }
                    db.setTransactionSuccessful()
                    docPrefs.edit().remove("recent_docs").apply()
                } finally {
                    db.endTransaction()
                }
            }
        } catch (_: Exception) {}

        try {
            val annoPrefs = context.getSharedPreferences("otium_pdf_annotations", Context.MODE_PRIVATE)
            val allEntries = annoPrefs.all
            if (allEntries.isNotEmpty()) {
                db.beginTransaction()
                try {
                    val stmt = db.compileStatement(
                        """
                        INSERT OR REPLACE INTO $TABLE_HIGHLIGHTS
                        ($COL_HL_ID, $COL_HL_URI, $COL_HL_PAGE, $COL_HL_TEXT, $COL_HL_COLOR, $COL_HL_BOUNDS, $COL_HL_TIMESTAMP)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """.trimIndent()
                    )
                    for ((uriKey, value) in allEntries) {
                        val arrStr = value as? String ?: continue
                        val arr = JSONArray(arrStr)
                        for (i in 0 until arr.length()) {
                            val obj = arr.getJSONObject(i)
                            stmt.bindString(1, obj.optString("id", java.util.UUID.randomUUID().toString()))
                            stmt.bindString(2, uriKey)
                            stmt.bindLong(3, obj.optLong("pageIndex", 0L))
                            stmt.bindString(4, obj.optString("text", ""))
                            stmt.bindLong(5, obj.optLong("colorArgb", 0L))
                            stmt.bindString(6, (obj.optJSONArray("bounds") ?: JSONArray()).toString())
                            stmt.bindLong(7, obj.optLong("timestamp", System.currentTimeMillis()))
                            stmt.executeInsert()
                        }
                    }
                    db.setTransactionSuccessful()
                    annoPrefs.edit().clear().apply()
                } finally {
                    db.endTransaction()
                }
            }
        } catch (_: Exception) {}
    }
}
