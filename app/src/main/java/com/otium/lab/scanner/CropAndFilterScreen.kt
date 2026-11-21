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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uniffi.otium_bridge.bridgeApplyScanFilter
import java.io.ByteArrayOutputStream

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
    onPageConfirmed: (Bitmap) -> Unit,
    onCancel: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var selectedFilter by remember { mutableStateOf(ScanFilter.MAGIC_COLOR) }
    var displayedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isProcessing by remember { mutableStateOf(false) }

    // Filter processing
    LaunchedEffect(rawImageBytes, selectedFilter) {
        isProcessing = true
        withContext(Dispatchers.Default) {
            try {
                val processedBytes = bridgeApplyScanFilter(rawImageBytes, selectedFilter.mode)
                val bmp = BitmapFactory.decodeByteArray(processedBytes, 0, processedBytes.size)
                displayedBitmap = bmp
            } catch (_: Exception) {
                displayedBitmap = BitmapFactory.decodeByteArray(rawImageBytes, 0, rawImageBytes.size)
            }
        }
        isProcessing = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("معالجة المستند الممسوح", fontSize = 16.sp, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onCancel) {
                        Icon(Icons.Rounded.Close, contentDescription = "إلغاء")
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            displayedBitmap?.let { onPageConfirmed(it) }
                        },
                        enabled = displayedBitmap != null && !isProcessing
                    ) {
                        Text("اعتماد الصفحة", fontWeight = FontWeight.Bold, color = Color(0xFFC29B38), fontSize = 15.sp)
                    }
                }
            )
        },
        bottomBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 4.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("اختر نمط تحسين الورقة:", fontSize = 12.sp, color = Color.Gray)
                    Spacer(modifier = Modifier.height(12.dp))

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
                                    selectedContainerColor = Color(0xFFC29B38).copy(alpha = 0.15f),
                                    selectedLabelColor = Color(0xFFC29B38)
                                )
                            )
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
                .background(Color(0xFF0F172A)),
            contentAlignment = Alignment.Center
        ) {
            if (isProcessing) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFFC29B38))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("جاري تحسين وضوح المستند بمحرك Rust...", color = Color.White, fontSize = 13.sp)
                }
            } else if (displayedBitmap != null) {
                Image(
                    bitmap = displayedBitmap!!.asImageBitmap(),
                    contentDescription = "معاينة المستند",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                )
            }
        }
    }
}
