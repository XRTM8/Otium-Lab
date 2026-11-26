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
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.otium.lab.pdf.components.PdfContentCanvas
import com.otium.lab.pdf.components.PdfViewerOverlays
import com.otium.lab.pdf.model.*
import com.otium.lab.pdf.util.BindReaderVolumeKeys
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

    fun scrollTo(idx: Int) {
        val target = idx.coerceIn(0, (state.renderer.pageCount - 1).coerceAtLeast(0))
        scope.launch {
            if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.animateScrollToItem(target)
            else state.pagerState.animateScrollToPage(target)
        }
    }

    LaunchedEffect(currentPage, state.isDraggingSlider) { if (!state.isDraggingSlider) state.sliderValue = currentPage.toFloat() }
    LaunchedEffect(state.isLoaded, state.renderer.pageCount) {
        if (state.isLoaded && state.renderer.pageCount > 0 && !state.hasRestoredPosition) {
            val idx = (state.savedPage - 1).coerceAtLeast(0)
            if (state.savedPage in 2..state.renderer.pageCount) {
                state.listState.scrollToItem(idx, state.savedOffset)
                state.pagerState.scrollToPage(idx)
            }
            state.hasRestoredPosition = true
        }
    }
    LaunchedEffect(currentPage, state.isLoaded, state.renderer.pageCount) {
        if (state.isLoaded && state.renderer.pageCount > 0) {
            val idx = currentPage - 1
            state.renderer.prefetchPage(idx + 1)
            state.renderer.prefetchPage(idx - 1)
        }
    }
    LaunchedEffect(currentPage, state.listState.firstVisibleItemScrollOffset, state.isLoaded, state.hasRestoredPosition) {
        if (state.isLoaded && state.hasRestoredPosition && state.renderer.pageCount > 0) {
            delay(350)
            val offset = if (state.readingLayout == ReadingLayout.VERTICAL) state.listState.firstVisibleItemScrollOffset else 0
            val total = state.renderer.pageCount
            withContext(Dispatchers.IO) {
                state.documentStore.updateProgress(uri, currentPage, total, offset)
            }
        }
    }

    BackHandler { state.handleBack(onClose) }

    val volumeKeysPageTurn by themePreferences.volumeKeysPageTurn
    BindReaderVolumeKeys(
        enabled = volumeKeysPageTurn,
        currentPage = currentPage,
        pageCount = state.renderer.pageCount,
        onNext = { scrollTo(currentPage) },
        onPrev = { scrollTo(currentPage - 2) }
    )

    val mode = state.pageColorMode
    Box(modifier = Modifier.fillMaxSize().background(mode.containerBg)) {
        PdfContentCanvas(
            renderer = state.renderer, uri = uri, isLoaded = state.isLoaded, errorMessage = state.errorMessage,
            readingLayout = state.readingLayout, pageColorMode = state.pageColorMode, cardBg = mode.cardBg,
            scale = scale, offsetX = state.offsetX, offsetY = state.offsetY, listState = state.listState, pagerState = state.pagerState,
            textExtractor = state.textExtractor, allHighlights = state.allHighlights,
            searchQuery = state.searchQuery, searchMatches = state.searchMatches,
            isSelectionModeActive = state.isSelectionModeActive, selectedSpans = state.selectedSpans,
            selectedHighlight = state.selectedHighlight, selectedPage = state.selectedPage,
            onViewportSizeChanged = { state.viewportSize = it },
            onSelectSpans = { p, spans -> state.selectedPage = p; state.selectedHighlight = null; state.selectedSpans = spans },
            onTapHighlight = { h -> state.selectedPage = h.pageIndex; state.selectedSpans = emptyList(); state.selectedHighlight = h },
            onClearSelection = { state.clearSelection() }, onTap = { state.showControls = !state.showControls },
            onDoubleTap = { if (state.targetScale > 1.2f) { state.targetScale = 1f; state.offsetX = 0f; state.offsetY = 0f } else state.targetScale = 2.2f },
            onTransform = { zoom, pan ->
                val newScale = (state.targetScale * zoom).coerceIn(1f, 4.5f)
                state.targetScale = newScale
                if (newScale > 1.05f) {
                    val maxX = ((state.viewportSize.width * (newScale - 1f)) / 2f).coerceAtLeast(100f)
                    val maxY = ((state.viewportSize.height * (newScale - 1f)) / 2f).coerceAtLeast(100f)
                    state.offsetX = (state.offsetX + pan.x).coerceIn(-maxX, maxX)
                    state.offsetY = (state.offsetY + pan.y).coerceIn(-maxY, maxY)
                } else { state.targetScale = 1f; state.offsetX = 0f; state.offsetY = 0f }
            }
        )

        PdfViewerOverlays(
            showControls = state.showControls, title = title, currentPage = currentPage, pageCount = state.renderer.pageCount,
            barBg = mode.barBg, textColor = mode.textColor, readingLayout = state.readingLayout, pageColorMode = state.pageColorMode,
            isSelectionModeActive = state.isSelectionModeActive, selectedSpans = state.selectedSpans, selectedHighlight = state.selectedHighlight,
            showResumePill = state.showResumePill, resumedPage = state.savedPage, sliderValue = state.sliderValue,
            isDraggingSlider = state.isDraggingSlider, showJumpDialog = state.showJumpDialog,
            showSearch = state.showSearch, searchQuery = state.searchQuery, searchMatchCount = state.searchMatches.size,
            currentSearchMatchIndex = state.currentMatchIndex, isSearching = state.isSearching, showTocDialog = state.showTocDialog,
            outline = state.outline, allHighlights = state.allHighlights,
            onOpenSearch = { state.showSearch = true },
            onCloseSearch = { state.closeSearch() },
            onQueryChange = { q -> state.updateSearchQuery(scope, q) { scrollTo(it) } },
            onNextSearchMatch = {
                if (state.searchMatches.isNotEmpty()) {
                    state.currentMatchIndex = (state.currentMatchIndex + 1) % state.searchMatches.size
                    scrollTo(state.searchMatches[state.currentMatchIndex].pageIndex)
                }
            },
            onPrevSearchMatch = {
                if (state.searchMatches.isNotEmpty()) {
                    state.currentMatchIndex = if (state.currentMatchIndex > 0) state.currentMatchIndex - 1 else state.searchMatches.size - 1
                    scrollTo(state.searchMatches[state.currentMatchIndex].pageIndex)
                }
            },
            onOpenToc = { state.showTocDialog = true }, onDismissToc = { state.showTocDialog = false },
            onSelectTocPage = { p -> scrollTo(p) },
            onToggleSelectionMode = {
                state.isSelectionModeActive = !state.isSelectionModeActive
                if (!state.isSelectionModeActive) state.clearSelection()
                else Toast.makeText(state.context, "وضع التظليل مفعّل: اسحب فوق النص للتظليل", Toast.LENGTH_SHORT).show()
            },
            onToggleLayout = {
                val target = currentPage
                state.readingLayout = if (state.readingLayout == ReadingLayout.VERTICAL) ReadingLayout.HORIZONTAL else ReadingLayout.VERTICAL
                scrollTo(target - 1)
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
                (state.context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Otium PDF", text))
                Toast.makeText(state.context, "تم نسخ النص إلى الحافظة", Toast.LENGTH_SHORT).show()
                state.clearSelection(); state.isSelectionModeActive = false
            },
            onApplyHighlight = { color -> state.applyHighlight(scope, color) },
            onDeleteHighlight = { state.deleteHighlight(scope, state.selectedHighlight) },
            onDeleteHighlightItem = { h -> state.deleteHighlight(scope, h) },
            onClearSelection = { state.clearSelection(); state.isSelectionModeActive = false },
            onJumpToBeginning = { scrollTo(0); state.showResumePill = false },
            onDismissResumePill = { state.showResumePill = false },
            onSliderValueChange = { newVal -> state.isDraggingSlider = true; state.sliderValue = newVal },
            onSliderValueChangeFinished = { state.isDraggingSlider = false; scrollTo(state.sliderValue.toInt() - 1) },
            onOpenJumpDialog = { state.showJumpDialog = true },
            onDismissJumpDialog = { state.showJumpDialog = false },
            onConfirmJump = { target -> scrollTo(target - 1); state.showJumpDialog = false }
        )
    }
}
