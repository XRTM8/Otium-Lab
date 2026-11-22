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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.io.StringWriter

class PdfTextExtractor(private val context: Context) : AutoCloseable {

    init {
        try {
            PDFBoxResourceLoader.init(context)
        } catch (_: Exception) {}
    }

    private val mutex = Mutex()
    private val pageSpanCache = LruCache<Int, List<PdfTextSpan>>(35)
    private var cachedDocument: PDDocument? = null
    private var cachedUri: Uri? = null

    private fun getOrLoadDocument(uri: Uri): PDDocument? {
        if (cachedUri == uri && cachedDocument != null) {
            return cachedDocument
        }
        closeDocument()
        return try {
            val stream: InputStream? = if (uri.scheme == "file") {
                File(uri.path ?: "").inputStream()
            } else {
                context.contentResolver.openInputStream(uri)
            }
            stream?.use {
                val doc = PDDocument.load(it)
                cachedDocument = doc
                cachedUri = uri
                doc
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun closeDocument() {
        try {
            cachedDocument?.close()
        } catch (_: Exception) {}
        cachedDocument = null
        cachedUri = null
    }

    fun clearCache() {
        pageSpanCache.evictAll()
        closeDocument()
    }

    override fun close() {
        clearCache()
    }

    suspend fun extractPageSpans(uri: Uri, pageIndex: Int): List<PdfTextSpan> = withContext(Dispatchers.IO) {
        val cached = pageSpanCache.get(pageIndex)
        if (cached != null) return@withContext cached

        val spans = mutableListOf<PdfTextSpan>()
        mutex.withLock {
            try {
                val document = getOrLoadDocument(uri) ?: return@withLock
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
                            val currentWord = StringBuilder()
                            val currentPositions = mutableListOf<TextPosition>()

                            fun flushWord() {
                                val word = currentWord.toString().trim()
                                if (word.isNotEmpty() && currentPositions.isNotEmpty()) {
                                    val minX = currentPositions.map { it.xDirAdj }.minOrNull() ?: 0f
                                    val maxX = currentPositions.map { it.xDirAdj + it.widthDirAdj }.maxOrNull() ?: 0f
                                    val minY = currentPositions.map { it.yDirAdj - it.heightDir }.minOrNull() ?: 0f
                                    val maxY = currentPositions.map { it.yDirAdj }.maxOrNull() ?: 0f

                                    spans.add(
                                        PdfTextSpan(
                                            text = word,
                                            pageIndex = pageIndex,
                                            normLeft = (minX / pWidth).coerceIn(0f, 1f),
                                            normTop = (minY / pHeight).coerceIn(0f, 1f),
                                            normRight = (maxX / pWidth).coerceIn(0f, 1f),
                                            normBottom = (maxY / pHeight).coerceIn(0f, 1f)
                                        )
                                    )
                                }
                                currentWord.clear()
                                currentPositions.clear()
                            }

                            textPositions?.forEach { tp ->
                                if (tp.unicode.isNullOrBlank()) {
                                    flushWord()
                                } else {
                                    currentWord.append(tp.unicode)
                                    currentPositions.add(tp)
                                }
                            }
                            flushWord()
                            super.writeString(text, textPositions)
                        }
                    }
                    stripper.writeText(document, StringWriter())
                }
            } catch (_: Exception) {}
        }

        pageSpanCache.put(pageIndex, spans)
        spans
    }
}
