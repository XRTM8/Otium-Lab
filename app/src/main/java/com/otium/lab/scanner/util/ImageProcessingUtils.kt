package com.otium.lab.scanner.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import android.util.Log
import androidx.camera.core.ImageProxy
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.model.ScanFilter
import uniffi.otium_bridge.CornerPoints
import uniffi.otium_bridge.bridgeWarpDocument
import java.io.ByteArrayOutputStream
import java.io.InputStream

object ImageProcessingUtils {

    private const val TAG = "ImageProcessingUtils"
    private const val DEFAULT_MAX_DIM = 4096
    private const val JPEG_QUALITY = 95

    fun processImageProxy(imageProxy: ImageProxy, targetMaxDim: Int = DEFAULT_MAX_DIM): ByteArray? {
        return try {
            val rotationDegrees = imageProxy.imageInfo.rotationDegrees
            val format = imageProxy.format

            val rawBytes = if (format == ImageFormat.JPEG && imageProxy.planes.isNotEmpty()) {
                val buffer = imageProxy.planes[0].buffer
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                bytes
            } else {
                val bmp = imageProxy.toBitmap()
                val stream = ByteArrayOutputStream()
                bmp.compress(Bitmap.CompressFormat.JPEG, 90, stream)
                bmp.recycle()
                stream.toByteArray()
            }

            val sampledBitmap = decodeSampledBitmap(rawBytes, targetMaxDim) ?: return null
            val finalBitmap = if (rotationDegrees != 0) {
                val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                val rotated = Bitmap.createBitmap(sampledBitmap, 0, 0, sampledBitmap.width, sampledBitmap.height, matrix, true)
                if (rotated != sampledBitmap) sampledBitmap.recycle()
                rotated
            } else {
                sampledBitmap
            }

            val out = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            finalBitmap.recycle()
            out.toByteArray()
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to process captured image", t)
            null
        } finally {
            try {
                imageProxy.close()
            } catch (_: Throwable) {}
        }
    }

    fun processUriImage(context: Context, uri: Uri, targetMaxDim: Int = DEFAULT_MAX_DIM): ByteArray? {
        return try {
            val input: InputStream? = context.contentResolver.openInputStream(uri)
            val bytes = input?.use { it.readBytes() } ?: return null
            val sampledBitmap = decodeSampledBitmap(bytes, targetMaxDim) ?: return null

            // Correct EXIF camera orientation (handles Samsung/Pixel/Xiaomi portrait photo rotations)
            val rotationDegrees = try {
                val exif = android.media.ExifInterface(java.io.ByteArrayInputStream(bytes))
                when (exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL)) {
                    android.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    android.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    android.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } catch (_: Throwable) { 0 }

            val finalBitmap = if (rotationDegrees != 0) {
                val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                val rotated = Bitmap.createBitmap(sampledBitmap, 0, 0, sampledBitmap.width, sampledBitmap.height, matrix, true)
                if (rotated != sampledBitmap) sampledBitmap.recycle()
                rotated
            } else {
                sampledBitmap
            }

            val out = ByteArrayOutputStream()
            finalBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            finalBitmap.recycle()
            out.toByteArray()
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to process URI image", t)
            null
        }
    }

    fun decodeSampledBitmap(data: ByteArray, targetMaxDim: Int = DEFAULT_MAX_DIM): Bitmap? {
        if (data.isEmpty()) return null
        return try {
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeByteArray(data, 0, data.size, boundsOptions)

            val width = boundsOptions.outWidth
            val height = boundsOptions.outHeight
            if (width <= 0 || height <= 0) return null

            var inSampleSize = 1
            val maxDim = maxOf(width, height)
            while (maxDim / inSampleSize > targetMaxDim) inSampleSize *= 2

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            BitmapFactory.decodeByteArray(data, 0, data.size, decodeOptions)
        } catch (t: Throwable) {
            Log.e(TAG, "Bitmap decoding OOM or error", t)
            null
        }
    }

