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
    fun contains(normX: Float, normY: Float, toleranceX: Float = 0.02f, toleranceY: Float = 0.025f): Boolean {
        return normX >= (normLeft - toleranceX) &&
               normX <= (normRight + toleranceX) &&
               normY >= (normTop - toleranceY) &&
               normY <= (normBottom + toleranceY)
    }

    fun intersects(rLeft: Float, rTop: Float, rRight: Float, rBottom: Float): Boolean {
        return normLeft < rRight && normRight > rLeft &&
               normTop < rBottom && normBottom > rTop
    }
}
