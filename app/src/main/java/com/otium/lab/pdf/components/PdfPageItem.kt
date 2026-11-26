package com.otium.lab.pdf.components

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.NativePdfRenderer
import com.otium.lab.pdf.model.InvertColorMatrix
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.PdfHighlight
import com.otium.lab.pdf.model.PdfSearchMatch
import com.otium.lab.pdf.model.PdfTextSpan
import com.otium.lab.pdf.model.ReadingLayout
import com.otium.lab.pdf.model.SepiaColorMatrix
import com.otium.lab.pdf.text.PdfSearchEngine
import com.otium.lab.pdf.text.PdfTextExtractor
import kotlinx.coroutines.launch

@Composable
fun PdfPageItem(
    renderer: NativePdfRenderer,
    pageIndex: Int,
    pageColorMode: PageColorMode,
    cardBg: Color,
    readingLayout: ReadingLayout = ReadingLayout.VERTICAL,
    uri: Uri? = null,
    textExtractor: PdfTextExtractor? = null,
    highlights: List<PdfHighlight> = emptyList(),
    selectedSpans: List<PdfTextSpan> = emptyList(),
    selectedHighlight: PdfHighlight? = null,
    searchQuery: String = "",
    pageSearchMatches: List<PdfSearchMatch> = emptyList(),
    renderTargetWidth: Int = 1080,
    isSelectionModeActive: Boolean = false,
    onSelectSpans: (List<PdfTextSpan>) -> Unit = {},
    onTapHighlight: (PdfHighlight) -> Unit = {},
    onClearSelection: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    var pageBitmap by remember(uri, pageIndex) { mutableStateOf<Bitmap?>(null) }
    var isLoading by remember(uri, pageIndex) { mutableStateOf(true) }
    var pageSpans by remember(uri, pageIndex) { mutableStateOf<List<PdfTextSpan>>(emptyList()) }

    LaunchedEffect(uri, pageIndex, renderTargetWidth) {
        if (pageBitmap == null) isLoading = true
        try {
            pageBitmap = renderer.renderPage(pageIndex, targetWidth = renderTargetWidth)
        } catch (_: Exception) {}
        isLoading = false
    }

    val needsSpans = isSelectionModeActive || pageSearchMatches.isNotEmpty()
    LaunchedEffect(uri, pageIndex, needsSpans) {
        val targetUri = uri ?: renderer.documentUri
        if (needsSpans && pageSpans.isEmpty() && targetUri != null && textExtractor != null) {
            pageSpans = textExtractor.extractPageSpans(targetUri, pageIndex)
        }
    }

    val searchMatchedSpans = remember(pageSpans, searchQuery, pageSearchMatches) {
        if (pageSearchMatches.isEmpty() || pageSpans.isEmpty() || searchQuery.isBlank()) emptyList()
        else {
            val snippets = pageSearchMatches.map { it.matchText }
            pageSpans.filter { span ->
                snippets.any { snippet -> PdfSearchEngine.matchesToken(span.text, searchQuery, snippet) }
            }
        }
    }

    val colorFilter = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> ColorFilter.colorMatrix(InvertColorMatrix)
        PageColorMode.SEPIA -> ColorFilter.colorMatrix(SepiaColorMatrix)
        PageColorMode.ORIGINAL -> null
    }

    val isHorizontal = readingLayout == ReadingLayout.HORIZONTAL

    Box(
        modifier = if (isHorizontal) Modifier.fillMaxSize().background(cardBg) else Modifier.fillMaxWidth().background(cardBg),
        contentAlignment = Alignment.Center
    ) {
        val bmp = pageBitmap
        if (bmp != null && !bmp.isRecycled) {
            val aspect = (bmp.width.toFloat() / bmp.height.toFloat().coerceAtLeast(1f)).coerceIn(0.2f, 5f)
            Box(
                modifier = if (isHorizontal) Modifier.fillMaxHeight().aspectRatio(aspect) else Modifier.fillMaxWidth().aspectRatio(aspect),
                contentAlignment = Alignment.Center
            ) {
                val imageBitmap = remember(bmp) { bmp.asImageBitmap() }
                Image(
                    bitmap = imageBitmap,
                    contentDescription = "صفحة ${pageIndex + 1}",
                    colorFilter = colorFilter,
                    contentScale = ContentScale.FillBounds,
                    modifier = Modifier.fillMaxSize()
                )

                PdfTextSelectionOverlay(
                    pageIndex = pageIndex,
                    spans = pageSpans,
                    highlights = highlights,
                    selectedSpans = selectedSpans,
                    selectedHighlight = selectedHighlight,
                    searchMatchedSpans = searchMatchedSpans,
                    isSelectionModeActive = isSelectionModeActive,
                    onSelectSpans = onSelectSpans,
                    onTapHighlight = onTapHighlight,
                    onClearSelection = onClearSelection,
                    onRequestSpansForLongPress = { normX, normY ->
                        val targetUri = uri ?: renderer.documentUri
                        if (targetUri != null && textExtractor != null) {
                            scope.launch {
                                val loaded = textExtractor.extractPageSpans(targetUri, pageIndex)
                                pageSpans = loaded
                                val hitSpan = loaded.firstOrNull { it.contains(normX, normY) }
                                if (hitSpan != null) onSelectSpans(listOf(hitSpan))
                                else {
                                    val w = 0.16f; val h = 0.035f
                                    onSelectSpans(listOf(PdfTextSpan("تظليل محدد", pageIndex, (normX - w / 2).coerceIn(0f, 1f - w), (normY - h / 2).coerceIn(0f, 1f - h), (normX + w / 2).coerceIn(w, 1f), (normY + h / 2).coerceIn(h, 1f))))
                                }
                            }
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(480.dp)
                    .background(cardBg),
                contentAlignment = Alignment.Center
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("تعذر تحميل الصفحة", color = Color.Gray, fontSize = 12.sp)
                }
            }
        }
    }
}
