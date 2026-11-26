package com.otium.lab.scanner.model

import android.graphics.Bitmap
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import com.otium.lab.scanner.util.ImageProcessingUtils
import com.otium.lab.scanner.util.DocumentEdgeDetector
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeApplyScanFilter

@Stable
class CropFilterState(
    rawImageBytes: ByteArray
) {
    var isCropping by mutableStateOf(true)
    var activeBytes by mutableStateOf(rawImageBytes)
    var croppedBaseBytes by mutableStateOf(rawImageBytes)
    var previewRawBitmap by mutableStateOf<Bitmap?>(null)
    var cropQuad by mutableStateOf(NormalizedQuad())
    var hasDetectedBounds by mutableStateOf(false)
    var selectedFilter by mutableStateOf(ScanFilter.MAGIC_COLOR)
    var displayedBitmap by mutableStateOf<Bitmap?>(null)
    var isProcessing by mutableStateOf(false)
    var showSaveDialog by mutableStateOf(false)
    val filterCache = mutableMapOf<ScanFilter, ByteArray>()

    fun redetect(scope: CoroutineScope) {
        val preview = previewRawBitmap ?: return
        scope.launch {
            val detection = withContext(Dispatchers.Default) { DocumentEdgeDetector.detect(preview) }
            hasDetectedBounds = detection != null
            if (detection != null) cropQuad = detection.quad
        }
    }

    fun rotate90Cw(scope: CoroutineScope) {
        if (isProcessing) return
        isProcessing = true
        scope.launch(Dispatchers.Default) {
            val sourceBytes = if (isCropping) activeBytes else croppedBaseBytes
            val rotatedBytes = ImageProcessingUtils.rotateJpegBytes90Cw(sourceBytes)
            if (rotatedBytes != null) {
                if (isCropping) {
                    val rotatedBmp = ImageProcessingUtils.decodeSampledBitmap(rotatedBytes)
                    val q = cropQuad
                    fun rotPt(p: Offset) = Offset(1f - p.y, p.x)
                    val rotatedQuad = NormalizedQuad(
                        topLeft = rotPt(q.bottomLeft),
                        topRight = rotPt(q.topLeft),
                        bottomRight = rotPt(q.topRight),
                        bottomLeft = rotPt(q.bottomRight)
                    )
                    withContext(Dispatchers.Main) {
                        activeBytes = rotatedBytes
                        previewRawBitmap = rotatedBmp
                        cropQuad = rotatedQuad
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        filterCache.clear()
                        croppedBaseBytes = rotatedBytes
                    }
                }
            }
            withContext(Dispatchers.Main) { isProcessing = false }
        }
    }

    fun confirmCrop(scope: CoroutineScope) {
        if (isProcessing || !cropQuad.isValid()) return
        val dimensions = ImageProcessingUtils.imageDimensions(activeBytes) ?: return
        isProcessing = true
        scope.launch(Dispatchers.Default) {
            val warped = ImageProcessingUtils.warpDocument(activeBytes, cropQuad, dimensions.first, dimensions.second)
            withContext(Dispatchers.Main) {
                filterCache.clear()
                croppedBaseBytes = warped
                isCropping = false
                isProcessing = false
            }
        }
    }

    suspend fun applySelectedFilter() {
        if (isCropping) return
        val filter = selectedFilter
        val baseBytes = croppedBaseBytes
        val cachedBytes = filterCache[filter]
        isProcessing = true
        val result = withContext(Dispatchers.Default) {
            try {
                val processed = cachedBytes ?: if (filter == ScanFilter.ORIGINAL) baseBytes else {
                    try { bridgeApplyScanFilter(baseBytes, filter.mode) }
                    catch (_: Throwable) { ImageProcessingUtils.applyFallbackFilter(baseBytes, filter) }
                }
                processed to ImageProcessingUtils.decodeSampledBitmap(processed)
            } catch (_: Throwable) {
                baseBytes to ImageProcessingUtils.decodeSampledBitmap(baseBytes)
            }
        }
        val (processedBytes, bitmap) = result
        if (bitmap != null && filter == selectedFilter && baseBytes === croppedBaseBytes) {
            filterCache[filter] = processedBytes
            displayedBitmap = bitmap
        } else bitmap?.recycle()
        isProcessing = false
    }
}
