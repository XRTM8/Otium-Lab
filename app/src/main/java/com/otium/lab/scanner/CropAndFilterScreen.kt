package com.otium.lab.scanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeApplyScanFilter

enum class ScanFilter(val labelAr: String, val mode: String) {
    MAGIC_COLOR("لون سحري", "magic_color"),
    CLEAN_WHITE("ورقة بيضاء", "clean_white"),
    BLACK_WHITE("أبيض وأسود", "bw"),
    ORIGINAL("الأصل", "original")
}

@OptIn(ExperimentalMaterial3Api::class)
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

    // Fast memory cache for processed filter bitmaps to avoid redundant recalculation
    val filterCache = remember { mutableMapOf<ScanFilter, Bitmap>() }

    // Instant filter switching with memory caching & Rust LUT engine
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
                    bridgeApplyScanFilter(rawImageBytes, selectedFilter.mode)
                }
                val bmp = BitmapFactory.decodeByteArray(processedBytes, 0, processedBytes.size)
                if (bmp != null) {
                    filterCache[selectedFilter] = bmp
                    displayedBitmap = bmp
                }
            } catch (_: Exception) {
                val fallbackBmp = BitmapFactory.decodeByteArray(rawImageBytes, 0, rawImageBytes.size)
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
            TopAppBar(
                title = {
                    Column {
                        Text("معالجة المستند الممسوح", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Text("الصفحة $pageNumber", fontSize = 12.sp, color = Color.Gray)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Rounded.Close, contentDescription = "إلغاء وإعادة التقاط")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 6.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        "اختر نمط تحسين الورقة:",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.Start)
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    // Filter Selection Chips
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ScanFilter.entries.forEach { filter ->
                            val isSelected = filter == selectedFilter
                            FilterChip(
                                selected = isSelected,
                                onClick = { selectedFilter = filter },
                                label = {
                                    Text(
                                        filter.labelAr,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        fontSize = 12.sp
                                    )
                                },
                                modifier = Modifier.weight(1f),
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0xFFE5B842).copy(alpha = 0.2f),
                                    selectedLabelColor = Color(0xFFC29B38)
                                )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Action Buttons (Add More vs Save PDF)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                displayedBitmap?.let { onAddMore(it) }
                            },
                            enabled = displayedBitmap != null && !isProcessing,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("+ صفحة أخرى", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }

                        Button(
                            onClick = {
                                displayedBitmap?.let { onSavePdf(it) }
                            },
                            enabled = displayedBitmap != null && !isProcessing,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE5B842)),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1.3f)
                        ) {
                            Icon(Icons.Rounded.PictureAsPdf, contentDescription = null, tint = Color.Black, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("حفظ المستند PDF", color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
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
                            color = Color(0xFFE5B842),
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
