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

            // 1. Downscale to a clean 200x200 analysis grid for instant 2ms execution
            val gridDim = 200
            val thumb = Bitmap.createScaledBitmap(bmp, gridDim, gridDim, true)
            val pixels = IntArray(gridDim * gridDim)
            thumb.getPixels(pixels, 0, gridDim, 0, 0, gridDim, gridDim)
            thumb.recycle()

            // 2. Grayscale luminance calculation
            val luma = IntArray(gridDim * gridDim)
            for (i in pixels.indices) {
                val p = pixels[i]
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                luma[i] = (r * 77 + g * 150 + b * 29) shr 8
            }

            // 3. Fast Sobel gradient magnitude calculation
            val grad = IntArray(gridDim * gridDim)
            for (y in 1 until gridDim - 1) {
                val rowOffset = y * gridDim
                for (x in 1 until gridDim - 1) {
                    val gx = (luma[rowOffset - gridDim + x + 1] + 2 * luma[rowOffset + x + 1] + luma[rowOffset + gridDim + x + 1]) -
                             (luma[rowOffset - gridDim + x - 1] + 2 * luma[rowOffset + x - 1] + luma[rowOffset + gridDim + x - 1])
                    val gy = (luma[rowOffset + gridDim + x - 1] + 2 * luma[rowOffset + gridDim + x] + luma[rowOffset + gridDim + x + 1]) -
                             (luma[rowOffset - gridDim + x - 1] + 2 * luma[rowOffset - gridDim + x] + luma[rowOffset - gridDim + x + 1])
                    grad[rowOffset + x] = kotlin.math.abs(gx) + kotlin.math.abs(gy)
                }
            }

            // 4. Center of image space
            val cx = gridDim / 2f
            val cy = gridDim / 2f

            // 5. Ray search outward from center towards corner quadrants
            fun findCorner(targetX: Float, targetY: Float): Offset {
                val dx = targetX - cx
                val dy = targetY - cy
                val steps = 80
                var bestGrad = 0
                var bestPt = Offset(targetX / gridDim, targetY / gridDim)

                for (s in 15..steps) {
                    val t = s.toFloat() / steps.toFloat()
                    val px = (cx + dx * t).toInt().coerceIn(1, gridDim - 2)
                    val py = (cy + dy * t).toInt().coerceIn(1, gridDim - 2)
                    val gVal = grad[py * gridDim + px]
                    if (gVal > bestGrad && gVal > 55) {
                        bestGrad = gVal
                        bestPt = Offset(px.toFloat() / gridDim, py.toFloat() / gridDim)
                    }
                }
                return bestPt
            }

            val tl = findCorner(gridDim * 0.04f, gridDim * 0.04f)
            val tr = findCorner(gridDim * 0.96f, gridDim * 0.04f)
            val br = findCorner(gridDim * 0.96f, gridDim * 0.96f)
            val bl = findCorner(gridDim * 0.04f, gridDim * 0.96f)

            // Validate that quadrilateral is topologically sound (TL left of TR, BL left of BR, TL above BL, TR above BR)
            val isValid = (tl.x < tr.x) && (bl.x < br.x) && (tl.y < bl.y) && (tr.y < br.y)
            if (isValid) {
                NormalizedQuad(
                    topLeft = Offset(tl.x.coerceIn(0.01f, 0.45f), tl.y.coerceIn(0.01f, 0.45f)),
                    topRight = Offset(tr.x.coerceIn(0.55f, 0.99f), tr.y.coerceIn(0.01f, 0.45f)),
                    bottomRight = Offset(br.x.coerceIn(0.55f, 0.99f), br.y.coerceIn(0.55f, 0.99f)),
                    bottomLeft = Offset(bl.x.coerceIn(0.01f, 0.45f), bl.y.coerceIn(0.55f, 0.99f))
                )
            } else {
                NormalizedQuad(
                    topLeft = Offset(0.05f, 0.05f),
                    topRight = Offset(0.95f, 0.05f),
                    bottomRight = Offset(0.95f, 0.95f),
                    bottomLeft = Offset(0.05f, 0.95f)
                )
            }
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
