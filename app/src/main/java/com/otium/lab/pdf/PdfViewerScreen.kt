package com.otium.lab.pdf

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.otium.lab.pdf.components.PdfContentCanvas
import com.otium.lab.pdf.components.PdfViewerOverlays
import com.otium.lab.pdf.model.*
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.launch

@Composable
fun PdfViewerScreen(
    uri: Uri,
    title: String,
    themePreferences: ThemePreferences,
    onClose: () -> Unit
) {
    val state = rememberPdfViewerState(uri, title, themePreferences)
    val scope = rememberCoroutineScope()

    val scale by animateFloatAsState(targetValue = state.targetScale, animationSpec = tween(220, easing = FastOutSlowInEasing), label = "scale")

    val currentPage by remember {
        derivedStateOf {
            if (state.renderer.pageCount <= 0) 1
            else if (state.readingLayout == ReadingLayout.VERTICAL) (state.listState.firstVisibleItemIndex + 1).coerceAtMost(state.renderer.pageCount)
            else (state.pagerState.currentPage + 1).coerceAtMost(state.renderer.pageCount)
        }
    }

    LaunchedEffect(currentPage, state.isDraggingSlider) { if (!state.isDraggingSlider) state.sliderValue = currentPage.toFloat() }

    LaunchedEffect(state.isLoaded) {
        if (state.isLoaded && state.renderer.pageCount > 0 && !state.hasRestoredPosition) {
            val idx = (state.savedPage - 1).coerceAtLeast(0)
            if (state.savedPage in 2..state.renderer.pageCount) {
                state.listState.scrollToItem(idx, state.savedOffset)
                state.pagerState.scrollToPage(idx)
            }
            state.hasRestoredPosition = true
        }
    }
    LaunchedEffect(currentPage, state.isLoaded, state.hasRestoredPosition) {
        if (state.isLoaded && state.hasRestoredPosition && state.renderer.pageCount > 0) {
            val offset = if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.firstVisibleItemScrollOffset else 0
            state.documentStore.updateProgress(uri, currentPage, state.renderer.pageCount, offset)
        }
    }

    BackHandler { state.handleBack(onClose) }

    val containerBg = when (state.pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color.Black
        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
        PageColorMode.ORIGINAL -> Color(0xFFF1F5F9)
    }
    val barBg = when (state.pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFF111114)
        PageColorMode.SEPIA -> Color(0xFFF4EBD9)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.surface
    }
    val textColor = when (state.pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFFF8FAFC)
        PageColorMode.SEPIA -> Color(0xFF2C2416)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.onSurface
    }
    val cardBg = when (state.pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color.Black
        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
        PageColorMode.ORIGINAL -> Color.White
    }

    Box(modifier = Modifier.fillMaxSize().background(containerBg)) {
        PdfContentCanvas(
            renderer = state.renderer, uri = uri, isLoaded = state.isLoaded, errorMessage = state.errorMessage,
            readingLayout = state.readingLayout, pageColorMode = state.pageColorMode, cardBg = cardBg,
            scale = scale, offsetX = state.offsetX, offsetY = state.offsetY, listState = state.listState, pagerState = state.pagerState,
            textExtractor = state.textExtractor, annotationStore = state.annotationStore, refreshTrigger = state.refreshHighlightTrigger,
            isSelectionModeActive = state.isSelectionModeActive, selectedSpans = state.selectedSpans,
            selectedHighlight = state.selectedHighlight, selectedPage = state.selectedPage,
            onSelectSpans = { p, spans -> state.selectedPage = p; state.selectedHighlight = null; state.selectedSpans = spans },
            onTapHighlight = { h -> state.selectedPage = h.pageIndex; state.selectedSpans = emptyList(); state.selectedHighlight = h },
            onClearSelection = { state.clearSelection() },
            onTap = { state.showControls = !state.showControls },
            onDoubleTap = { if (state.targetScale > 1.2f) { state.targetScale = 1f; state.offsetX = 0f; state.offsetY = 0f } else state.targetScale = 2.2f }
        )

        PdfViewerOverlays(
            showControls = state.showControls, title = title, currentPage = currentPage, pageCount = state.renderer.pageCount,
            barBg = barBg, textColor = textColor, readingLayout = state.readingLayout, pageColorMode = state.pageColorMode,
            isSelectionModeActive = state.isSelectionModeActive, selectedSpans = state.selectedSpans, selectedHighlight = state.selectedHighlight,
            showResumePill = state.showResumePill, resumedPage = state.savedPage, sliderValue = state.sliderValue,
            isDraggingSlider = state.isDraggingSlider, showJumpDialog = state.showJumpDialog,
            onToggleSelectionMode = {
                state.isSelectionModeActive = !state.isSelectionModeActive
                if (!state.isSelectionModeActive) state.clearSelection()
            },
            onToggleLayout = {
                val target = currentPage
                state.readingLayout = if (state.readingLayout == ReadingLayout.VERTICAL) ReadingLayout.HORIZONTAL else ReadingLayout.VERTICAL
                scope.launch {
                    if (state.readingLayout == ReadingLayout.HORIZONTAL) state.pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                    else state.listState.scrollToItem((target - 1).coerceAtLeast(0))
                }
            },
            onToggleColorMode = {
                state.pageColorMode = when (state.pageColorMode) {
                    PageColorMode.ORIGINAL -> PageColorMode.AMOLED_BLACK
                    PageColorMode.AMOLED_BLACK -> PageColorMode.SEPIA
                    PageColorMode.SEPIA -> PageColorMode.ORIGINAL
                }
            },
            onClose = onClose,
            onCopyText = {
                val text = state.selectedHighlight?.text ?: state.selectedSpans.joinToString(" ") { it.text }
                val cm = state.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("Otium PDF", text))
                Toast.makeText(state.context, "تم نسخ النص إلى الحافظة", Toast.LENGTH_SHORT).show()
                state.clearSelection()
            },
            onApplyHighlight = { color ->
                if (state.selectedHighlight != null) {
                    state.annotationStore.saveHighlight(uri, state.selectedHighlight!!.copy(colorArgb = color))
                    state.selectedHighlight = null; state.refreshHighlightTrigger++
                } else if (state.selectedSpans.isNotEmpty()) {
                    val highlight = PdfHighlight(
                        pageIndex = state.selectedPage, text = state.selectedSpans.joinToString(" ") { it.text }, colorArgb = color,
                        bounds = state.selectedSpans.map { NormalizedRect(it.normLeft, it.normTop, it.normRight, it.normBottom) }
                    )
                    state.annotationStore.saveHighlight(uri, highlight)
                    state.selectedSpans = emptyList(); state.refreshHighlightTrigger++
                    Toast.makeText(state.context, "تم حفظ التظليل", Toast.LENGTH_SHORT).show()
                }
            },
            onDeleteHighlight = {
                state.selectedHighlight?.let { state.annotationStore.deleteHighlight(uri, it.id) }
                state.selectedHighlight = null; state.refreshHighlightTrigger++
                Toast.makeText(state.context, "تم حذف التظليل", Toast.LENGTH_SHORT).show()
            },
            onClearSelection = { state.clearSelection() },
            onJumpToBeginning = {
                scope.launch {
                    if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.scrollToItem(0) else state.pagerState.scrollToPage(0)
                }
                state.showResumePill = false
            },
            onDismissResumePill = { state.showResumePill = false },
            onSliderValueChange = { newVal -> state.isDraggingSlider = true; state.sliderValue = newVal },
            onSliderValueChangeFinished = {
                state.isDraggingSlider = false
                val target = state.sliderValue.toInt()
                scope.launch {
                    if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.scrollToItem((target - 1).coerceAtLeast(0))
                    else state.pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                }
            },
            onOpenJumpDialog = { state.showJumpDialog = true },
            onDismissJumpDialog = { state.showJumpDialog = false },
            onConfirmJump = { target ->
                scope.launch {
                    if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.scrollToItem(target - 1)
                    else state.pagerState.scrollToPage(target - 1)
                }
                state.showJumpDialog = false
            }
        )
    }
}
