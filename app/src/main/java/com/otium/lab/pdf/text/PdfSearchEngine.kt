package com.otium.lab.pdf.text

import android.net.Uri
import com.otium.lab.pdf.model.PdfSearchMatch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeFindArabicMatches

object PdfSearchEngine {

    suspend fun search(
        extractor: PdfTextExtractor,
        uri: Uri,
        pageCount: Int,
        query: String,
        maxResults: Int = 100
    ): List<PdfSearchMatch> = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        if (trimmed.isEmpty() || pageCount <= 0) return@withContext emptyList()

        val results = mutableListOf<PdfSearchMatch>()
        for (page in 0 until pageCount) {
            val pageText = extractor.extractPageText(uri, page)
            if (pageText.isBlank()) continue

            try {
                val matches = bridgeFindArabicMatches(pageText, trimmed)
                for (m in matches) {
                    val start = m.startOffset.toInt().coerceIn(0, pageText.length)
                    val end = m.endOffset.toInt().coerceIn(start, pageText.length)
                    val snippet = if (end > start) pageText.substring(start, end) else trimmed
                    results.add(
                        PdfSearchMatch(
                            pageIndex = page,
                            matchText = snippet,
                            startOffset = start,
                            endOffset = end
                        )
                    )
                    if (results.size >= maxResults) return@withContext results
                }
            } catch (_: Throwable) {
                // Fallback substring matching
                var idx = pageText.indexOf(trimmed, ignoreCase = true)
                while (idx >= 0) {
                    results.add(
                        PdfSearchMatch(
                            pageIndex = page,
                            matchText = trimmed,
                            startOffset = idx,
                            endOffset = idx + trimmed.length
                        )
                    )
                    if (results.size >= maxResults) return@withContext results
                    idx = pageText.indexOf(trimmed, idx + 1, ignoreCase = true)
                }
            }
        }
        results
    }
}
