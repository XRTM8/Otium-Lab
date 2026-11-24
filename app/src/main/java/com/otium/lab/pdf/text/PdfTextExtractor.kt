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
import java.io.ByteArrayInputStream
import java.io.File
import java.io.StringWriter
import kotlin.math.max
import kotlin.math.min

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

    internal fun getOrLoadDocument(uri: Uri): PDDocument? {
        if (cachedUri == uri && cachedDocument != null) return cachedDocument
        closeDocument()
        return try {
            val doc = if (uri.scheme == "file" && uri.path != null) {
                val f = File(uri.path!!)
                if (f.exists()) PDDocument.load(f) else loadFromResolver(uri)
            } else {
                loadFromResolver(uri)
            }
            if (doc != null) {
                cachedDocument = doc
                cachedUri = uri
            }
            doc
        } catch (_: Exception) {
            null
        }
    }

    private fun loadFromResolver(uri: Uri): PDDocument? {
        val cacheFile = File(context.cacheDir, "stream_temp_doc.pdf")
        return try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                java.io.FileOutputStream(cacheFile).use { output ->
                    input.copyTo(output)
                }
            } ?: return null
            PDDocument.load(cacheFile)
        } catch (_: Exception) {
            null
        }
    }

    private fun closeDocument() {
        try { cachedDocument?.close() } catch (_: Exception) {}
        cachedDocument = null
        cachedUri = null
        try {
            val cacheFile = File(context.cacheDir, "stream_temp_doc.pdf")
            if (cacheFile.exists()) cacheFile.delete()
        } catch (_: Exception) {}
    }

    suspend fun extractPageText(uri: Uri, pageIndex: Int): String = withContext(Dispatchers.IO) {
        mutex.withLock {
            try {
                val doc = getOrLoadDocument(uri) ?: return@withLock ""
                if (pageIndex in 0 until doc.numberOfPages) {
                    val stripper = object : PDFTextStripper() {
                        init {
                            startPage = pageIndex + 1
                            endPage = pageIndex + 1
                        }
                    }
                    stripper.getText(doc) ?: ""
                } else ""
            } catch (_: Exception) {
                ""
            }
        }
    }

    fun clearCache() {
        pageSpanCache.evictAll()
        closeDocument()
    }

    override fun close() = clearCache()

    suspend fun extractPageSpans(uri: Uri, pageIndex: Int): List<PdfTextSpan> = withContext(Dispatchers.IO) {
        val cached = pageSpanCache.get(pageIndex)
        if (cached != null) return@withContext cached

        val spans = mutableListOf<PdfTextSpan>()
        var success = false
        mutex.withLock {
            try {
                val document = getOrLoadDocument(uri) ?: return@withLock
                if (pageIndex in 0 until document.numberOfPages) {
                    val pdPage = document.getPage(pageIndex)
                    val cropBox = pdPage.cropBox ?: pdPage.mediaBox
                    val rotation = pdPage.rotation ?: 0
                    val isRotated = rotation == 90 || rotation == 270
                    val pWidth = if (isRotated) cropBox.height else cropBox.width
                    val pHeight = if (isRotated) cropBox.width else cropBox.height
                    if (pWidth <= 0f || pHeight <= 0f) return@withLock

                    val stripper = object : PDFTextStripper() {
                        init {
                            startPage = pageIndex + 1
                            endPage = pageIndex + 1
                            sortByPosition = true
                        }

                        override fun writeString(text: String?, textPositions: MutableList<TextPosition>?) {
                            val currentWord = StringBuilder()
                            val currentPositions = mutableListOf<TextPosition>()
                            val cLeft = cropBox.lowerLeftX

                            fun flushWord() {
                                val word = currentWord.toString().trim()
                                if (word.isNotEmpty() && currentPositions.isNotEmpty()) {
                                    val minX = (currentPositions.map { it.xDirAdj }.minOrNull() ?: 0f) - cLeft
                                    val maxX = (currentPositions.map { it.xDirAdj + it.widthDirAdj }.maxOrNull() ?: 0f) - cLeft
                                    val minY = currentPositions.map { it.yDirAdj - it.heightDir }.minOrNull() ?: 0f
                                    val maxY = currentPositions.map { it.yDirAdj + (it.heightDir * 0.35f) }.maxOrNull() ?: 0f
                                    val left = min(minX, maxX); val right = max(minX, maxX)
                                    val top = min(minY, maxY); val bottom = max(minY, maxY)

                                    spans.add(
                                        PdfTextSpan(
                                            text = word, pageIndex = pageIndex,
                                            normLeft = (left / pWidth).coerceIn(0f, 1f),
                                            normTop = (top / pHeight).coerceIn(0f, 1f),
                                            normRight = (right / pWidth).coerceIn(0f, 1f),
                                            normBottom = (bottom / pHeight).coerceIn(0f, 1f)
                                        )
                                    )
                                }
                                currentWord.clear()
                                currentPositions.clear()
                            }

                            textPositions?.forEach { tp ->
                                if (tp.unicode.isNullOrBlank()) flushWord()
                                else { currentWord.append(tp.unicode); currentPositions.add(tp) }
                            }
                            flushWord()
                            super.writeString(text, textPositions)
                        }
                    }
                    stripper.writeText(document, StringWriter())
                    success = true
                }
            } catch (_: Exception) {}
        }
        if (success) pageSpanCache.put(pageIndex, spans)
        spans
    }
}
