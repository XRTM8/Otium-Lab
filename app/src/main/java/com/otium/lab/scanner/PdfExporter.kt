package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object PdfExporter {

    // Standard A4 dimensions in PDF points (72 points per inch)
    // 595 x 842 points
    private const val A4_WIDTH = 595
    private const val A4_HEIGHT = 842

    suspend fun exportBitmapsToPdf(
        context: Context,
        pages: List<Bitmap>,
        customTitle: String? = null
    ): File = withContext(Dispatchers.IO) {
        if (pages.isEmpty()) {
            throw IllegalArgumentException("قائمة الصفحات فارغة، لا يمكن إنشاء ملف PDF")
        }

        val pdfDocument = PdfDocument()
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)

        try {
            for ((index, bitmap) in pages.withIndex()) {
                val pageInfo = PdfDocument.PageInfo.Builder(A4_WIDTH, A4_HEIGHT, index + 1).create()
                val page = pdfDocument.startPage(pageInfo)
                val canvas: Canvas = page.canvas

                // Fit bitmap into A4 keeping aspect ratio with margins
                val margin = 20
                val availW = A4_WIDTH - (margin * 2)
                val availH = A4_HEIGHT - (margin * 2)

                val aspect = bitmap.height.toFloat() / bitmap.width.toFloat()
                var drawW = availW
                var drawH = (drawW * aspect).toInt()

                if (drawH > availH) {
                    drawH = availH
                    drawW = (drawH / aspect).toInt()
                }

                val left = margin + (availW - drawW) / 2
                val top = margin + (availH - drawH) / 2
                val dstRect = Rect(left, top, left + drawW, top + drawH)

                canvas.drawBitmap(bitmap, null, dstRect, paint)
                pdfDocument.finishPage(page)
            }

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val title = customTitle ?: "Scanned_Doc_$timeStamp"
            val safeName = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

            val docsDir = File(context.filesDir, "scans")
            if (!docsDir.exists()) docsDir.mkdirs()

            val outputFile = File(docsDir, safeName)
            FileOutputStream(outputFile).use { out ->
                pdfDocument.writeTo(out)
            }

            outputFile
        } finally {
            pdfDocument.close()
        }
    }
}
