package com.otium.lab.scanner.util

import android.graphics.Bitmap
import androidx.compose.ui.geometry.Offset
import com.otium.lab.scanner.model.NormalizedQuad
import kotlin.math.abs
import kotlin.math.max

/** Finds a light page as one connected region, including pages with bent or broken edges. */
object DocumentRegionDetector {
    fun detect(source: Bitmap): DocumentEdgeDetector.Detection? {
        if (source.width < 80 || source.height < 80) return null
        val scale = minOf(1f, 320f / max(source.width, source.height))
        val width = (source.width * scale).toInt().coerceAtLeast(2)
        val height = (source.height * scale).toInt().coerceAtLeast(2)
        val thumb = Bitmap.createScaledBitmap(source, width, height, true)
        val pixels = IntArray(width * height)
        thumb.getPixels(pixels, 0, width, 0, 0, width, height)
        if (thumb !== source) thumb.recycle()
        val gray = IntArray(pixels.size)
        val histogram = IntArray(256)
        pixels.forEachIndexed { i, pixel ->
            val luminance = (((pixel shr 16) and 255) * 77 +
                ((pixel shr 8) and 255) * 150 + (pixel and 255) * 29) shr 8
            gray[i] = luminance
            histogram[luminance]++
        }
        val threshold = otsuThreshold(histogram, pixels.size) ?: return null
        val mask = BooleanArray(gray.size) { gray[it] > threshold }
        val visited = BooleanArray(mask.size)
        val queue = IntArray(mask.size)
        var best: Component? = null
        for (start in mask.indices) {
            if (!mask[start] || visited[start]) continue
            var head = 0
            var tail = 0
            queue[tail++] = start
            visited[start] = true
            val component = Component(width, height)
            while (head < tail) {
                val index = queue[head++]
                val x = index % width
                val y = index / width
                component.add(x, y)
                if (x > 0) visit(index - 1, mask, visited, queue, tail)?.let { tail = it }
                if (x + 1 < width) visit(index + 1, mask, visited, queue, tail)?.let { tail = it }
                if (y > 0) visit(index - width, mask, visited, queue, tail)?.let { tail = it }
                if (y + 1 < height) visit(index + width, mask, visited, queue, tail)?.let { tail = it }
            }
            if (component.isCandidate() && (best == null || component.score() > best.score())) {
                best = component
            }
        }
        return best?.detection()
    }

    private fun visit(index: Int, mask: BooleanArray, visited: BooleanArray, queue: IntArray, tail: Int): Int? {
        if (!mask[index] || visited[index]) return null
        visited[index] = true
        queue[tail] = index
        return tail + 1
    }

    private fun otsuThreshold(histogram: IntArray, count: Int): Int? {
        val total = histogram.indices.sumOf { it.toLong() * histogram[it] }
        var lowCount = 0
        var lowTotal = 0L
        var bestVariance = 0.0
        var bestThreshold = 0
        for (level in histogram.indices) {
            lowCount += histogram[level]
            lowTotal += level.toLong() * histogram[level]
            val highCount = count - lowCount
            if (lowCount == 0 || highCount == 0) continue
            val difference = lowTotal.toDouble() / lowCount - (total - lowTotal).toDouble() / highCount
            val variance = lowCount.toDouble() * highCount * difference * difference
            if (variance > bestVariance) {
                bestVariance = variance
                bestThreshold = level
            }
        }
        return if (bestVariance > count.toDouble() * count * 100) bestThreshold else null
    }

    private class Component(private val width: Int, private val height: Int) {
        private val total = width * height
        private var count = 0
        private var minX = width
        private var maxX = 0
        private var minY = height
        private var maxY = 0
        private var borders = 0
        private val extremes = arrayOfNulls<Offset>(4)
        private val scores = floatArrayOf(Float.MAX_VALUE, Float.NEGATIVE_INFINITY,
            Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY)

        fun add(x: Int, y: Int) {
            count++
            minX = minOf(minX, x); maxX = maxOf(maxX, x)
            minY = minOf(minY, y); maxY = maxOf(maxY, y)
            if (x == 0) borders = borders or 1
            if (x == width - 1) borders = borders or 2
            if (y == 0) borders = borders or 4
            if (y == height - 1) borders = borders or 8
            val nx = x.toFloat() / width
            val ny = y.toFloat() / height
            val values = floatArrayOf(nx + ny, nx - ny, nx + ny, ny - nx)
            for (i in 0..3) {
                if ((i == 0 && values[i] < scores[i]) || (i != 0 && values[i] > scores[i])) {
                    scores[i] = values[i]
                    extremes[i] = Offset(nx, ny)
                }
            }
        }

        fun isCandidate(): Boolean {
            if (count < total * .10 || count > total * .88) return false
            if (maxX - minX < width * .25 || maxY - minY < height * .25) return false
            if (Integer.bitCount(borders) >= 3) return false
            val quad = quad() ?: return false
            if (!quad.isValid()) return false
            val boxArea = (maxX - minX) * (maxY - minY)
            return boxArea > 0 && count.toFloat() / boxArea > .45f
        }

        fun score(): Float {
            val centerX = (minX + maxX) / 2f / width
            val centerY = (minY + maxY) / 2f / height
            return count * (1f - .5f * (abs(centerX - .5f) + abs(centerY - .5f)))
        }

        fun detection(): DocumentEdgeDetector.Detection? {
            val quad = quad() ?: return null
            return DocumentEdgeDetector.Detection(quad, (count.toFloat() / total).coerceIn(0f, 1f))
        }

        private fun quad(): NormalizedQuad? {
            val tl = extremes[0] ?: return null
            val tr = extremes[1] ?: return null
            val br = extremes[2] ?: return null
            val bl = extremes[3] ?: return null
            return NormalizedQuad(tl, tr, br, bl)
        }
    }
}
