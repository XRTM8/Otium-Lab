package com.otium.lab.pdf.components

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.NativePdfRenderer
import com.otium.lab.pdf.model.*
import com.otium.lab.pdf.text.PdfTextExtractor
import com.otium.lab.pdf.util.detectPdfViewerGestures

@Composable
fun PdfContentCanvas(
    renderer: NativePdfRenderer, uri: Uri, isLoaded: Boolean, errorMessage: String?,
    readingLayout: ReadingLayout, pageColorMode: PageColorMode, cardBg: Color,
    scale: Float, offsetX: Float, offsetY: Float, listState: LazyListState, pagerState: PagerState,
    textExtractor: PdfTextExtractor, allHighlights: List<PdfHighlight>,
    searchQuery: String, searchMatches: List<PdfSearchMatch>,
    isSelectionModeActive: Boolean, selectedSpans: List<PdfTextSpan>, selectedHighlight: PdfHighlight?,
    selectedPage: Int, onViewportSizeChanged: (IntSize) -> Unit,
    onSelectSpans: (Int, List<PdfTextSpan>) -> Unit, onTapHighlight: (PdfHighlight) -> Unit,
    onClearSelection: () -> Unit, onTap: () -> Unit, onDoubleTap: () -> Unit,
    onTransform: (Float, Offset) -> Unit, modifier: Modifier = Modifier
) {
    val isZoomed = scale > 1.05f
    var renderTargetWidth by remember { mutableIntStateOf(1080) }
    LaunchedEffect(scale) {
        val desired = when {
            scale >= 2.0f -> 2400
            scale >= 1.4f -> 1800
            else -> 1080
        }
        if (desired != renderTargetWidth) {
            kotlinx.coroutines.delay(220)
            renderTargetWidth = desired
        }
    }
    val highlightsByPage = remember(allHighlights) { allHighlights.groupBy { it.pageIndex } }
    val matchesByPage = remember(searchMatches) { searchMatches.groupBy { it.pageIndex } }

    Box(
        modifier = modifier.fillMaxSize()
            .onSizeChanged(onViewportSizeChanged)
            .then(
                if (!isSelectionModeActive) {
                    Modifier.pointerInput(isZoomed) {
                        detectPdfViewerGestures(
                            isZoomed = isZoomed,
                            onTransform = onTransform,
                            onTap = onTap,
                            onDoubleTap = onDoubleTap
                        )
                    }
                } else Modifier
            )
    ) {
        when {
            errorMessage != null -> {
                Column(modifier = Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(text = errorMessage, color = MaterialTheme.colorScheme.error, fontSize = 14.sp)
                }
            }
            !isLoaded -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }
            else -> {
                val pageItemContent: @Composable (Int) -> Unit = { pageIndex ->
                    val highlights = highlightsByPage[pageIndex] ?: emptyList()
                    val pageMatches = matchesByPage[pageIndex] ?: emptyList()
                    val pageSelectedSpans = if (selectedPage == pageIndex) selectedSpans else emptyList()
                    val pageSelectedHighlight = if (selectedHighlight?.pageIndex == pageIndex) selectedHighlight else null

                    PdfPageItem(
                        renderer = renderer, pageIndex = pageIndex, pageColorMode = pageColorMode, cardBg = cardBg,
                        readingLayout = readingLayout, uri = uri, textExtractor = textExtractor, highlights = highlights,
                        selectedSpans = pageSelectedSpans, selectedHighlight = pageSelectedHighlight,
                        searchQuery = searchQuery, pageSearchMatches = pageMatches,
                        renderTargetWidth = renderTargetWidth, isSelectionModeActive = isSelectionModeActive,
                        onSelectSpans = { spans -> onSelectSpans(pageIndex, spans) },
                        onTapHighlight = onTapHighlight, onClearSelection = onClearSelection
                    )
                }

                if (readingLayout == ReadingLayout.VERTICAL) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        items(renderer.pageCount, key = { "${uri}_$it" }) { pageIndex -> pageItemContent(pageIndex) }
                    }
                } else {
                    HorizontalPager(
                        state = pagerState,
                        key = { "${uri}_$it" },
                        modifier = Modifier.fillMaxSize().graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY),
                        pageSpacing = 0.dp
                    ) { pageIndex ->
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { pageItemContent(pageIndex) }
                    }
                }
            }
        }
    }
}
