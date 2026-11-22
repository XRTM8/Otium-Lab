package com.otium.lab.pdf.text

import android.content.Context
import android.net.Uri
import android.util.LruCache
import com.otium.lab.pdf.model.PdfTextSpan
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.io.StringWriter

class PdfTextExtractor(private val context: Context) {

    init {
        try {
            PDFBoxResourceLoader.init(context)
        } catch (_: Exception) {}
    }

    // Cache extracted spans per page index (up to 30 pages)
    private val pageSpanCache = LruCache<Int, List<PdfTextSpan>>(30)

    fun clearCache() {
        pageSpanCache.evictAll()
    }

    suspend fun extractPageSpans(uri: Uri, pageIndex: Int): List<PdfTextSpan> = withContext(Dispatchers.IO) {
        val cached = pageSpanCache.get(pageIndex)
        if (cached != null) return@withContext cached

        val spans = mutableListOf<PdfTextSpan>()
        var inputStream: InputStream? = null
        var document: PDDocument? = null

        try {
            inputStream = if (uri.scheme == "file") {
                File(uri.path ?: "").inputStream()
            } else {
                context.contentResolver.openInputStream(uri)
            }

            if (inputStream != null) {
                document = PDDocument.load(inputStream)
                if (pageIndex in 0 until document.numberOfPages) {
                    val pdPage = document.getPage(pageIndex)
                    val cropBox = pdPage.cropBox ?: pdPage.mediaBox
                    val pWidth = cropBox.width
                    val pHeight = cropBox.height

                    val stripper = object : PDFTextStripper() {
                        init {
                            startPage = pageIndex + 1
                            endPage = pageIndex + 1
                            sortByPosition = true
                        }

                        override fun writeString(text: String?, textPositions: MutableList<TextPosition>?) {
                            val cleanText = text?.trim() ?: ""
                            if (cleanText.isNotEmpty() && !textPositions.isNullOrEmpty()) {
                                val minX = textPositions.map { it.xDirAdj }.minOrNull() ?: 0f
                                val maxX = textPositions.map { it.xDirAdj + it.widthDirAdj }.maxOrNull() ?: 0f
                                val minY = textPositions.map { it.yDirAdj - it.heightDir }.minOrNull() ?: 0f
                                val maxY = textPositions.map { it.yDirAdj }.maxOrNull() ?: 0f

                                val normLeft = (minX / pWidth).coerceIn(0f, 1f)
                                val normTop = (minY / pHeight).coerceIn(0f, 1f)
                                val normRight = (maxX / pWidth).coerceIn(0f, 1f)
                                val normBottom = (maxY / pHeight).coerceIn(0f, 1f)

                                spans.add(
                                    PdfTextSpan(
                                        text = cleanText,
                                        pageIndex = pageIndex,
                                        normLeft = normLeft,
                                        normTop = normTop,
                                        normRight = normRight,
                                        normBottom = normBottom
                                    )
                                )
                            }
                            super.writeString(text, textPositions)
                        }
                    }

                    stripper.writeText(document, StringWriter())
                }
            }
        } catch (_: Exception) {
        } finally {
            try { document?.close() } catch (_: Exception) {}
            try { inputStream?.close() } catch (_: Exception) {}
        }

        pageSpanCache.put(pageIndex, spans)
        spans
    }
}
