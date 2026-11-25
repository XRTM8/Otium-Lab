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
import com.otium.lab.scanner.model.CropFilterState
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.util.ImageProcessingUtils
import com.otium.lab.scanner.util.DocumentEdgeDetector
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
    val state = remember(rawImageBytes) { CropFilterState(rawImageBytes) }

    LaunchedEffect(rawImageBytes) {
        val result = withContext(Dispatchers.Default) {
            ImageProcessingUtils.decodeSampledBitmap(rawImageBytes)?.let { bmp ->
                bmp to DocumentEdgeDetector.detect(bmp)
            }
        }
        result?.let { (bmp, detection) ->
            state.previewRawBitmap = bmp
            state.hasDetectedBounds = detection != null
            state.cropQuad = detection?.quad ?: NormalizedQuad()
        }
    }

    LaunchedEffect(state.croppedBaseBytes, state.selectedFilter, state.isCropping) {
        state.applySelectedFilter()
    }

    Scaffold(
        topBar = {
            CropFilterTopBar(
                pageNumber = pageNumber,
                isCropping = state.isCropping,
                onCancel = onCancel,
                onRotate = { state.rotate90Cw(scope) },
                onToggleCropMode = { state.filterCache.clear(); state.isCropping = true }
            )
        },
        bottomBar = {
            if (state.isCropping) {
                CropBottomActionBar(
                    isProcessing = state.isProcessing,
                    onAutoDetect = { state.redetect(scope) },
                    onResetFull = {
                        state.cropQuad = NormalizedQuad(Offset(0.01f, 0.01f), Offset(0.99f, 0.01f), Offset(0.99f, 0.99f), Offset(0.01f, 0.99f))
                    },
                    onConfirmCrop = { state.confirmCrop(scope) }
                )
            } else {
                CropFilterBottomBar(
                    selectedFilter = state.selectedFilter,
                    isProcessing = state.isProcessing,
                    hasBitmap = state.displayedBitmap != null,
                    onSelectFilter = { state.selectedFilter = it },
                    onAddMore = { state.displayedBitmap?.let { onAddMore(it) } },
                    onSavePdf = { state.displayedBitmap?.let { state.showSaveDialog = true } }
                )
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier.fillMaxSize().padding(paddingValues).background(Color(0xFF0B111E)).padding(16.dp),
            contentAlignment = Alignment.Center
        ) {
            val bmpToShow = if (state.isCropping) state.previewRawBitmap else state.displayedBitmap
            if (bmpToShow != null) {
                Box(contentAlignment = Alignment.Center) {
                    Image(
                        bitmap = bmpToShow.asImageBitmap(),
                        contentDescription = "معاينة المستند",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().shadow(12.dp, RoundedCornerShape(8.dp)).clip(RoundedCornerShape(8.dp))
                    )
                    if (state.isCropping) {
                        DocumentCropOverlay(
                            quad = state.cropQuad,
                            imageWidth = bmpToShow.width,
                            imageHeight = bmpToShow.height,
                            primaryColor = MaterialTheme.colorScheme.primary,
                            onQuadChange = { state.cropQuad = it },
                            previewBitmap = bmpToShow
                        )
                    }
                }
            }
            if (state.isCropping && bmpToShow != null && !state.hasDetectedBounds) {
                Text(
                    "لم تُحدَّد حدود الورقة تلقائياً؛ اضبط الزوايا يدوياً",
                    color = Color.White,
                    fontSize = 13.sp,
                    modifier = Modifier.align(Alignment.TopCenter)
                        .background(Color.Black.copy(alpha = .72f), RoundedCornerShape(8.dp))
                        .padding(8.dp)
                )
            }
            if (state.isProcessing) {
                Box(
                    modifier = Modifier.size(110.dp).background(Color.Black.copy(alpha = 0.8f), RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(if (state.isCropping) "قص المنظور..." else "معالجة...", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }

        if (state.showSaveDialog && state.displayedBitmap != null) {
            val defaultName = remember { "مستند_ممسوح_${SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())}" }
            DocumentSaveNameDialog(
                defaultTitle = defaultName,
                onConfirm = { customName ->
                    state.showSaveDialog = false
                    onSavePdf(state.displayedBitmap!!, customName)
                },
                onDismiss = { state.showSaveDialog = false }
            )
        }
    }
}
