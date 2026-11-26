package com.otium.lab.pdf.util

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.positionChanged
import kotlin.math.abs

suspend fun PointerInputScope.detectPdfViewerGestures(
    isZoomed: Boolean,
    onTransform: (zoom: Float, pan: Offset) -> Unit,
    onTap: (Offset) -> Unit,
    onDoubleTap: () -> Unit
) {
    var lastTapTime = 0L
    var lastTapOffset = Offset.Zero
    val doubleTapTimeout = 320L
    val touchSlop = viewConfiguration.touchSlop

    awaitEachGesture {
        val down = awaitFirstDown(requireUnconsumed = false)
        val downTime = System.currentTimeMillis()
        val downOffset = down.position
        var isTransformActive = false
        var totalPan = Offset.Zero

        do {
            val event = awaitPointerEvent()
            val pressedPointers = event.changes.filter { it.pressed }
            val count = pressedPointers.size

            if (count >= 2) {
                val zoomChange = event.calculateZoom()
                val panChange = event.calculatePan()
                if (zoomChange != 1f || panChange != Offset.Zero) {
                    isTransformActive = true
                    onTransform(zoomChange, panChange)
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            } else if (count == 1 && isZoomed) {
                val panChange = event.calculatePan()
                totalPan += panChange
                if (isTransformActive || abs(totalPan.x) > touchSlop || abs(totalPan.y) > touchSlop) {
                    isTransformActive = true
                    onTransform(1f, panChange)
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            }
        } while (event.changes.any { it.pressed })

        val duration = System.currentTimeMillis() - downTime
        if (!isTransformActive && duration < 350L && totalPan.getDistance() < touchSlop) {
            val now = System.currentTimeMillis()
            val distanceFromLastTap = (downOffset - lastTapOffset).getDistance()

            if (now - lastTapTime < doubleTapTimeout && distanceFromLastTap < touchSlop * 3) {
                lastTapTime = 0L
                lastTapOffset = Offset.Zero
                onDoubleTap()
            } else {
                lastTapTime = now
                lastTapOffset = downOffset
                onTap(downOffset)
            }
        }
    }
}
