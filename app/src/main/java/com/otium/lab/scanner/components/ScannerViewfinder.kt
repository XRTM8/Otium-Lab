package com.otium.lab.scanner.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun ScannerViewfinder(
    primaryColor: Color,
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

    Canvas(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 90.dp)
    ) {
        val strokeWidth = 3.5.dp.toPx()
        val cornerLength = 32.dp.toPx()
        val color = primaryColor.copy(alpha = pulseAlpha)

        val w = size.width
        val h = size.height

        // Top-Left
        drawLine(color, Offset(0f, 0f), Offset(cornerLength, 0f), strokeWidth)
        drawLine(color, Offset(0f, 0f), Offset(0f, cornerLength), strokeWidth)

        // Top-Right
        drawLine(color, Offset(w, 0f), Offset(w - cornerLength, 0f), strokeWidth)
        drawLine(color, Offset(w, 0f), Offset(w, cornerLength), strokeWidth)

        // Bottom-Left
        drawLine(color, Offset(0f, h), Offset(cornerLength, h), strokeWidth)
        drawLine(color, Offset(0f, h), Offset(0f, h - cornerLength), strokeWidth)

        // Bottom-Right
        drawLine(color, Offset(w, h), Offset(w - cornerLength, h), strokeWidth)
        drawLine(color, Offset(w, h), Offset(w, h - cornerLength), strokeWidth)

        // Horizon Alignment Crosshair
        val crossColor = Color.White.copy(alpha = 0.22f)
        val cx = w / 2f
        val cy = h / 2f
        drawLine(crossColor, Offset(cx - 16f, cy), Offset(cx + 16f, cy), 1.5.dp.toPx())
        drawLine(crossColor, Offset(cx, cy - 16f), Offset(cx, cy + 16f), 1.5.dp.toPx())
    }
}