    fun imageDimensions(data: ByteArray): Pair<Int, Int>? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, options)
        return if (options.outWidth > 0 && options.outHeight > 0) options.outWidth to options.outHeight else null
    }

    fun warpDocument(rawBytes: ByteArray, quad: NormalizedQuad, origW: Int, origH: Int): ByteArray {
        return try {
            val corners = CornerPoints(
                topLeftX = quad.topLeft.x * origW,
                topLeftY = quad.topLeft.y * origH,
                topRightX = quad.topRight.x * origW,
                topRightY = quad.topRight.y * origH,
                bottomRightX = quad.bottomRight.x * origW,
                bottomRightY = quad.bottomRight.y * origH,
                bottomLeftX = quad.bottomLeft.x * origW,
                bottomLeftY = quad.bottomLeft.y * origH
            )
            bridgeWarpDocument(rawBytes, corners, null, null)
        } catch (t: Throwable) {
            Log.e(TAG, "Rust bridgeWarpDocument failed, applying fallback crop", t)
            applyFallbackCrop(rawBytes, quad, origW, origH)
        }
    }

    private fun applyFallbackCrop(rawBytes: ByteArray, quad: NormalizedQuad, origW: Int, origH: Int): ByteArray {
        return try {
            val bmp = decodeSampledBitmap(rawBytes, DEFAULT_MAX_DIM) ?: return rawBytes
            val x = (minOf(quad.topLeft.x, quad.bottomLeft.x) * bmp.width).toInt().coerceIn(0, bmp.width - 10)
            val y = (minOf(quad.topLeft.y, quad.topRight.y) * bmp.height).toInt().coerceIn(0, bmp.height - 10)
            val w = ((maxOf(quad.topRight.x, quad.bottomRight.x) - minOf(quad.topLeft.x, quad.bottomLeft.x)) * bmp.width).toInt().coerceIn(10, bmp.width - x)
            val h = ((maxOf(quad.bottomLeft.y, quad.bottomRight.y) - minOf(quad.topLeft.y, quad.topRight.y)) * bmp.height).toInt().coerceIn(10, bmp.height - y)

            val cropped = Bitmap.createBitmap(bmp, x, y, w, h)
            val out = ByteArrayOutputStream()
            cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            cropped.recycle()
            bmp.recycle()
            out.toByteArray()
        } catch (_: Throwable) {
            rawBytes
        }
    }

    fun applyFallbackFilter(rawBytes: ByteArray, filter: ScanFilter): ByteArray {
        if (filter == ScanFilter.ORIGINAL) return rawBytes
        return try {
            val source = decodeSampledBitmap(rawBytes, DEFAULT_MAX_DIM) ?: return rawBytes
            val result = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(result)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)

            val colorMatrix = when (filter) {
                ScanFilter.CLEAN_WHITE -> ColorMatrix().apply {
                    setSaturation(0f)
                    val scale = 1.35f
                    val translate = -35f
                    postConcat(ColorMatrix(floatArrayOf(
                        scale, 0f, 0f, 0f, translate,
                        0f, scale, 0f, 0f, translate,
                        0f, 0f, scale, 0f, translate,
                        0f, 0f, 0f, 1f, 0f
                    )))
                }
                ScanFilter.BLACK_WHITE -> ColorMatrix().apply {
                    setSaturation(0f)
                    val scale = 2.4f
                    val translate = -140f
                    postConcat(ColorMatrix(floatArrayOf(
                        scale, 0f, 0f, 0f, translate,
                        0f, scale, 0f, 0f, translate,
                        0f, 0f, scale, 0f, translate,
                        0f, 0f, 0f, 1f, 0f
                    )))
                }
                ScanFilter.MAGIC_COLOR -> ColorMatrix().apply {
                    setSaturation(1.3f)
                    val scale = 1.15f
                    val translate = -15f
                    postConcat(ColorMatrix(floatArrayOf(
                        scale, 0f, 0f, 0f, translate,
                        0f, scale, 0f, 0f, translate,
                        0f, 0f, scale, 0f, translate,
                        0f, 0f, 0f, 1f, 0f
                    )))
                }
                ScanFilter.ORIGINAL -> ColorMatrix()
            }

            paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
            canvas.drawBitmap(source, 0f, 0f, paint)
            source.recycle()

            val out = ByteArrayOutputStream()
            result.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            result.recycle()
            out.toByteArray()
        } catch (_: Throwable) {
            rawBytes
        }
    }

    fun rotateJpegBytes90Cw(rawBytes: ByteArray): ByteArray? {
        return try {
            val source = decodeSampledBitmap(rawBytes, DEFAULT_MAX_DIM) ?: return null
            val matrix = Matrix().apply { postRotate(90f) }
            val rotated = Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
            if (rotated != source) source.recycle()
            val out = ByteArrayOutputStream()
            rotated.compress(Bitmap.CompressFormat.JPEG, 90, out)
            rotated.recycle()
            out.toByteArray()
        } catch (t: Throwable) {
            Log.e(TAG, "Failed to rotate image bytes", t)
            null
        }
    }
}
