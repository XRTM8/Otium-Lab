package com.otium.lab.scanner.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.otium.lab.scanner.model.NormalizedQuad

@Composable
fun ScannerViewfinder(
    primaryColor: Color,
    detectedQuad: NormalizedQuad? = null,
    analysisWidth: Int = 1,
    analysisHeight: Int = 1,
    stabilityProgress: Float = 0f,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "viewfinder")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Canvas(modifier = modifier.fillMaxSize()) {
        if (detectedQuad != null && analysisWidth > 1 && analysisHeight > 1) {
            val scale = maxOf(size.width / analysisWidth, size.height / analysisHeight)
            val displayedWidth = analysisWidth * scale
            val displayedHeight = analysisHeight * scale
            val ox = (size.width - displayedWidth) / 2f
            val oy = (size.height - displayedHeight) / 2f
            fun point(p: Offset) = Offset(ox + p.x * displayedWidth, oy + p.y * displayedHeight)
            val points = listOf(detectedQuad.topLeft, detectedQuad.topRight,
                detectedQuad.bottomRight, detectedQuad.bottomLeft).map(::point)
            val path = Path().apply {
                moveTo(points[0].x, points[0].y)
                points.drop(1).forEach { lineTo(it.x, it.y) }
                close()
            }
            val fillAlpha = 0.12f + (stabilityProgress.coerceIn(0f, 1f) * 0.22f)
            val strokeColor = if (stabilityProgress > 0.65f) Color(0xFF4ADE80) else primaryColor
            drawPath(path, strokeColor.copy(alpha = fillAlpha))
            drawPath(path, strokeColor.copy(alpha = .95f), style = Stroke((3f + stabilityProgress * 1.5f).dp.toPx()))
            points.forEach {
                drawCircle(Color.White, 6.dp.toPx(), it)
                drawCircle(strokeColor, 4.dp.toPx(), it)
            }
            return@Canvas
        }
        val insetX = 24.dp.toPx()
        val insetY = 90.dp.toPx()
        val strokeWidth = 3.5.dp.toPx()
        val cornerLength = 32.dp.toPx()
        val color = primaryColor.copy(alpha = pulseAlpha)

        val w = size.width - insetX * 2
        val h = size.height - insetY * 2

        // Top-Left
        drawLine(color, Offset(insetX, insetY), Offset(insetX + cornerLength, insetY), strokeWidth)
        drawLine(color, Offset(insetX, insetY), Offset(insetX, insetY + cornerLength), strokeWidth)

        // Top-Right
        drawLine(color, Offset(insetX + w, insetY), Offset(insetX + w - cornerLength, insetY), strokeWidth)
        drawLine(color, Offset(insetX + w, insetY), Offset(insetX + w, insetY + cornerLength), strokeWidth)

        // Bottom-Left
        drawLine(color, Offset(insetX, insetY + h), Offset(insetX + cornerLength, insetY + h), strokeWidth)
        drawLine(color, Offset(insetX, insetY + h), Offset(insetX, insetY + h - cornerLength), strokeWidth)

        // Bottom-Right
        drawLine(color, Offset(insetX + w, insetY + h), Offset(insetX + w - cornerLength, insetY + h), strokeWidth)
        drawLine(color, Offset(insetX + w, insetY + h), Offset(insetX + w, insetY + h - cornerLength), strokeWidth)

        // Horizon Alignment Crosshair
        val crossColor = Color.White.copy(alpha = 0.22f)
        val cx = size.width / 2f
        val cy = size.height / 2f
        drawLine(crossColor, Offset(cx - 16f, cy), Offset(cx + 16f, cy), 1.5.dp.toPx())
        drawLine(crossColor, Offset(cx, cy - 16f), Offset(cx, cy + 16f), 1.5.dp.toPx())
    }
}
