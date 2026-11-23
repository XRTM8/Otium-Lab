package com.otium.lab.pdf.components

import android.net.Uri
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.NativePdfRenderer
import com.otium.lab.pdf.model.*
import com.otium.lab.pdf.store.AnnotationStore
import com.otium.lab.pdf.text.PdfTextExtractor
import com.otium.lab.pdf.util.detectPdfViewerGestures

@Composable
fun PdfContentCanvas(
    renderer: NativePdfRenderer, uri: Uri, isLoaded: Boolean, errorMessage: String?,
    readingLayout: ReadingLayout, pageColorMode: PageColorMode, cardBg: Color,
    scale: Float, offsetX: Float, offsetY: Float, listState: LazyListState, pagerState: PagerState,
    textExtractor: PdfTextExtractor, annotationStore: AnnotationStore, refreshTrigger: Int,
    isSelectionModeActive: Boolean, selectedSpans: List<PdfTextSpan>, selectedHighlight: PdfHighlight?,
    selectedPage: Int, onSelectSpans: (Int, List<PdfTextSpan>) -> Unit, onTapHighlight: (PdfHighlight) -> Unit,
    onClearSelection: () -> Unit, onTap: () -> Unit, onDoubleTap: () -> Unit,
    onTransform: (Float, Offset) -> Unit, modifier: Modifier = Modifier
) {
    val isZoomed = scale > 1.05f

    Box(
        modifier = modifier.fillMaxSize()
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
                    val highlights = remember(pageIndex, refreshTrigger, uri) { annotationStore.getHighlights(uri, pageIndex) }
                    val pageSelectedSpans = if (selectedPage == pageIndex) selectedSpans else emptyList()
                    val pageSelectedHighlight = if (selectedHighlight?.pageIndex == pageIndex) selectedHighlight else null

                    PdfPageItem(
                        renderer = renderer, pageIndex = pageIndex, pageColorMode = pageColorMode, cardBg = cardBg,
                        readingLayout = readingLayout, uri = uri, textExtractor = textExtractor, highlights = highlights,
                        selectedSpans = pageSelectedSpans, selectedHighlight = pageSelectedHighlight,
                        isSelectionModeActive = isSelectionModeActive, onSelectSpans = { spans -> onSelectSpans(pageIndex, spans) },
                        onTapHighlight = onTapHighlight, onClearSelection = onClearSelection
                    )
                }

                if (readingLayout == ReadingLayout.VERTICAL) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY),
                        horizontalAlignment = Alignment.CenterHorizontally, contentPadding = PaddingValues(0.dp)
                    ) {
                        items(renderer.pageCount, key = { it }) { pageIndex -> pageItemContent(pageIndex) }
                    }
                } else {
                    HorizontalPager(
                        state = pagerState,
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
