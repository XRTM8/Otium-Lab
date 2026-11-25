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
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

@Composable
fun PdfTextSelectionOverlay(
    pageIndex: Int,
    spans: List<PdfTextSpan>,
    highlights: List<PdfHighlight>,
    selectedSpans: List<PdfTextSpan>,
    selectedHighlight: PdfHighlight?,
    searchMatchedSpans: List<PdfTextSpan> = emptyList(),
    isSelectionModeActive: Boolean,
    onSelectSpans: (List<PdfTextSpan>) -> Unit,
    onTapHighlight: (PdfHighlight) -> Unit,
    onClearSelection: () -> Unit,
    onRequestSpansForLongPress: ((normX: Float, normY: Float) -> Unit)? = null,
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
                        if (size.width <= 0 || size.height <= 0) return@detectTapGestures
                        val normX = offset.x / size.width; val normY = offset.y / size.height
                        if (spans.isEmpty() && onRequestSpansForLongPress != null) {
                            onRequestSpansForLongPress(normX, normY)
                            return@detectTapGestures
                        }
                        val hitSpan = spans.firstOrNull { it.contains(normX, normY) }
                        if (hitSpan != null) onSelectSpans(listOf(hitSpan))
                        else {
                            val w = 0.16f; val h = 0.035f
                            onSelectSpans(listOf(PdfTextSpan("تظليل محدد", pageIndex, (normX - w / 2).coerceIn(0f, 1f - w), (normY - h / 2).coerceIn(0f, 1f - h), (normX + w / 2).coerceIn(w, 1f), (normY + h / 2).coerceIn(h, 1f))))
                        }
                    },
                    onTap = { offset ->
                        val normX = offset.x / size.width; val normY = offset.y / size.height
                        val hitHighlight = highlights.firstOrNull { h ->
                            h.bounds.any { b -> normX in b.left..b.right && normY in b.top..b.bottom }
                        }
                        if (hitHighlight != null) onTapHighlight(hitHighlight)
                        else if (isSelectionModeActive) {
                            val hitSpan = spans.firstOrNull { it.contains(normX, normY) }
                            if (hitSpan != null) onSelectSpans(listOf(hitSpan)) else onClearSelection()
                        } else onClearSelection()
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
                                val s = dragStartOffset; val e = dragCurrentOffset
                                if (s != null && e != null && size.width > 0 && size.height > 0) {
                                    val rL = min(s.x, e.x) / size.width; val rR = max(s.x, e.x) / size.width
                                    val rT = min(s.y, e.y) / size.height; val rB = max(s.y, e.y) / size.height
                                    if ((rR - rL) > 0.015f || (rB - rT) > 0.015f) {
                                        val matched = spans.filter { it.intersects(rL, rT, rR, rB) }
                                        if (matched.isNotEmpty()) onSelectSpans(matched)
                                        else onSelectSpans(listOf(PdfTextSpan("تظليل صفحة ${pageIndex + 1}", pageIndex, rL.coerceIn(0f, 1f), rT.coerceIn(0f, 1f), rR.coerceIn(0f, 1f), rB.coerceIn(0f, 1f))))
                                    }
                                }
                                dragStartOffset = null; dragCurrentOffset = null
                            },
                            onDragCancel = { dragStartOffset = null; dragCurrentOffset = null },
                            onDrag = { change, _ ->
                                dragCurrentOffset = change.position
                                change.consume()
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
                    val left = b.left * canvasWidth; val top = b.top * canvasHeight
                    val width = (b.right - b.left) * canvasWidth; val height = (b.bottom - b.top) * canvasHeight

                    drawRoundRect(
                        color = color, topLeft = Offset(left, top), size = Size(width, height),
                        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()), blendMode = BlendMode.Multiply
                    )
                }
            }

            // 1.5 Draw active search match highlights
            val searchColor = Color(0xFFF59E0B).copy(alpha = 0.48f)
            searchMatchedSpans.forEach { span ->
                val left = span.normLeft * canvasWidth; val top = span.normTop * canvasHeight
                val width = (span.normRight - span.normLeft) * canvasWidth; val height = (span.normBottom - span.normTop) * canvasHeight
                drawRoundRect(
                    color = searchColor, topLeft = Offset(left, top), size = Size(width, height),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
            }

            // 2. Draw currently selected text spans
            val selectionColor = Color(0xFF38BDF8).copy(alpha = 0.40f)
            selectedSpans.forEach { span ->
                val left = span.normLeft * canvasWidth; val top = span.normTop * canvasHeight
                val width = (span.normRight - span.normLeft) * canvasWidth; val height = (span.normBottom - span.normTop) * canvasHeight

                drawRoundRect(
                    color = selectionColor, topLeft = Offset(left, top), size = Size(width, height),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
            }

            // 3. Draw active drag selection rectangle
            val s = dragStartOffset
            val e = dragCurrentOffset
            if (s != null && e != null) {
                val dLeft = min(s.x, e.x); val dTop = min(s.y, e.y)
                val dWidth = max(abs(e.x - s.x), 2f); val dHeight = max(abs(e.y - s.y), 2f)
                drawRoundRect(
                    color = Color(0xFF38BDF8).copy(alpha = 0.28f),
                    topLeft = Offset(dLeft, dTop), size = Size(dWidth, dHeight),
                    cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx())
                )
            }
        }
    }
}
