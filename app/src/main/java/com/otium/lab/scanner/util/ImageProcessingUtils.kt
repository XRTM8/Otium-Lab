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
import androidx.compose.ui.geometry.Offset
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.model.ScanFilter
import uniffi.otium_bridge.CornerPoints
import uniffi.otium_bridge.bridgeWarpDocument
import java.io.ByteArrayOutputStream
import java.io.InputStream

object ImageProcessingUtils {

    private const val TAG = "ImageProcessingUtils"
    private const val DEFAULT_MAX_DIM = 1920
    private const val JPEG_QUALITY = 85

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

            val out = ByteArrayOutputStream()
            sampledBitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
            sampledBitmap.recycle()
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
            if (maxDim > targetMaxDim) {
                val halfDim = maxDim / 2
                while (halfDim / inSampleSize >= targetMaxDim) {
                    inSampleSize *= 2
                }
            }

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

    fun detectDocumentCorners(bmp: Bitmap): NormalizedQuad {
        return try {
            val w = bmp.width
            val h = bmp.height
            if (w < 50 || h < 50) return NormalizedQuad()

            val thumb = Bitmap.createScaledBitmap(bmp, 80, 80, false)
            var topInset = 0.05f
            var bottomInset = 0.95f
            var leftInset = 0.05f
            var rightInset = 0.95f

            // Scan from top towards center
            for (y in 0 until 28) {
                var avgLuma = 0
                for (x in 20 until 60) {
                    val pixel = thumb.getPixel(x, y)
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    avgLuma += (r * 299 + g * 587 + b * 114) / 1000
                }
                avgLuma /= 40
                if (avgLuma > 115) {
                    topInset = (y / 80f).coerceIn(0.02f, 0.22f)
                    break
                }
            }

            // Scan from bottom towards center
            for (y in 79 downTo 52) {
                var avgLuma = 0
                for (x in 20 until 60) {
                    val pixel = thumb.getPixel(x, y)
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    avgLuma += (r * 299 + g * 587 + b * 114) / 1000
                }
                avgLuma /= 40
                if (avgLuma > 115) {
                    bottomInset = (y / 80f).coerceIn(0.78f, 0.98f)
                    break
                }
            }

            // Scan from left towards center
            for (x in 0 until 28) {
                var avgLuma = 0
                for (y in 20 until 60) {
                    val pixel = thumb.getPixel(x, y)
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    avgLuma += (r * 299 + g * 587 + b * 114) / 1000
                }
                avgLuma /= 40
                if (avgLuma > 115) {
                    leftInset = (x / 80f).coerceIn(0.02f, 0.22f)
                    break
                }
            }

            // Scan from right towards center
            for (x in 79 downTo 52) {
                var avgLuma = 0
                for (y in 20 until 60) {
                    val pixel = thumb.getPixel(x, y)
                    val r = (pixel shr 16) and 0xFF
                    val g = (pixel shr 8) and 0xFF
                    val b = pixel and 0xFF
                    avgLuma += (r * 299 + g * 587 + b * 114) / 1000
                }
                avgLuma /= 40
                if (avgLuma > 115) {
                    rightInset = (x / 80f).coerceIn(0.78f, 0.98f)
                    break
                }
            }
            thumb.recycle()

            NormalizedQuad(
                topLeft = Offset(leftInset, topInset),
                topRight = Offset(rightInset, topInset),
                bottomRight = Offset(rightInset, bottomInset),
                bottomLeft = Offset(leftInset, bottomInset)
            )
        } catch (_: Throwable) {
            NormalizedQuad()
        }
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
}
