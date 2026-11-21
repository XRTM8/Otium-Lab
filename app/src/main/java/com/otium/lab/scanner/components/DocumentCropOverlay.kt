package com.otium.lab.scanner.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.otium.lab.scanner.model.NormalizedQuad

@Composable
fun DocumentCropOverlay(
    quad: NormalizedQuad,
    imageWidth: Int,
    imageHeight: Int,
    primaryColor: Color,
    onQuadChange: (NormalizedQuad) -> Unit,
    modifier: Modifier = Modifier
) {
    var activeHandle by remember { mutableIntStateOf(-1) }

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .pointerInput(imageWidth, imageHeight) {
                detectDragGestures(
                    onDragStart = { touchOffset ->
                        val (offsetX, offsetY, dispW, dispH) = calculateBounds(size.width, size.height, imageWidth, imageHeight)
                        val touchRadiusPx = 36.dp.toPx()

                        val pts = listOf(
                            toScreen(quad.topLeft, offsetX, offsetY, dispW, dispH),
                            toScreen(quad.topRight, offsetX, offsetY, dispW, dispH),
                            toScreen(quad.bottomRight, offsetX, offsetY, dispW, dispH),
                            toScreen(quad.bottomLeft, offsetX, offsetY, dispW, dispH)
                        )

                        activeHandle = pts.indexOfFirst { (it - touchOffset).getDistance() <= touchRadiusPx }
                    },
                    onDrag = { change, dragAmount ->
                        if (activeHandle != -1) {
                            change.consume()
                            val (offsetX, offsetY, dispW, dispH) = calculateBounds(size.width, size.height, imageWidth, imageHeight)
                            if (dispW > 0 && dispH > 0) {
                                val currentNorm = when (activeHandle) {
                                    0 -> quad.topLeft
                                    1 -> quad.topRight
                                    2 -> quad.bottomRight
                                    else -> quad.bottomLeft
                                }
                                val newX = (currentNorm.x + dragAmount.x / dispW).coerceIn(0f, 1f)
                                val newY = (currentNorm.y + dragAmount.y / dispH).coerceIn(0f, 1f)
                                val updated = Offset(newX, newY)

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

        val p0 = toScreen(quad.topLeft, offsetX, offsetY, dispW, dispH)
        val p1 = toScreen(quad.topRight, offsetX, offsetY, dispW, dispH)
        val p2 = toScreen(quad.bottomRight, offsetX, offsetY, dispW, dispH)
        val p3 = toScreen(quad.bottomLeft, offsetX, offsetY, dispW, dispH)

        // Draw connecting polygon
        val path = Path().apply {
            moveTo(p0.x, p0.y)
            lineTo(p1.x, p1.y)
            lineTo(p2.x, p2.y)
            lineTo(p3.x, p3.y)
            close()
        }
        drawPath(path, color = primaryColor, style = Stroke(width = 3.dp.toPx()))

        // Draw 4 circular handles
        val handleRadius = 14.dp.toPx()
        val borderStroke = 3.dp.toPx()
        listOf(p0, p1, p2, p3).forEachIndexed { index, pt ->
            val isSelected = index == activeHandle
            drawCircle(color = Color.White, radius = if (isSelected) handleRadius * 1.25f else handleRadius, center = pt)
            drawCircle(color = primaryColor, radius = (if (isSelected) handleRadius * 1.25f else handleRadius) - borderStroke, center = pt)
        }
    }
}

private fun calculateBounds(boxW: Int, boxH: Int, imgW: Int, imgH: Int): FloatArray {
    if (imgW <= 0 || imgH <= 0) return floatArrayOf(0f, 0f, 0f, 0f)
    val scale = minOf(boxW.toFloat() / imgW.toFloat(), boxH.toFloat() / imgH.toFloat())
    val dispW = imgW * scale
    val dispH = imgH * scale
    val offsetX = (boxW - dispW) / 2f
    val offsetY = (boxH - dispH) / 2f
    return floatArrayOf(offsetX, offsetY, dispW, dispH)
}

private fun toScreen(norm: Offset, ox: Float, oy: Float, dw: Float, dh: Float): Offset {
    return Offset(ox + norm.x * dw, oy + norm.y * dh)
}
