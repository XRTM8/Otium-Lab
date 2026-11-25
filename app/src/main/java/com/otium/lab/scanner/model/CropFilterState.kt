package com.otium.lab.scanner.model

import android.graphics.Bitmap
import androidx.compose.runtime.*
import androidx.compose.ui.geometry.Offset
import com.otium.lab.scanner.util.ImageProcessingUtils
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
    var selectedFilter by mutableStateOf(ScanFilter.MAGIC_COLOR)
    var displayedBitmap by mutableStateOf<Bitmap?>(null)
    var isProcessing by mutableStateOf(false)
    var showSaveDialog by mutableStateOf(false)
    val filterCache = mutableMapOf<ScanFilter, Bitmap>()

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
        val rawBmp = previewRawBitmap ?: return
        isProcessing = true
        scope.launch(Dispatchers.Default) {
            val warped = ImageProcessingUtils.warpDocument(activeBytes, cropQuad, rawBmp.width, rawBmp.height)
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
        filterCache[selectedFilter]?.let {
            displayedBitmap = it
            return
        }
        isProcessing = true
        withContext(Dispatchers.Default) {
            try {
                val processed = if (selectedFilter == ScanFilter.ORIGINAL) croppedBaseBytes else {
                    try { bridgeApplyScanFilter(croppedBaseBytes, selectedFilter.mode) }
                    catch (_: Throwable) { ImageProcessingUtils.applyFallbackFilter(croppedBaseBytes, selectedFilter) }
                }
                ImageProcessingUtils.decodeSampledBitmap(processed)?.let { bmp ->
                    filterCache[selectedFilter] = bmp
                    displayedBitmap = bmp
                }
            } catch (_: Throwable) {
                ImageProcessingUtils.decodeSampledBitmap(croppedBaseBytes)?.let { fallback ->
                    filterCache[selectedFilter] = fallback
                    displayedBitmap = fallback
                }
            }
        }
        isProcessing = false
    }
}
