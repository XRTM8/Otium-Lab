package com.otium.lab.scanner.util

import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy

class ScannerLiveAnalyzer(
    private val onDetection: (DocumentEdgeDetector.Detection?, Pair<Int, Int>, Boolean) -> Unit
) : ImageAnalysis.Analyzer {
    private var lastAnalysis = 0L

    private fun isFrameSharp(bitmap: Bitmap): Boolean {
        val w = 160
        val h = (bitmap.height * 160f / bitmap.width.coerceAtLeast(1)).toInt().coerceAtLeast(40)
        val thumb = Bitmap.createScaledBitmap(bitmap, w, h, false)
        val pixels = IntArray(w * h)
        thumb.getPixels(pixels, 0, w, 0, 0, w, h)
        if (thumb !== bitmap) thumb.recycle()

        var sum = 0.0
        var sumSq = 0.0
        var count = 0
        for (y in 1 until h - 1 step 2) {
            val row = y * w
            for (x in 1 until w - 1 step 2) {
                val i = row + x
                fun luma(p: Int) = (((p shr 16) and 255) * 77 + ((p shr 8) and 255) * 150 + (p and 255) * 29) shr 8
                val lap = (luma(pixels[i - 1]) + luma(pixels[i + 1]) + luma(pixels[i - w]) + luma(pixels[i + w]) - 4 * luma(pixels[i])).toDouble()
                sum += lap
                sumSq += lap * lap
                count++
            }
        }
        if (count == 0) return true
        val mean = sum / count
        val variance = (sumSq / count) - (mean * mean)
        return variance >= 55.0
    }

    override fun analyze(proxy: ImageProxy) {
        try {
            val now = System.currentTimeMillis()
            if (now - lastAnalysis < 180L) return
            lastAnalysis = now
            val bitmap = proxy.toBitmap()
            var cropped: Bitmap = bitmap
            var upright: Bitmap = bitmap
            try {
                val crop = proxy.cropRect
                if (crop.width() > 0 && crop.height() > 0 &&
                    crop.left >= 0 && crop.top >= 0 && crop.right <= bitmap.width && crop.bottom <= bitmap.height &&
                    (crop.width() != bitmap.width || crop.height() != bitmap.height)) {
                    cropped = Bitmap.createBitmap(bitmap, crop.left, crop.top, crop.width(), crop.height())
                }
                upright = cropped
                val rotation = proxy.imageInfo.rotationDegrees
                if (rotation != 0) {
                    val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
                    upright = Bitmap.createBitmap(cropped, 0, 0, cropped.width, cropped.height, matrix, true)
                }
                val sharp = isFrameSharp(upright)
                onDetection(DocumentEdgeDetector.detect(upright), upright.width to upright.height, sharp)
            } finally {
                if (upright !== cropped) upright.recycle()
                if (cropped !== bitmap) cropped.recycle()
                bitmap.recycle()
            }
        } catch (t: Throwable) {
            Log.w("CameraScanner", "Live page detection failed", t)
        } finally {
            proxy.close()
        }
    }
}
