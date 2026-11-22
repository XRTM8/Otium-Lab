package com.otium.lab.pdf.model

data class PdfTextSpan(
    val text: String,
    val pageIndex: Int,
    val normLeft: Float,
    val normTop: Float,
    val normRight: Float,
    val normBottom: Float,
    val lineIndex: Int = 0
) {
    fun contains(normX: Float, normY: Float, tolerance: Float = 0.015f): Boolean {
        return normX >= (normLeft - tolerance) &&
               normX <= (normRight + tolerance) &&
               normY >= (normTop - tolerance) &&
               normY <= (normBottom + tolerance)
    }

    fun intersects(rLeft: Float, rTop: Float, rRight: Float, rBottom: Float): Boolean {
        return normLeft < rRight && normRight > rLeft &&
               normTop < rBottom && normBottom > rTop
    }
}
