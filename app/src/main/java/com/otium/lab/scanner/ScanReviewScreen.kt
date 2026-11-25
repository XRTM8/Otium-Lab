package com.otium.lab.scanner

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.otium.lab.scanner.components.DocumentSaveNameDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ScanReviewScreen(
    pages: List<File>,
    onBack: () -> Unit,
    onMove: (Int, Int) -> Unit,
    onDelete: (Int) -> Unit,
    onSave: (String) -> Unit
) {
    var showNameDialog by remember { mutableStateOf(false) }
    Scaffold(
        topBar = {
            Row(
                modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "العودة للكاميرا")
                }
                Text("مراجعة الصفحات (${pages.size})", style = MaterialTheme.typography.titleMedium)
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
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            itemsIndexed(pages, key = { _, file -> file.absolutePath }) { index, file ->
                val thumbnail by produceState<Bitmap?>(null, file) {
                    value = withContext(Dispatchers.IO) {
                        val options = BitmapFactory.Options().apply { inSampleSize = 8 }
                        BitmapFactory.decodeFile(file.absolutePath, options)
                    }
                }
                ElevatedCard(shape = RoundedCornerShape(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (thumbnail != null) {
                            Image(
                                bitmap = thumbnail!!.asImageBitmap(),
                                contentDescription = "الصفحة ${index + 1}",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(width = 70.dp, height = 90.dp)
                            )
                        } else Spacer(Modifier.size(width = 70.dp, height = 90.dp))
                        Text("الصفحة ${index + 1}", modifier = Modifier.weight(1f).padding(start = 12.dp))
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
    if (showNameDialog) {
        val defaultName = remember {
            "مستند_ممسوح_${SimpleDateFormat("yyyyMMdd_HHmm", Locale.getDefault()).format(Date())}"
        }
        DocumentSaveNameDialog(
            defaultTitle = defaultName,
            onConfirm = { showNameDialog = false; onSave(it) },
            onDismiss = { showNameDialog = false }
        )
    }
}
