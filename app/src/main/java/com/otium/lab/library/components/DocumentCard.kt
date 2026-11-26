package com.otium.lab.library.components

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.library.StoredDocument
import com.otium.lab.library.util.PdfThumbnailLoader
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DocumentCard(
    doc: StoredDocument,
    isSelected: Boolean = false,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {},
    onShare: () -> Unit,
    onRename: () -> Unit,
    onAssignFolder: () -> Unit = {},
    onExport: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var showMenu by remember { mutableStateOf(false) }
    var thumbnail by remember(doc.uriString) { mutableStateOf<Bitmap?>(null) }
    val dateStr = SimpleDateFormat("dd MMM yyyy · hh:mm a", Locale.getDefault()).format(Date(doc.timestamp))

    LaunchedEffect(doc.uriString) {
        thumbnail = PdfThumbnailLoader.loadThumbnail(context, doc.uri, targetWidth = 180)
    }

    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f) else MaterialTheme.colorScheme.surface,
        border = if (isSelected) androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
        tonalElevation = 1.dp,
        modifier = modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = onLongClick)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .width(42.dp)
                        .height(56.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f), RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    val thumb = thumbnail
                    if (thumb != null && !thumb.isRecycled) {
                        Image(
                            bitmap = thumb.asImageBitmap(),
                            contentDescription = doc.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        Icon(
                            imageVector = if (doc.isScanned) Icons.Rounded.CameraAlt else Icons.Rounded.PictureAsPdf,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = doc.title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = if (doc.isScanned) "ممسوح ضوئياً" else "ملف PDF",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Medium
                        )
                        if (doc.totalPages > 0) {
                            Text(text = " · ${doc.totalPages} ص", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                        }
                        if (doc.folder.isNotBlank()) {
                            Text(text = " · ${doc.folder}", fontSize = 11.sp, color = MaterialTheme.colorScheme.secondary, fontWeight = FontWeight.SemiBold)
                        }
                        Text(text = " · $dateStr", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                Box {
                    IconButton(onClick = { showMenu = true }) {
                        Icon(Icons.Rounded.MoreVert, contentDescription = "خيارات", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                        DropdownMenuItem(text = { Text("مشاركة") }, onClick = { showMenu = false; onShare() }, leadingIcon = { Icon(Icons.Rounded.Share, contentDescription = null) })
                        DropdownMenuItem(text = { Text("تعديل الاسم") }, onClick = { showMenu = false; onRename() }, leadingIcon = { Icon(Icons.Rounded.Edit, contentDescription = null) })
                        DropdownMenuItem(text = { Text("تعيين مجلد") }, onClick = { showMenu = false; onAssignFolder() }, leadingIcon = { Icon(Icons.Rounded.CreateNewFolder, contentDescription = null) })
                        DropdownMenuItem(text = { Text("حفظ في التنزيلات") }, onClick = { showMenu = false; onExport() }, leadingIcon = { Icon(Icons.Rounded.Download, contentDescription = null) })
                        DropdownMenuItem(text = { Text("حذف", color = MaterialTheme.colorScheme.error) }, onClick = { showMenu = false; onDelete() }, leadingIcon = { Icon(Icons.Rounded.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) })
                    }
                }
            }

            if (doc.totalPages > 0 && doc.lastPage > 1) {
                Spacer(modifier = Modifier.height(8.dp))
                val progress = (doc.lastPage.toFloat() / doc.totalPages.toFloat()).coerceIn(0f, 1f)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(start = 56.dp)
                ) {
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier.weight(1f).height(3.dp).clip(RoundedCornerShape(2.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                    )
                    Text(text = "ص ${doc.lastPage}/${doc.totalPages}", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}
