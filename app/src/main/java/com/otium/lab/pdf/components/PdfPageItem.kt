package com.otium.lab.pdf.components

import android.graphics.Bitmap
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
import com.otium.lab.pdf.model.PdfTextSpan
import com.otium.lab.pdf.model.SepiaColorMatrix
import com.otium.lab.pdf.text.PdfTextExtractor

@Composable
fun PdfPageItem(
    renderer: NativePdfRenderer,
    pageIndex: Int,
    pageColorMode: PageColorMode,
    cardBg: Color,
    textExtractor: PdfTextExtractor? = null,
    highlights: List<PdfHighlight> = emptyList(),
    selectedSpans: List<PdfTextSpan> = emptyList(),
    selectedHighlight: PdfHighlight? = null,
    isSelectionModeActive: Boolean = false,
    onSelectSpans: (List<PdfTextSpan>) -> Unit = {},
    onTapHighlight: (PdfHighlight) -> Unit = {},
    onClearSelection: () -> Unit = {}
) {
    var pageBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var pageSpans by remember { mutableStateOf<List<PdfTextSpan>>(emptyList()) }

    LaunchedEffect(pageIndex) {
        isLoading = true
        try {
            pageBitmap = renderer.renderPage(pageIndex)
        } catch (_: Exception) {}
        isLoading = false
    }

    LaunchedEffect(pageIndex, renderer.documentUri) {
        val uri = renderer.documentUri
        if (uri != null && textExtractor != null) {
            pageSpans = textExtractor.extractPageSpans(uri, pageIndex)
        }
    }

    val colorFilter = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> ColorFilter.colorMatrix(InvertColorMatrix)
        PageColorMode.SEPIA -> ColorFilter.colorMatrix(SepiaColorMatrix)
        PageColorMode.ORIGINAL -> null
    }

    // Edge-to-edge flush canvas: NO horizontal padding, full screen width
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(cardBg),
        contentAlignment = Alignment.Center
    ) {
        val bmp = pageBitmap
        if (bmp != null) {
            Box(modifier = Modifier.fillMaxWidth()) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "صفحة ${pageIndex + 1}",
                    colorFilter = colorFilter,
                    contentScale = ContentScale.FillWidth,
                    modifier = Modifier.fillMaxWidth()
                )

                PdfTextSelectionOverlay(
                    pageIndex = pageIndex,
                    spans = pageSpans,
                    highlights = highlights,
                    selectedSpans = selectedSpans,
                    selectedHighlight = selectedHighlight,
                    isSelectionModeActive = isSelectionModeActive,
                    onSelectSpans = onSelectSpans,
                    onTapHighlight = onTapHighlight,
                    onClearSelection = onClearSelection,
                    modifier = Modifier.matchParentSize()
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
