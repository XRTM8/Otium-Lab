package com.otium.lab.scanner

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.scanner.components.CropBottomActionBar
import com.otium.lab.scanner.components.CropFilterBottomBar
import com.otium.lab.scanner.components.CropFilterTopBar
import com.otium.lab.scanner.components.DocumentCropOverlay
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.model.ScanFilter
import com.otium.lab.scanner.util.ImageProcessingUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeApplyScanFilter

@Composable
fun CropAndFilterScreen(
    rawImageBytes: ByteArray,
    pageNumber: Int = 1,
    onAddMore: (Bitmap) -> Unit,
    onSavePdf: (Bitmap) -> Unit,
    onCancel: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var isCropping by remember { mutableStateOf(true) }
    var activeBytes by remember { mutableStateOf(rawImageBytes) }
    var previewRawBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var cropQuad by remember { mutableStateOf(NormalizedQuad()) }

    var selectedFilter by remember { mutableStateOf(ScanFilter.MAGIC_COLOR) }
    var displayedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isProcessing by remember { mutableStateOf(false) }

    val filterCache = remember { mutableMapOf<ScanFilter, Bitmap>() }

    // 1. Initial Setup: Decode raw preview & detect document corners
    LaunchedEffect(rawImageBytes) {
        withContext(Dispatchers.Default) {
            val bmp = ImageProcessingUtils.decodeSampledBitmap(rawImageBytes)
            if (bmp != null) {
                previewRawBitmap = bmp
                cropQuad = ImageProcessingUtils.detectDocumentCorners(bmp)
            }
        }
    }

    // 2. Filter application on the cropped active bytes
    LaunchedEffect(activeBytes, selectedFilter, isCropping) {
        if (isCropping) return@LaunchedEffect
        if (filterCache.containsKey(selectedFilter)) {
            displayedBitmap = filterCache[selectedFilter]
            return@LaunchedEffect
        }

        isProcessing = true
        withContext(Dispatchers.Default) {
            try {
                val processedBytes = if (selectedFilter == ScanFilter.ORIGINAL) {
                    activeBytes
                } else {
                    try {
                        bridgeApplyScanFilter(activeBytes, selectedFilter.mode)
                    } catch (_: Throwable) {
                        ImageProcessingUtils.applyFallbackFilter(activeBytes, selectedFilter)
                    }
                }
                val bmp = ImageProcessingUtils.decodeSampledBitmap(processedBytes)
                if (bmp != null) {
                    filterCache[selectedFilter] = bmp
                    displayedBitmap = bmp
                }
            } catch (_: Throwable) {
                val fallbackBmp = ImageProcessingUtils.decodeSampledBitmap(activeBytes)
                if (fallbackBmp != null) {
                    filterCache[selectedFilter] = fallbackBmp
                    displayedBitmap = fallbackBmp
                }
            }
        }
        isProcessing = false
    }

    Scaffold(
        topBar = {
            CropFilterTopBar(
                pageNumber = pageNumber,
                isCropping = isCropping,
                onCancel = onCancel,
                onRotate = {
                    val currentBmp = (if (isCropping) previewRawBitmap else displayedBitmap) ?: return@CropFilterTopBar
                    val matrix = android.graphics.Matrix().apply { postRotate(90f) }
                    val rotated = Bitmap.createBitmap(currentBmp, 0, 0, currentBmp.width, currentBmp.height, matrix, true)
                    if (isCropping) previewRawBitmap = rotated else {
                        displayedBitmap = rotated
                        filterCache[selectedFilter] = rotated
                    }
                },
                onToggleCropMode = {
                    filterCache.clear()
                    isCropping = true
                }
            )
        },
        bottomBar = {
            if (isCropping) {
                CropBottomActionBar(
                    isProcessing = isProcessing,
                    onResetFull = {
                        cropQuad = NormalizedQuad(Offset(0.01f, 0.01f), Offset(0.99f, 0.01f), Offset(0.99f, 0.99f), Offset(0.01f, 0.99f))
                    },
                    onConfirmCrop = {
                        val rawBmp = previewRawBitmap ?: return@CropBottomActionBar
                        isProcessing = true
                        scope.launch(Dispatchers.Default) {
                            val warped = ImageProcessingUtils.warpDocument(rawImageBytes, cropQuad, rawBmp.width, rawBmp.height)
                            filterCache.clear()
                            withContext(Dispatchers.Main) {
                                activeBytes = warped
                                isCropping = false
                                isProcessing = false
                            }
                        }
                    }
                )
            } else {
                CropFilterBottomBar(
                    selectedFilter = selectedFilter,
                    isProcessing = isProcessing,
                    hasBitmap = displayedBitmap != null,
                    onSelectFilter = { selectedFilter = it },
                    onAddMore = { displayedBitmap?.let { onAddMore(it) } },
                    onSavePdf = { displayedBitmap?.let { onSavePdf(it) } }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFF0F172A).copy(alpha = 0.95f))
                .padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            val bmpToShow = if (isCropping) previewRawBitmap else displayedBitmap

            if (bmpToShow != null) {
                Box(contentAlignment = Alignment.Center) {
                    Image(
                        bitmap = bmpToShow.asImageBitmap(),
                        contentDescription = "معاينة المستند",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .shadow(12.dp, RoundedCornerShape(8.dp))
                            .clip(RoundedCornerShape(8.dp))
                    )

                    // 4-Point Draggable Crop Overlay in Cropping Mode
                    if (isCropping) {
                        DocumentCropOverlay(
                            quad = cropQuad,
                            imageWidth = bmpToShow.width,
                            imageHeight = bmpToShow.height,
                            primaryColor = MaterialTheme.colorScheme.primary,
                            onQuadChange = { cropQuad = it }
                        )
                    }
                }
            }

            if (isProcessing) {
                Box(
                    modifier = Modifier
                        .size(110.dp)
                        .background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(if (isCropping) "قص المنظور..." else "معالجة...", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
