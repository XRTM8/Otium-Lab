package com.otium.lab.scanner.util

import android.graphics.Bitmap
import android.graphics.Matrix
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy

class ScannerLiveAnalyzer(
    private val onDetection: (DocumentEdgeDetector.Detection?, Pair<Int, Int>) -> Unit
) : ImageAnalysis.Analyzer {
    private var lastAnalysis = 0L

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
                onDetection(DocumentEdgeDetector.detect(upright), upright.width to upright.height)
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
