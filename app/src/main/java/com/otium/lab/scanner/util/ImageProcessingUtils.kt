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
import com.otium.lab.scanner.model.ScanFilter
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

            // Downsample and rotate safely
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
                    // High-contrast clean white document
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
                    // Binary sharp black/white
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
