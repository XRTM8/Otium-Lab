package com.otium.lab.scanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.RotateRight
import androidx.compose.material.icons.rounded.AddAPhoto
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Crop
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Draw
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.otium.lab.scanner.components.DocumentSaveNameDialog
import com.otium.lab.scanner.components.SignaturePadDialog
import com.otium.lab.scanner.model.ScanFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ScanReviewScreen(
    pages: List<File>,
    isBusy: Boolean = false,
    onBack: () -> Unit,
    onMove: (Int, Int) -> Unit,
    onRotate: (Int) -> Unit,
    onDeskew: (Int) -> Unit = {},
    onStampSignature: (Int, Bitmap) -> Unit = { _, _ -> },
    onEditPage: (Int) -> Unit = {},
    onDelete: (Int) -> Unit,
    onApplyFilterAll: (ScanFilter) -> Unit = {},
    onSaveWithOptions: ((String, PdfExportQuality, PdfPageSize) -> Unit)? = null,
    onSave: (String) -> Unit = {}
) {
    var showNameDialog by remember { mutableStateOf(false) }
    var previewIndex by remember { mutableStateOf<Int?>(null) }
    var signingPageIndex by remember { mutableStateOf<Int?>(null) }
    var activeBatchFilter by remember { mutableStateOf<ScanFilter?>(null) }
    Scaffold(
        topBar = {
            Row(
                modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "العودة للكاميرا")
                }
                Text("مراجعة الصفحات (${pages.size})", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onBack) {
                    Icon(Icons.Rounded.AddAPhoto, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("إضافة")
                }
            }
        },
        bottomBar = {
            Surface(tonalElevation = 4.dp) {
                Button(
                    onClick = { showNameDialog = true },
                    enabled = pages.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(16.dp)
                ) { Text("حفظ المستند PDF") }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(ScanFilter.entries) { filter ->
                    FilterChip(
                        selected = activeBatchFilter == filter,
                        enabled = !isBusy && pages.isNotEmpty(),
                        onClick = {
                            activeBatchFilter = filter
                            onApplyFilterAll(filter)
                        },
                        label = { Text("الكل: ${filter.labelAr}") }
                    )
                }
            }
            if (isBusy) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
            itemsIndexed(pages, key = { _, file -> file.absolutePath }) { index, file ->
                val thumbnail by produceState<Bitmap?>(null, file) {
                    value = withContext(Dispatchers.IO) {
                        val options = BitmapFactory.Options().apply { inSampleSize = 6 }
                        BitmapFactory.decodeFile(file.absolutePath, options)
                    }
                }
                ElevatedCard(
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.clickable { previewIndex = index }
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (thumbnail != null) {
                            Image(
                                bitmap = thumbnail!!.asImageBitmap(),
                                contentDescription = "الصفحة ${index + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(width = 70.dp, height = 92.dp).clip(RoundedCornerShape(8.dp))
                            )
                        } else Spacer(Modifier.size(width = 70.dp, height = 92.dp))
                        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                            Text("الصفحة ${index + 1}", style = MaterialTheme.typography.titleSmall)
                            Text("اضغط للمعاينة والتكبير", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Column {
                            Row {
                                IconButton(onClick = { onEditPage(index) }, enabled = !isBusy) {
                                    Icon(Icons.Rounded.Crop, contentDescription = "قص وفلتر")
                                }
                                IconButton(onClick = { onRotate(index) }, enabled = !isBusy) {
                                    Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = "تدوير 90 درجة")
                                }
                            }
                            Row {
                                IconButton(onClick = { onDeskew(index) }, enabled = !isBusy) {
                                    Icon(Icons.Rounded.Straighten, contentDescription = "تعديل الميلان وتنظيف الحواف")
                                }
                                IconButton(onClick = { signingPageIndex = index }, enabled = !isBusy) {
                                    Icon(Icons.Rounded.Draw, contentDescription = "توقيع إلكتروني")
                                }
                            }
                        }
                        Column {
                            IconButton(onClick = { onMove(index, index - 1) }, enabled = index > 0) {
                                Icon(Icons.Rounded.ArrowUpward, contentDescription = "تحريك للأعلى")
                            }
                            IconButton(onClick = { onMove(index, index + 1) }, enabled = index < pages.lastIndex) {
                                Icon(Icons.Rounded.ArrowDownward, contentDescription = "تحريك للأسفل")
                            }
                        }
                        IconButton(onClick = { onDelete(index) }) {
                            Icon(Icons.Rounded.Delete, contentDescription = "حذف الصفحة")
                        }
                    }
                }
            }
        }
        }
    }
    previewIndex?.takeIf { it in pages.indices }?.let { idx ->
        val file = pages[idx]
        val fullBitmap by produceState<Bitmap?>(null, file) {
            value = withContext(Dispatchers.IO) {
                val options = BitmapFactory.Options().apply { inSampleSize = 2 }
                BitmapFactory.decodeFile(file.absolutePath, options)
            }
        }
        var scale by remember(file) { mutableFloatStateOf(1f) }
        var offsetX by remember(file) { mutableFloatStateOf(0f) }
        var offsetY by remember(file) { mutableFloatStateOf(0f) }
        Dialog(
            onDismissRequest = { previewIndex = null },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
                if (fullBitmap != null) {
                    Image(
                        bitmap = fullBitmap!!.asImageBitmap(),
                        contentDescription = "معاينة الصفحة ${idx + 1}",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(file) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 4f)
                                    if (scale > 1f) {
                                        offsetX += pan.x
                                        offsetY += pan.y
                                    } else {
                                        offsetX = 0f
                                        offsetY = 0f
                                    }
                                }
                            }
                            .graphicsLayer(
                                scaleX = scale,
                                scaleY = scale,
                                translationX = offsetX,
                                translationY = offsetY
                            )
                    )
                } else {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                Row(
                    modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { previewIndex = null }) {
                        Icon(Icons.Rounded.Close, contentDescription = "إغلاق", tint = Color.White)
                    }
                    Text("الصفحة ${idx + 1} من ${pages.size}", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { onRotate(idx) }) {
                        Icon(Icons.AutoMirrored.Rounded.RotateRight, contentDescription = "تدوير", tint = Color.White)
                    }
                }
            }
        }
    }
    signingPageIndex?.let { idx ->
        SignaturePadDialog(
            onConfirm = { bmp ->
                signingPageIndex = null
                onStampSignature(idx, bmp)
            },
            onDismiss = { signingPageIndex = null }
        )
    }
    if (showNameDialog) {
        val defaultName = remember {
            "مستند_ممسوح_${SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())}"
        }
        DocumentSaveNameDialog(
            defaultTitle = defaultName,
            onConfirmWithOptions = { title, q, s ->
                showNameDialog = false
                if (onSaveWithOptions != null) onSaveWithOptions(title, q, s) else onSave(title)
            },
            onDismiss = { showNameDialog = false }
        )
    }
}
