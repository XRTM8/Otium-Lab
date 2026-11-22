package com.otium.lab.pdf.util

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.positionChanged
import kotlin.math.abs

/**
 * High-performance gesture detector tailored for PDF document viewing:
 * - When scale <= 1.05f: Single-finger vertical/horizontal drag events are NOT consumed,
 *   allowing LazyColumn (vertical scroll) and HorizontalPager (paging) to handle scrolling smoothly.
 * - Multi-touch (>= 2 fingers): Pinch-to-zoom (1.0x to 4.5x) and 2-finger pan are consumed and handled.
 * - When scale > 1.05f: Single-finger drags pan the zoomed viewport.
 * - Taps: Detects single tap (toggle UI controls) and double tap (zoom toggle) cleanly without gesture fights.
 */
suspend fun PointerInputScope.detectPdfViewerGestures(
    isZoomed: Boolean,
    onTransform: (zoom: Float, pan: Offset) -> Unit,
    onTap: () -> Unit,
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
                // Multi-finger pinch & pan
                val zoomChange = event.calculateZoom()
                val panChange = event.calculatePan()
                if (zoomChange != 1f || panChange != Offset.Zero) {
                    isTransformActive = true
                    onTransform(zoomChange, panChange)
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            } else if (count == 1 && isZoomed) {
                // Single-finger pan when zoomed in
                val panChange = event.calculatePan()
                totalPan += panChange
                if (isTransformActive || abs(totalPan.x) > touchSlop || abs(totalPan.y) > touchSlop) {
                    isTransformActive = true
                    onTransform(1f, panChange)
                    event.changes.forEach { if (it.positionChanged()) it.consume() }
                }
            }
            // If count == 1 and !isZoomed: Do not consume! Let LazyColumn/HorizontalPager scroll!
        } while (event.changes.any { it.pressed })

        // Pointer release check for Taps
        val duration = System.currentTimeMillis() - downTime
        if (!isTransformActive && duration < 350L && totalPan.getDistance() < touchSlop) {
            val now = System.currentTimeMillis()
            val distanceFromLastTap = (downOffset - lastTapOffset).getDistance()

            if (now - lastTapTime < doubleTapTimeout && distanceFromLastTap < touchSlop * 3) {
                // Double tap recognized!
                lastTapTime = 0L
                lastTapOffset = Offset.Zero
                onDoubleTap()
            } else {
                // Potential first tap
                lastTapTime = now
                lastTapOffset = downOffset
                onTap()
            }
        }
    }
}
