package com.otium.lab.scanner.util

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import com.otium.lab.scanner.model.NormalizedQuad
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

/** Detects four long page edges. A weak or inconsistent result is rejected instead of guessed. */
object DocumentEdgeDetector {
    data class Detection(val quad: NormalizedQuad, val confidence: Float)
    private data class Line(val angle: Int, val rho: Int, val votes: Int)
    private const val MAX_SIDE = 320

    fun detect(source: Bitmap): Detection? {
        DocumentRegionDetector.detect(source)?.let { return it }
        if (source.width < 80 || source.height < 80) return null
        val scale = MAX_SIDE.toFloat() / max(source.width, source.height)
        val width = (source.width * scale).toInt().coerceAtLeast(2)
        val height = (source.height * scale).toInt().coerceAtLeast(2)
        val thumb = Bitmap.createScaledBitmap(source, width, height, true)
        val pixels = IntArray(width * height)
        thumb.getPixels(pixels, 0, width, 0, 0, width, height)
        if (thumb !== source) thumb.recycle()
        val gray = IntArray(pixels.size) { i ->
            val p = pixels[i]
            (((p shr 16) and 255) * 77 + ((p shr 8) and 255) * 150 + (p and 255) * 29) shr 8
        }
        val diagonal = hypot(width.toDouble(), height.toDouble()).toInt() + 1
        val stride = diagonal * 2 + 1
        val accumulator = IntArray(180 * stride)
        val cosines = DoubleArray(180) { cos(it * PI / 180.0) }
        val sines = DoubleArray(180) { sin(it * PI / 180.0) }
        var edgeCount = 0
        for (y in 2 until height - 2 step 2) for (x in 2 until width - 2 step 2) {
            val i = y * width + x
            val gx = gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1] -
                gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1]
            val gy = gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1] -
                gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1]
            if (abs(gx) + abs(gy) < 150) continue
            edgeCount++
            val angle = ((atan2(gy.toDouble(), gx.toDouble()) * 180 / PI).toInt() + 180) % 180
            for (delta in -2..2) {
                val a = (angle + delta + 180) % 180
                val rho = (x * cosines[a] + y * sines[a]).toInt() + diagonal
                accumulator[a * stride + rho]++
            }
        }
        if (edgeCount < 60) return null

        val threshold = max(12, minOf(width, height) / 13)
        val candidates = ArrayList<Line>()
        for (angle in 0 until 180) for (rho in 1 until stride - 1) {
            val votes = accumulator[angle * stride + rho]
            if (votes < threshold || votes < accumulator[angle * stride + rho - 1] ||
                votes < accumulator[angle * stride + rho + 1]) continue
            val vertical = angle <= 35 || angle >= 145
            val horizontal = angle in 55..125
            if (vertical || horizontal) candidates.add(Line(angle, rho - diagonal, votes))
        }
        val vertical = candidates.filter { it.angle <= 35 || it.angle >= 145 }
        val horizontal = candidates.filter { it.angle in 55..125 }
        fun xAt(line: Line, y: Double) = (line.rho - y * sines[line.angle]) / cosines[line.angle]
        fun yAt(line: Line, x: Double) = (line.rho - x * cosines[line.angle]) / sines[line.angle]
        val midX = width / 2.0
        val midY = height / 2.0
        fun side(lines: List<Line>, predicate: (Double) -> Boolean, position: (Line) -> Double): Line? =
            lines.filter { predicate(position(it)) }.maxByOrNull { it.votes }
        val left = side(vertical, { it in width * .04..width * .43 }, { xAt(it, midY) }) ?: return null
        val right = side(vertical, { it in width * .57..width * .96 }, { xAt(it, midY) }) ?: return null
        val top = side(horizontal, { it in height * .04..height * .43 }, { yAt(it, midX) }) ?: return null
        val bottom = side(horizontal, { it in height * .57..height * .96 }, { yAt(it, midX) }) ?: return null

        fun intersection(a: Line, b: Line): Offset? {
            val ax = cosines[a.angle]; val ay = sines[a.angle]
            val bx = cosines[b.angle]; val by = sines[b.angle]
            val determinant = ax * by - ay * bx
            if (abs(determinant) < .2) return null
            val x = (a.rho * by - ay * b.rho) / determinant / width
            val y = (ax * b.rho - a.rho * bx) / determinant / height
            if (x !in 0.0..1.0 || y !in 0.0..1.0) return null
            return Offset(x.toFloat(), y.toFloat())
        }
        val tl = intersection(left, top) ?: return null
        val tr = intersection(right, top) ?: return null
        val br = intersection(right, bottom) ?: return null
        val bl = intersection(left, bottom) ?: return null
        val quad = NormalizedQuad(tl, tr, br, bl)
        if (!quad.isValid()) return null
        val confidence = minOf(left.votes, right.votes, top.votes, bottom.votes)
            .toFloat() / minOf(width, height).coerceAtLeast(1)
        return Detection(quad, confidence.coerceIn(0f, 1f))
    }
}
