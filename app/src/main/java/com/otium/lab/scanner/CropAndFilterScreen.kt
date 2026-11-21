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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.scanner.components.CropFilterBottomBar
import com.otium.lab.scanner.components.CropFilterTopBar
import com.otium.lab.scanner.model.ScanFilter
import com.otium.lab.scanner.util.ImageProcessingUtils
import kotlinx.coroutines.Dispatchers
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
    var selectedFilter by remember { mutableStateOf(ScanFilter.MAGIC_COLOR) }
    var displayedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isProcessing by remember { mutableStateOf(false) }

    // Memory cache for processed filter bitmaps to avoid redundant recalculation
    val filterCache = remember { mutableMapOf<ScanFilter, Bitmap>() }

    // Instant filter switching with Rust LUT engine + safety fallback
    LaunchedEffect(rawImageBytes, selectedFilter) {
        if (filterCache.containsKey(selectedFilter)) {
            displayedBitmap = filterCache[selectedFilter]
            return@LaunchedEffect
        }

        isProcessing = true
        withContext(Dispatchers.Default) {
            try {
                val processedBytes = if (selectedFilter == ScanFilter.ORIGINAL) {
                    rawImageBytes
                } else {
                    try {
                        bridgeApplyScanFilter(rawImageBytes, selectedFilter.mode)
                    } catch (t: Throwable) {
                        ImageProcessingUtils.applyFallbackFilter(rawImageBytes, selectedFilter)
                    }
                }
                val bmp = ImageProcessingUtils.decodeSampledBitmap(processedBytes)
                if (bmp != null) {
                    filterCache[selectedFilter] = bmp
                    displayedBitmap = bmp
                }
            } catch (t: Throwable) {
                val fallbackBmp = ImageProcessingUtils.decodeSampledBitmap(rawImageBytes)
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
                onCancel = onCancel,
                onRotate = {
                    val bmp = displayedBitmap ?: return@CropFilterTopBar
                    val matrix = android.graphics.Matrix().apply { postRotate(90f) }
                    val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
                    displayedBitmap = rotated
                    filterCache[selectedFilter] = rotated
                }
            )
        },
        bottomBar = {
            CropFilterBottomBar(
                selectedFilter = selectedFilter,
                isProcessing = isProcessing,
                hasBitmap = displayedBitmap != null,
                onSelectFilter = { selectedFilter = it },
                onAddMore = { displayedBitmap?.let { onAddMore(it) } },
                onSavePdf = { displayedBitmap?.let { onSavePdf(it) } }
            )
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
            val bmp = displayedBitmap
            if (bmp != null) {
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = "معاينة المستند الممسوح",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .shadow(12.dp, RoundedCornerShape(8.dp))
                        .clip(RoundedCornerShape(8.dp))
                )
            }

            if (isProcessing) {
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .background(Color.Black.copy(alpha = 0.75f), RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.primary,
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(36.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("معالجة...", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
