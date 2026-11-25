package com.otium.lab.scanner.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.otium.lab.scanner.model.NormalizedQuad

@Composable
fun DocumentCropOverlay(
    quad: NormalizedQuad,
    imageWidth: Int,
    imageHeight: Int,
    primaryColor: Color,
    onQuadChange: (NormalizedQuad) -> Unit,
    modifier: Modifier = Modifier,
    previewBitmap: Bitmap? = null
) {
    var activeHandle by remember { mutableIntStateOf(-1) }

    Canvas(
        modifier = modifier.fillMaxSize().pointerInput(imageWidth, imageHeight) {
            detectDragGestures(
                onDragStart = { touchOffset ->
                    val (offsetX, offsetY, dispW, dispH) = calculateBounds(size.width, size.height, imageWidth, imageHeight)
                    val pts = listOf(
                        toScreen(quad.topLeft, offsetX, offsetY, dispW, dispH),
                        toScreen(quad.topRight, offsetX, offsetY, dispW, dispH),
                        toScreen(quad.bottomRight, offsetX, offsetY, dispW, dispH),
                        toScreen(quad.bottomLeft, offsetX, offsetY, dispW, dispH)
                    )
                    activeHandle = pts.indexOfFirst { (it - touchOffset).getDistance() <= 36.dp.toPx() }
                },
                onDrag = { change, dragAmount ->
                    if (activeHandle != -1) {
                        change.consume()
                        val (_, _, dispW, dispH) = calculateBounds(size.width, size.height, imageWidth, imageHeight)
                        if (dispW > 0 && dispH > 0) {
                            val cur = when (activeHandle) { 0 -> quad.topLeft; 1 -> quad.topRight; 2 -> quad.bottomRight; else -> quad.bottomLeft }
                            val updated = Offset((cur.x + dragAmount.x / dispW).coerceIn(0f, 1f), (cur.y + dragAmount.y / dispH).coerceIn(0f, 1f))
                            onQuadChange(
                                when (activeHandle) {
                                    0 -> quad.copy(topLeft = updated)
                                    1 -> quad.copy(topRight = updated)
                                    2 -> quad.copy(bottomRight = updated)
                                    else -> quad.copy(bottomLeft = updated)
                                }
                            )
                        }
                    }
                },
                onDragEnd = { activeHandle = -1 },
                onDragCancel = { activeHandle = -1 }
            )
        }
    ) {
        val (offsetX, offsetY, dispW, dispH) = calculateBounds(size.width.toInt(), size.height.toInt(), imageWidth, imageHeight)
        if (dispW <= 0 || dispH <= 0) return@Canvas

        val pts = listOf(
            toScreen(quad.topLeft, offsetX, offsetY, dispW, dispH),
            toScreen(quad.topRight, offsetX, offsetY, dispW, dispH),
            toScreen(quad.bottomRight, offsetX, offsetY, dispW, dispH),
            toScreen(quad.bottomLeft, offsetX, offsetY, dispW, dispH)
        )

        val polyPath = Path().apply {
            moveTo(pts[0].x, pts[0].y)
            for (i in 1..3) lineTo(pts[i].x, pts[i].y)
            close()
        }
        drawPath(polyPath, color = primaryColor, style = Stroke(width = 3.dp.toPx()))

        val handleRadius = 14.dp.toPx()
        pts.forEachIndexed { index, pt ->
            val isSelected = index == activeHandle
            val r = if (isSelected) handleRadius * 1.3f else handleRadius
            drawCircle(color = Color.White, radius = r, center = pt)
            drawCircle(color = primaryColor, radius = r - 3.dp.toPx(), center = pt)
        }

        if (activeHandle != -1 && previewBitmap != null && !previewBitmap.isRecycled) {
            val activePt = pts[activeHandle]
            val loupeRadius = 46.dp.toPx()
            val loupeX = activePt.x.coerceIn(loupeRadius + 12f, size.width - loupeRadius - 12f)
            val loupeY = if (activePt.y - 88.dp.toPx() > loupeRadius + 12f) activePt.y - 88.dp.toPx() else activePt.y + 88.dp.toPx()
            val loupeCenter = Offset(loupeX, loupeY)

            val norm = when (activeHandle) { 0 -> quad.topLeft; 1 -> quad.topRight; 2 -> quad.bottomRight; else -> quad.bottomLeft }
            val boxHalf = (previewBitmap.width * 0.08f).toInt().coerceIn(24, 72)
            val cropLeft = ((norm.x * previewBitmap.width).toInt() - boxHalf).coerceIn(0, (previewBitmap.width - boxHalf * 2).coerceAtLeast(0))
            val cropTop = ((norm.y * previewBitmap.height).toInt() - boxHalf).coerceIn(0, (previewBitmap.height - boxHalf * 2).coerceAtLeast(0))
            val cropW = (boxHalf * 2).coerceAtMost(previewBitmap.width - cropLeft)
            val cropH = (boxHalf * 2).coerceAtMost(previewBitmap.height - cropTop)

            if (cropW > 0 && cropH > 0) {
                val imgBitmap = previewBitmap.asImageBitmap()
                drawContext.canvas.save()
                drawContext.canvas.clipPath(Path().apply { addOval(Rect(loupeCenter, loupeRadius)) })
                drawImage(
                    image = imgBitmap,
                    srcOffset = IntOffset(cropLeft, cropTop),
                    srcSize = IntSize(cropW, cropH),
                    dstOffset = IntOffset((loupeCenter.x - loupeRadius).toInt(), (loupeCenter.y - loupeRadius).toInt()),
                    dstSize = IntSize((loupeRadius * 2).toInt(), (loupeRadius * 2).toInt())
                )
                drawContext.canvas.restore()
            }

            drawCircle(color = Color.White, radius = loupeRadius, center = loupeCenter, style = Stroke(width = 3.dp.toPx()))
            drawCircle(color = primaryColor, radius = loupeRadius - 2.dp.toPx(), center = loupeCenter, style = Stroke(width = 1.5.dp.toPx()))
            drawLine(color = primaryColor, start = Offset(loupeCenter.x - 10.dp.toPx(), loupeCenter.y), end = Offset(loupeCenter.x + 10.dp.toPx(), loupeCenter.y), strokeWidth = 2.dp.toPx())
            drawLine(color = primaryColor, start = Offset(loupeCenter.x, loupeCenter.y - 10.dp.toPx()), end = Offset(loupeCenter.x, loupeCenter.y + 10.dp.toPx()), strokeWidth = 2.dp.toPx())
        }
    }
}

private fun calculateBounds(boxW: Int, boxH: Int, imgW: Int, imgH: Int): FloatArray {
    if (imgW <= 0 || imgH <= 0) return floatArrayOf(0f, 0f, 0f, 0f)
    val scale = minOf(boxW.toFloat() / imgW.toFloat(), boxH.toFloat() / imgH.toFloat())
    val dispW = imgW * scale
    val dispH = imgH * scale
    return floatArrayOf((boxW - dispW) / 2f, (boxH - dispH) / 2f, dispW, dispH)
}

private fun toScreen(norm: Offset, ox: Float, oy: Float, dw: Float, dh: Float): Offset = Offset(ox + norm.x * dw, oy + norm.y * dh)
