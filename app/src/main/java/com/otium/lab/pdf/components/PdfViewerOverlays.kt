package com.otium.lab.pdf.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.PdfBookmark
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
    lockHorizontalPan: Boolean,
    isBookmarked: Boolean,
    selectedSpans: List<PdfTextSpan>,
    selectedHighlight: PdfHighlight?,
    showResumePill: Boolean,
    resumedPage: Int,
    sliderValue: Float,
    isDraggingSlider: Boolean,
    showJumpDialog: Boolean,
    showNoteDialog: Boolean,
    showDisplaySheet: Boolean = false,
    showSearch: Boolean = false,
    searchQuery: String = "",
    searchMatchCount: Int = 0,
    currentSearchMatchIndex: Int = 0,
    isSearching: Boolean = false,
    showTocDialog: Boolean = false,
    outline: List<PdfOutlineItem> = emptyList(),
    allHighlights: List<PdfHighlight> = emptyList(),
    allBookmarks: List<PdfBookmark> = emptyList(),
    onOpenSearch: () -> Unit = {}, onCloseSearch: () -> Unit = {}, onQueryChange: (String) -> Unit = {},
    onNextSearchMatch: () -> Unit = {}, onPrevSearchMatch: () -> Unit = {},
    onOpenToc: () -> Unit = {}, onDismissToc: () -> Unit = {}, onSelectTocPage: (Int) -> Unit = {},
    onOpenDisplayOptions: () -> Unit = {}, onDismissDisplayOptions: () -> Unit = {},
    onSelectReadingLayout: (ReadingLayout) -> Unit = {}, onSelectColorMode: (PageColorMode) -> Unit = {},
    onToggleLockHorizontalPan: () -> Unit = {},
    onToggleBookmark: () -> Unit = {}, onDeleteBookmark: (PdfBookmark) -> Unit = {},
    onToggleSelectionMode: () -> Unit, onClose: () -> Unit,
    onCopyText: () -> Unit, onApplyHighlight: (Long) -> Unit, onDeleteHighlight: () -> Unit,
    onOpenNoteDialog: () -> Unit = {}, onDismissNoteDialog: () -> Unit = {}, onSaveHighlightNote: (String) -> Unit = {},
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
            isBookmarked = isBookmarked,
            isSelectionModeActive = isSelectionModeActive,
            onToggleBookmark = onToggleBookmark,
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
            onOpenNoteDialog = onOpenNoteDialog,
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
            outline = outline,
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

        if (showNoteDialog) {
            PdfHighlightNoteDialog(
                initialNote = selectedHighlight?.note ?: "",
                onDismiss = onDismissNoteDialog,
                onSave = onSaveHighlightNote
            )
        }

        if (showTocDialog) {
            PdfTableOfContentsDialog(
                outline = outline,
                currentPage = currentPage,
                highlights = allHighlights,
                bookmarks = allBookmarks,
                documentTitle = title,
                onDeleteHighlight = onDeleteHighlightItem,
                onDeleteBookmark = onDeleteBookmark,
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
                lockHorizontalPan = lockHorizontalPan,
                onSelectColorMode = onSelectColorMode,
                onSelectReadingLayout = onSelectReadingLayout,
                onToggleSelectionMode = onToggleSelectionMode,
                onToggleLockHorizontalPan = onToggleLockHorizontalPan,
                onOpenSearch = onOpenSearch,
                onDismiss = onDismissDisplayOptions
            )
        }
    }
}

@Composable
private fun PdfHighlightNoteDialog(
    initialNote: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var noteText by remember(initialNote) { mutableStateOf(initialNote) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(20.dp),
        title = {
            Text(
                text = if (initialNote.isBlank()) "إضافة ملاحظة" else "تعديل الملاحظة",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            OutlinedTextField(
                value = noteText,
                onValueChange = { noteText = it },
                placeholder = { Text("اكتب ملاحظتك أو ملخصك هنا...") },
                minLines = 3,
                maxLines = 5,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )
        },
        confirmButton = {
            Button(
                onClick = { onSave(noteText) },
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            ) {
                Text("حفظ", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("إلغاء")
            }
        }
    )
}
