package com.otium.lab.scanner

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.net.Uri
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

enum class PdfExportQuality(val labelAr: String, val maxDim: Int) {
    HIGH("عالية", 2200),
    BALANCED("متوازنة", 1650),
    COMPACT("مضغوطة", 1150)
}

enum class PdfPageSize(val labelAr: String) {
    A4("A4 قياسي"),
    FIT_IMAGE("بحجم الصورة")
}

object PdfExporter {

    private const val A4_WIDTH = 595
    private const val A4_HEIGHT = 842

    suspend fun exportImageFilesToPdf(
        context: Context,
        pageFiles: List<File>,
        customTitle: String? = null,
        quality: PdfExportQuality = PdfExportQuality.BALANCED,
        pageSize: PdfPageSize = PdfPageSize.A4
    ): File = withContext(Dispatchers.IO) {
        if (pageFiles.isEmpty()) {
            throw IllegalArgumentException("قائمة الصفحات فارغة، لا يمكن إنشاء ملف PDF")
        }

        val pdfDocument = PdfDocument()
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        var writtenPages = 0

        try {
            for (file in pageFiles) {
                val decoded = decodeForPdf(file.absolutePath, maxDim = quality.maxDim)
                    ?: throw IllegalStateException("تعذر قراءة الصفحة ${writtenPages + 1}")
                writtenPages++
                try {
                    if (pageSize == PdfPageSize.FIT_IMAGE) {
                        val aspect = decoded.height.toFloat() / decoded.width.toFloat().coerceAtLeast(1f)
                        val pgW = A4_WIDTH
                        val pgH = (pgW * aspect).toInt().coerceIn(200, 1400)
                        val pageInfo = PdfDocument.PageInfo.Builder(pgW, pgH, writtenPages).create()
                        val page = pdfDocument.startPage(pageInfo)
                        page.canvas.drawBitmap(decoded, null, Rect(0, 0, pgW, pgH), paint)
                        pdfDocument.finishPage(page)
                    } else {
                        val pageInfo = PdfDocument.PageInfo.Builder(A4_WIDTH, A4_HEIGHT, writtenPages).create()
                        val page = pdfDocument.startPage(pageInfo)
                        val canvas: Canvas = page.canvas

                        val margin = 16
                        val availW = A4_WIDTH - (margin * 2)
                        val availH = A4_HEIGHT - (margin * 2)

                        val aspect = decoded.height.toFloat() / decoded.width.toFloat()
                        var drawW = availW
                        var drawH = (drawW * aspect).toInt()

                        if (drawH > availH) {
                            drawH = availH
                            drawW = (drawH / aspect).toInt()
                        }

                        val left = margin + (availW - drawW) / 2
                        val top = margin + (availH - drawH) / 2
                        val dstRect = Rect(left, top, left + drawW, top + drawH)

                        canvas.drawBitmap(decoded, null, dstRect, paint)
                        pdfDocument.finishPage(page)
                    }
                } finally {
                    decoded.recycle() // Free memory immediately
                }
            }

            if (writtenPages == 0) {
                throw IllegalStateException("تعذر قراءة صور الصفحات لإنشاء مستند الـ PDF")
            }

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val title = customTitle?.ifBlank { null } ?: "مستند_ممسوح_$timeStamp"
            val safeName = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"

            val docsDir = File(context.filesDir, "scans").apply { if (!exists()) mkdirs() }
            var outputFile = File(docsDir, safeName)
            var suffix = 2
            while (outputFile.exists()) {
                outputFile = File(docsDir, "${safeName.removeSuffix(".pdf")}_$suffix.pdf")
                suffix++
            }
            val stagingFile = File(docsDir, ".${outputFile.name}.partial")
            try {
                FileOutputStream(stagingFile).use { out -> pdfDocument.writeTo(out) }
                if (!stagingFile.renameTo(outputFile)) throw IllegalStateException("تعذر إتمام حفظ PDF")
            } finally {
                if (stagingFile.exists()) stagingFile.delete()
            }

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
        try {
            exportImageFilesToPdf(context, tempFiles, customTitle)
        } finally {
            tempFiles.forEach { it.delete() }
        }
    }

    private fun decodeForPdf(path: String, maxDim: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        val w = bounds.outWidth
        val h = bounds.outHeight
        if (w <= 0 || h <= 0) return null
        var inSampleSize = 1
        while (maxOf(w, h) / inSampleSize > maxDim) inSampleSize *= 2
        val opts = BitmapFactory.Options().apply {
            this.inSampleSize = inSampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        return BitmapFactory.decodeFile(path, opts)
    }

    suspend fun mergePdfUris(
        context: Context,
        uris: List<Uri>,
        customTitle: String? = null
    ): File = withContext(Dispatchers.IO) {
        if (uris.size < 2) throw IllegalArgumentException("اختر ملفين على الأقل للدمج")
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val title = customTitle?.ifBlank { null } ?: "مستند_مدمج_$timeStamp"
        val safeName = "${title.replace(Regex("[^a-zA-Z0-9_\\-\\u0600-\\u06FF]"), "_")}.pdf"
        val docsDir = File(context.filesDir, "scans").apply { if (!exists()) mkdirs() }
        var outputFile = File(docsDir, safeName)
        var suffix = 2
        while (outputFile.exists()) {
            outputFile = File(docsDir, "${safeName.removeSuffix(".pdf")}_$suffix.pdf")
            suffix++
        }
        val stagingFile = File(docsDir, ".${outputFile.name}.partial")
        val streams = mutableListOf<java.io.InputStream>()
        try {
            val merger = PDFMergerUtility()
            merger.destinationFileName = stagingFile.absolutePath
            for (uri in uris) {
                val input = if (uri.scheme == "file") {
                    File(uri.path ?: "").inputStream()
                } else {
                    context.contentResolver.openInputStream(uri)
                        ?: throw IllegalStateException("تعذر فتح أحد الملفات للدمج")
                }
                streams.add(input)
                merger.addSource(input)
            }
            merger.mergeDocuments(com.tom_roush.pdfbox.io.MemoryUsageSetting.setupTempFileOnly())
            if (!stagingFile.renameTo(outputFile)) throw IllegalStateException("تعذر حفظ الملف المدمج")
            outputFile
        } finally {
            streams.forEach { runCatching { it.close() } }
            if (stagingFile.exists()) stagingFile.delete()
        }
    }
}
