package com.otium.lab.pdf.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.otium.lab.pdf.model.PdfHighlight
import com.otium.lab.pdf.model.PdfTextSpan
import kotlin.math.max
import kotlin.math.min

@Composable
fun PdfTextSelectionOverlay(
    pageIndex: Int,
    spans: List<PdfTextSpan>,
    highlights: List<PdfHighlight>,
    selectedSpans: List<PdfTextSpan>,
    selectedHighlight: PdfHighlight?,
    isSelectionModeActive: Boolean,
    onSelectSpans: (List<PdfTextSpan>) -> Unit,
    onTapHighlight: (PdfHighlight) -> Unit,
    onClearSelection: () -> Unit,
    modifier: Modifier = Modifier
) {
    var dragStartOffset by remember { mutableStateOf<Offset?>(null) }
    var dragCurrentOffset by remember { mutableStateOf<Offset?>(null) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(pageIndex, spans, highlights, isSelectionModeActive) {
                detectTapGestures(
                    onLongPress = { offset ->
                        val normX = offset.x / size.width
                        val normY = offset.y / size.height
                        val hitSpan = spans.firstOrNull { it.contains(normX, normY) }
                        if (hitSpan != null) {
                            onSelectSpans(listOf(hitSpan))
                        }
                    },
                    onTap = { offset ->
                        val normX = offset.x / size.width
                        val normY = offset.y / size.height
                        // Check if an existing highlight was tapped
                        val hitHighlight = highlights.firstOrNull { h ->
                            h.bounds.any { b -> normX in b.left..b.right && normY in b.top..b.bottom }
                        }
                        if (hitHighlight != null) {
                            onTapHighlight(hitHighlight)
                        } else if (isSelectionModeActive) {
                            val hitSpan = spans.firstOrNull { it.contains(normX, normY) }
                            if (hitSpan != null) {
                                onSelectSpans(listOf(hitSpan))
                            } else {
                                onClearSelection()
                            }
                        } else {
                            onClearSelection()
                        }
                    }
                )
            }
            .then(
                if (isSelectionModeActive) {
                    Modifier.pointerInput(spans) {
                        detectDragGestures(
                            onDragStart = { start ->
                                dragStartOffset = start
                                dragCurrentOffset = start
                            },
                            onDragEnd = {
                                val start = dragStartOffset
                                val end = dragCurrentOffset
                                if (start != null && end != null && size.width > 0 && size.height > 0) {
                                    val rLeft = min(start.x, end.x) / size.width
                                    val rRight = max(start.x, end.x) / size.width
                                    val rTop = min(start.y, end.y) / size.height
                                    val rBottom = max(start.y, end.y) / size.height

                                    val matched = spans.filter { it.intersects(rLeft, rTop, rRight, rBottom) }
                                    if (matched.isNotEmpty()) {
                                        onSelectSpans(matched)
                                    }
                                }
                                dragStartOffset = null
                                dragCurrentOffset = null
                            },
                            onDragCancel = {
                                dragStartOffset = null
                                dragCurrentOffset = null
                            },
                            onDrag = { change, _ ->
                                dragCurrentOffset = change.position
                            }
                        )
                    }
                } else Modifier
            )
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val canvasWidth = size.width
            val canvasHeight = size.height

            // 1. Draw saved highlights
            highlights.forEach { highlight ->
                val color = Color(highlight.colorArgb).copy(alpha = 0.38f)
                highlight.bounds.forEach { b ->
                    val left = b.left * canvasWidth
                    val top = b.top * canvasHeight
                    val width = (b.right - b.left) * canvasWidth
                    val height = (b.bottom - b.top) * canvasHeight

                    drawRoundRect(
                        color = color,
                        topLeft = Offset(left, top),
                        size = Size(width, height),
                        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                        blendMode = BlendMode.Multiply
                    )
                }
            }

            // 2. Draw currently selected text spans
            val selectionColor = Color(0xFF38BDF8).copy(alpha = 0.40f)
            selectedSpans.forEach { span ->
                val left = span.normLeft * canvasWidth
                val top = span.normTop * canvasHeight
                val width = (span.normRight - span.normLeft) * canvasWidth
                val height = (span.normBottom - span.normTop) * canvasHeight

                drawRoundRect(
                    color = selectionColor,
                    topLeft = Offset(left, top),
                    size = Size(width, height),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
            }
        }
    }
}
