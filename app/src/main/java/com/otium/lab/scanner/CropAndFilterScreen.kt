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
import com.otium.lab.scanner.components.*
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.model.ScanFilter
import com.otium.lab.scanner.util.ImageProcessingUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeApplyScanFilter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun CropAndFilterScreen(
    rawImageBytes: ByteArray,
    pageNumber: Int = 1,
    onAddMore: (Bitmap) -> Unit,
    onSavePdf: (Bitmap, String) -> Unit,
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
    var showSaveDialog by remember { mutableStateOf(false) }
    val filterCache = remember { mutableMapOf<ScanFilter, Bitmap>() }

    LaunchedEffect(rawImageBytes) {
        withContext(Dispatchers.Default) {
            ImageProcessingUtils.decodeSampledBitmap(rawImageBytes)?.let { bmp ->
                previewRawBitmap = bmp
                cropQuad = ImageProcessingUtils.detectDocumentCorners(bmp)
            }
        }
    }

    LaunchedEffect(activeBytes, selectedFilter, isCropping) {
        if (isCropping) return@LaunchedEffect
        if (filterCache.containsKey(selectedFilter)) {
            displayedBitmap = filterCache[selectedFilter]
            return@LaunchedEffect
        }
        isProcessing = true
        withContext(Dispatchers.Default) {
            try {
                val processed = if (selectedFilter == ScanFilter.ORIGINAL) activeBytes else {
                    try { bridgeApplyScanFilter(activeBytes, selectedFilter.mode) }
                    catch (_: Throwable) { ImageProcessingUtils.applyFallbackFilter(activeBytes, selectedFilter) }
                }
                val bmp = ImageProcessingUtils.decodeSampledBitmap(processed)
                if (bmp != null) {
                    filterCache[selectedFilter] = bmp
                    displayedBitmap = bmp
                }
            } catch (_: Throwable) {
                val fallback = ImageProcessingUtils.decodeSampledBitmap(activeBytes)
                if (fallback != null) {
                    filterCache[selectedFilter] = fallback
                    displayedBitmap = fallback
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
                    val stream = java.io.ByteArrayOutputStream()
                    rotated.compress(Bitmap.CompressFormat.JPEG, 90, stream)
                    val rotatedBytes = stream.toByteArray()
                    activeBytes = rotatedBytes
                    if (isCropping) {
                        previewRawBitmap = rotated
                    } else {
                        filterCache.clear()
                        filterCache[selectedFilter] = rotated
                        displayedBitmap = rotated
                    }
                },
                onToggleCropMode = { filterCache.clear(); isCropping = true }
            )
        },
        bottomBar = {
            if (isCropping) {
                CropBottomActionBar(
                    isProcessing = isProcessing,
                    onAutoDetect = {
                        previewRawBitmap?.let { bmp -> cropQuad = ImageProcessingUtils.detectDocumentCorners(bmp) }
                    },
                    onResetFull = {
                        cropQuad = NormalizedQuad(Offset(0.01f, 0.01f), Offset(0.99f, 0.01f), Offset(0.99f, 0.99f), Offset(0.01f, 0.99f))
                    },
                    onConfirmCrop = {
                        val rawBmp = previewRawBitmap ?: return@CropBottomActionBar
                        isProcessing = true
                        scope.launch(Dispatchers.Default) {
                            val warped = ImageProcessingUtils.warpDocument(activeBytes, cropQuad, rawBmp.width, rawBmp.height)
                            filterCache.clear()
                            withContext(Dispatchers.Main) { activeBytes = warped; isCropping = false; isProcessing = false }
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
                    onSavePdf = { displayedBitmap?.let { showSaveDialog = true } }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier.fillMaxSize().padding(paddingValues).background(Color(0xFF0B111E)).padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            val bmpToShow = if (isCropping) previewRawBitmap else displayedBitmap
            if (bmpToShow != null) {
                Box(contentAlignment = Alignment.Center) {
                    Image(
                        bitmap = bmpToShow.asImageBitmap(),
                        contentDescription = "معاينة المستند",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().shadow(12.dp, RoundedCornerShape(8.dp)).clip(RoundedCornerShape(8.dp))
                    )
                    if (isCropping) {
                        DocumentCropOverlay(
                            quad = cropQuad,
                            imageWidth = bmpToShow.width,
                            imageHeight = bmpToShow.height,
                            primaryColor = MaterialTheme.colorScheme.primary,
                            onQuadChange = { cropQuad = it },
                            previewBitmap = bmpToShow
                        )
                    }
                }
            }
            if (isProcessing) {
                Box(
                    modifier = Modifier.size(110.dp).background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(16.dp)),
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

        if (showSaveDialog && displayedBitmap != null) {
            val defaultName = remember { "مستند_ممسوح_${SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())}" }
            DocumentSaveNameDialog(
                defaultTitle = defaultName,
                onConfirm = { customName ->
                    showSaveDialog = false
                    onSavePdf(displayedBitmap!!, customName)
                },
                onDismiss = { showSaveDialog = false }
            )
        }
    }
}
