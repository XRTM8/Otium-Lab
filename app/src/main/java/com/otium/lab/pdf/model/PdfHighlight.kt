package com.otium.lab.pdf.model

import org.json.JSONObject
import java.util.UUID

data class NormalizedRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("left", left.toDouble())
        put("top", top.toDouble())
        put("right", right.toDouble())
        put("bottom", bottom.toDouble())
    }

    companion object {
        fun fromJson(json: JSONObject): NormalizedRect = NormalizedRect(
            left = json.optDouble("left", 0.0).toFloat(),
            top = json.optDouble("top", 0.0).toFloat(),
            right = json.optDouble("right", 0.0).toFloat(),
            bottom = json.optDouble("bottom", 0.0).toFloat()
        )
    }
}

data class PdfHighlight(
    val id: String = UUID.randomUUID().toString(),
    val pageIndex: Int,
    val text: String,
    val colorArgb: Long,
    val bounds: List<NormalizedRect>,
    val timestamp: Long = System.currentTimeMillis()
)
