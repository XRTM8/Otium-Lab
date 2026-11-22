package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
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

    private const val A4_WIDTH = 595
    private const val A4_HEIGHT = 842

    suspend fun exportImageFilesToPdf(
        context: Context,
        pageFiles: List<File>,
        customTitle: String? = null
    ): File = withContext(Dispatchers.IO) {
        if (pageFiles.isEmpty()) {
            throw IllegalArgumentException("قائمة الصفحات فارغة، لا يمكن إنشاء ملف PDF")
        }

        val pdfDocument = PdfDocument()
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)

        try {
            for ((index, file) in pageFiles.withIndex()) {
                val bitmap = BitmapFactory.decodeFile(file.absolutePath) ?: continue
                try {
                    val pageInfo = PdfDocument.PageInfo.Builder(A4_WIDTH, A4_HEIGHT, index + 1).create()
                    val page = pdfDocument.startPage(pageInfo)
                    val canvas: Canvas = page.canvas

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
                } finally {
                    bitmap.recycle() // Free memory immediately
                }
            }

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val title = customTitle?.ifBlank { null } ?: "مستند_ممسوح_$timeStamp"
            val safeName = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

            val docsDir = File(context.filesDir, "scans").apply { if (!exists()) mkdirs() }
            val outputFile = File(docsDir, safeName)
            FileOutputStream(outputFile).use { out ->
                pdfDocument.writeTo(out)
            }

            // Cleanup temp files
            pageFiles.forEach { runCatching { it.delete() } }

            outputFile
        } finally {
            pdfDocument.close()
        }
    }

    suspend fun exportBitmapsToPdf(
        context: Context,
        pages: List<Bitmap>,
        customTitle: String? = null
    ): File = withContext(Dispatchers.IO) {
        val tempDir = File(context.cacheDir, "scan_temp_export").apply { if (!exists()) mkdirs() }
        val tempFiles = pages.mapIndexed { idx, bmp ->
            val f = File(tempDir, "page_$idx.jpg")
            FileOutputStream(f).use { out -> bmp.compress(Bitmap.CompressFormat.JPEG, 90, out) }
            f
        }
        exportImageFilesToPdf(context, tempFiles, customTitle)
    }
}
