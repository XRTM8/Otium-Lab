package com.otium.lab.pdf.text

import android.net.Uri
import com.otium.lab.pdf.model.PdfSearchMatch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeArabicStem
import uniffi.otium_bridge.bridgeFindArabicMatches

object PdfSearchEngine {

    suspend fun search(
        extractor: PdfTextExtractor,
        uri: Uri,
        pageCount: Int,
        query: String,
        maxResults: Int = 100,
        onProgress: ((List<PdfSearchMatch>) -> Unit)? = null
    ): List<PdfSearchMatch> = withContext(Dispatchers.IO) {
        val trimmed = query.trim()
        if (trimmed.isEmpty() || pageCount <= 0) return@withContext emptyList()

        val results = mutableListOf<PdfSearchMatch>()
        for (page in 0 until pageCount) {
            coroutineContext.ensureActive()
            val pageText = extractor.extractPageText(uri, page)
            if (pageText.isBlank()) continue
            val beforeSize = results.size

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
                    if (results.size >= maxResults) {
                        onProgress?.let { cb -> withContext(Dispatchers.Main) { cb(results.toList()) } }
                        return@withContext results
                    }
                }
            } catch (_: Throwable) {
                // Fallback substring matching when native bridge is unavailable
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
                    if (results.size >= maxResults) {
                        onProgress?.let { cb -> withContext(Dispatchers.Main) { cb(results.toList()) } }
                        return@withContext results
                    }
                    idx = pageText.indexOf(trimmed, idx + 1, ignoreCase = true)
                }
            }
            if (results.size > beforeSize && onProgress != null) {
                val snapshot = results.toList()
                withContext(Dispatchers.Main) { onProgress(snapshot) }
            }
        }
        results
    }

    fun matchesToken(spanText: String, query: String, matchedSnippet: String?): Boolean {
        val q = query.trim()
        if (q.isEmpty()) return false
        val cleanSpan = spanText.trim()
        if (cleanSpan.isEmpty()) return false

        if (cleanSpan.contains(q, ignoreCase = true)) return true
        if (!matchedSnippet.isNullOrBlank()) {
            val tokens = matchedSnippet.split(Regex("\\s+")).filter { it.isNotBlank() }
            if (tokens.any { t -> cleanSpan.contains(t, ignoreCase = true) || t.contains(cleanSpan, ignoreCase = true) }) {
                return true
            }
        }
        return try {
            val qTokens = q.split(Regex("\\s+")).filter { it.isNotBlank() }
            val spanStem = bridgeArabicStem(cleanSpan)
            spanStem.isNotEmpty() && qTokens.any { bridgeArabicStem(it) == spanStem }
        } catch (_: Throwable) {
            false
        }
    }
}
