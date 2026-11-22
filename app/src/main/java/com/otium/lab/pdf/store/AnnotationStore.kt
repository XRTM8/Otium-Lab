package com.otium.lab.pdf.store

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import com.otium.lab.pdf.model.NormalizedRect
import com.otium.lab.pdf.model.PdfHighlight
import org.json.JSONArray
import org.json.JSONObject

class AnnotationStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("otium_pdf_annotations", Context.MODE_PRIVATE)

    fun getHighlights(uri: Uri, pageIndex: Int): List<PdfHighlight> {
        return getAllHighlights(uri).filter { it.pageIndex == pageIndex }
    }

    fun getAllHighlights(uri: Uri): List<PdfHighlight> {
        val jsonStr = prefs.getString(uri.toString(), "[]") ?: "[]"
        val list = mutableListOf<PdfHighlight>()
        try {
            val arr = JSONArray(jsonStr)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val boundsArr = obj.optJSONArray("bounds") ?: JSONArray()
                val bounds = mutableListOf<NormalizedRect>()
                for (j in 0 until boundsArr.length()) {
                    bounds.add(NormalizedRect.fromJson(boundsArr.getJSONObject(j)))
                }
                list.add(
                    PdfHighlight(
                        id = obj.optString("id"),
                        pageIndex = obj.optInt("pageIndex"),
                        text = obj.optString("text"),
                        colorArgb = obj.optLong("colorArgb"),
                        bounds = bounds,
                        timestamp = obj.optLong("timestamp")
                    )
                )
            }
        } catch (_: Exception) {}
        return list
    }

    fun saveHighlight(uri: Uri, highlight: PdfHighlight) {
        val current = getAllHighlights(uri).toMutableList()
        current.removeAll { it.id == highlight.id }
        current.add(highlight)
        saveList(uri, current)
    }

    fun deleteHighlight(uri: Uri, highlightId: String) {
        val current = getAllHighlights(uri).toMutableList()
        current.removeAll { it.id == highlightId }
        saveList(uri, current)
    }

    private fun saveList(uri: Uri, list: List<PdfHighlight>) {
        val arr = JSONArray()
        for (h in list) {
            val obj = JSONObject().apply {
                put("id", h.id)
                put("pageIndex", h.pageIndex)
                put("text", h.text)
                put("colorArgb", h.colorArgb)
                put("timestamp", h.timestamp)
                val boundsArr = JSONArray()
                for (b in h.bounds) {
                    boundsArr.put(b.toJson())
                }
                put("bounds", boundsArr)
            }
            arr.put(obj)
        }
        prefs.edit().putString(uri.toString(), arr.toString()).apply()
    }
}
