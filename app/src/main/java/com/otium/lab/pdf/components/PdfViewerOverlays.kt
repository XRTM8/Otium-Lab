package com.otium.lab.pdf.components

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.PdfHighlight
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
    onToggleSelectionMode: () -> Unit,
    onToggleLayout: () -> Unit,
    onToggleColorMode: () -> Unit,
    onClose: () -> Unit,
    onCopyText: () -> Unit,
    onApplyHighlight: (Long) -> Unit,
    onDeleteHighlight: () -> Unit,
    onClearSelection: () -> Unit,
    onJumpToBeginning: () -> Unit,
    onDismissResumePill: () -> Unit,
    onSliderValueChange: (Float) -> Unit,
    onSliderValueChangeFinished: () -> Unit,
    onOpenJumpDialog: () -> Unit,
    onDismissJumpDialog: () -> Unit,
    onConfirmJump: (Int) -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        PdfTopOverlay(
            visible = showControls,
            title = title,
            currentPage = currentPage,
            pageCount = pageCount,
            barBg = barBg,
            textColor = textColor,
            readingLayout = readingLayout,
            pageColorMode = pageColorMode,
            isSelectionModeActive = isSelectionModeActive,
            onToggleSelectionMode = onToggleSelectionMode,
            onToggleLayout = onToggleLayout,
            onToggleColorMode = onToggleColorMode,
            onClose = onClose,
            modifier = Modifier.align(Alignment.TopCenter)
        )

        PdfSelectionActionBar(
            visible = selectedSpans.isNotEmpty() || selectedHighlight != null,
            selectedText = selectedHighlight?.text ?: selectedSpans.joinToString(" ") { it.text },
            selectedHighlight = selectedHighlight,
            onCopy = onCopyText,
            onHighlight = onApplyHighlight,
            onDeleteHighlight = onDeleteHighlight,
            onClear = onClearSelection,
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 70.dp)
        )

        PdfResumePill(
            visible = showResumePill,
            resumedPage = resumedPage,
            totalPages = pageCount,
            onJumpToBeginning = onJumpToBeginning,
            onDismiss = onDismissResumePill,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 85.dp)
        )

        PdfBottomScrubber(
            visible = showControls,
            currentPage = currentPage,
            pageCount = pageCount,
            sliderValue = sliderValue,
            isDraggingSlider = isDraggingSlider,
            barBg = barBg,
            textColor = textColor,
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
    }
}
