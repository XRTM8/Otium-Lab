package com.otium.lab.pdf.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.PdfHighlight
import com.otium.lab.pdf.model.PdfOutlineItem
import com.otium.lab.pdf.model.PdfTextSpan
import com.otium.lab.pdf.model.ReadingLayout

@Composable
fun PdfViewerOverlays(
    showControls: Boolean,
    title: String,
    currentPage: Int,
    pageCount: Int,
    barBg: Color,
    textColor: Color,
    readingLayout: ReadingLayout,
    pageColorMode: PageColorMode,
    isSelectionModeActive: Boolean,
    selectedSpans: List<PdfTextSpan>,
    selectedHighlight: PdfHighlight?,
    showResumePill: Boolean,
    resumedPage: Int,
    sliderValue: Float,
    isDraggingSlider: Boolean,
    showJumpDialog: Boolean,
    showDisplaySheet: Boolean = false,
    showSearch: Boolean = false,
    searchQuery: String = "",
    searchMatchCount: Int = 0,
    currentSearchMatchIndex: Int = 0,
    isSearching: Boolean = false,
    showTocDialog: Boolean = false,
    outline: List<PdfOutlineItem> = emptyList(),
    allHighlights: List<PdfHighlight> = emptyList(),
    onOpenSearch: () -> Unit = {}, onCloseSearch: () -> Unit = {}, onQueryChange: (String) -> Unit = {},
    onNextSearchMatch: () -> Unit = {}, onPrevSearchMatch: () -> Unit = {},
    onOpenToc: () -> Unit = {}, onDismissToc: () -> Unit = {}, onSelectTocPage: (Int) -> Unit = {},
    onOpenDisplayOptions: () -> Unit = {}, onDismissDisplayOptions: () -> Unit = {},
    onSelectReadingLayout: (ReadingLayout) -> Unit = {}, onSelectColorMode: (PageColorMode) -> Unit = {},
    onToggleSelectionMode: () -> Unit, onClose: () -> Unit,
    onCopyText: () -> Unit, onApplyHighlight: (Long) -> Unit, onDeleteHighlight: () -> Unit,
    onDeleteHighlightItem: (PdfHighlight) -> Unit = {}, onClearSelection: () -> Unit,
    onJumpToBeginning: () -> Unit, onDismissResumePill: () -> Unit,
    onSliderValueChange: (Float) -> Unit, onSliderValueChangeFinished: () -> Unit,
    onOpenJumpDialog: () -> Unit, onDismissJumpDialog: () -> Unit, onConfirmJump: (Int) -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        PdfTopOverlay(
            visible = showControls,
            title = title,
            currentPage = currentPage,
            pageCount = pageCount,
            barBg = barBg,
            textColor = textColor,
            isSelectionModeActive = isSelectionModeActive,
            onToggleSelectionMode = onToggleSelectionMode,
            onOpenToc = onOpenToc,
            onOpenDisplayOptions = onOpenDisplayOptions,
            onClose = onClose,
            modifier = Modifier.align(Alignment.TopCenter)
        )

        PdfSearchBar(
            visible = showSearch,
            query = searchQuery,
            matchCount = searchMatchCount,
            currentMatchIndex = currentSearchMatchIndex,
            isSearching = isSearching,
            barBg = barBg,
            textColor = textColor,
            onQueryChange = onQueryChange,
            onNextMatch = onNextSearchMatch,
            onPrevMatch = onPrevSearchMatch,
            onClose = onCloseSearch,
            modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding()
        )

        PdfHighlightBanner(
            visible = isSelectionModeActive && selectedSpans.isEmpty() && selectedHighlight == null,
            onCancel = onToggleSelectionMode,
            modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 72.dp)
        )

        PdfSelectionActionBar(
            visible = selectedSpans.isNotEmpty() || selectedHighlight != null,
            selectedText = selectedHighlight?.text ?: selectedSpans.joinToString(" ") { it.text },
            selectedHighlight = selectedHighlight,
            onCopy = onCopyText,
            onHighlight = onApplyHighlight,
            onDeleteHighlight = onDeleteHighlight,
            onClear = onClearSelection,
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 84.dp)
        )

        PdfResumePill(
            visible = showResumePill,
            resumedPage = resumedPage,
            totalPages = pageCount,
            onJumpToBeginning = onJumpToBeginning,
            onDismiss = onDismissResumePill,
            modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 80.dp)
        )

        PdfBottomScrubber(
            visible = showControls,
            currentPage = currentPage,
            pageCount = pageCount,
            sliderValue = sliderValue,
            isDraggingSlider = isDraggingSlider,
            barBg = barBg,
            textColor = textColor,
            isSelectionModeActive = isSelectionModeActive,
            onToggleSelectionMode = onToggleSelectionMode,
            onSliderValueChange = onSliderValueChange,
            onSliderValueChangeFinished = onSliderValueChangeFinished,
            onOpenJumpDialog = onOpenJumpDialog,
            modifier = Modifier.align(Alignment.BottomCenter)
        )

        if (showJumpDialog) {
            PdfJumpDialog(
                pageCount = pageCount,
                initialPage = currentPage,
                onDismiss = onDismissJumpDialog,
                onConfirmJump = onConfirmJump
            )
        }

        if (showTocDialog) {
            PdfTableOfContentsDialog(
                outline = outline,
                currentPage = currentPage,
                highlights = allHighlights,
                documentTitle = title,
                onDeleteHighlight = onDeleteHighlightItem,
                onOpenSearch = onOpenSearch,
                onSelectPage = onSelectTocPage,
                onDismiss = onDismissToc
            )
        }

        if (showDisplaySheet) {
            PdfDisplayOptionsSheet(
                pageColorMode = pageColorMode,
                readingLayout = readingLayout,
                isSelectionModeActive = isSelectionModeActive,
                onSelectColorMode = onSelectColorMode,
                onSelectReadingLayout = onSelectReadingLayout,
                onToggleSelectionMode = onToggleSelectionMode,
                onOpenSearch = onOpenSearch,
                onDismiss = onDismissDisplayOptions
            )
        }
    }
}
