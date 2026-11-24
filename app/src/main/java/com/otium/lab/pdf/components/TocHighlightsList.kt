package com.otium.lab.pdf.components

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.model.PdfHighlight

@Composable
fun TocHighlightsList(
    highlights: List<PdfHighlight>,
    documentTitle: String,
    onSelectPage: (Int) -> Unit,
    onDeleteHighlight: (PdfHighlight) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    fun exportMarkdown() {
        val sb = StringBuilder()
        sb.append("# اقتباسات من: $documentTitle\n")
        sb.append("*تم التصدير عبر تطبيق Otium*\n\n---\n\n")
        highlights.forEach { h ->
            sb.append("### صفحة ${h.pageIndex + 1}:\n")
            sb.append("> ${h.text}\n\n")
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "اقتباسات: $documentTitle")
            putExtra(Intent.EXTRA_TEXT, sb.toString())
        }
        context.startActivity(Intent.createChooser(intent, "تصدير الاقتباسات"))
    }

    if (highlights.isEmpty()) {
        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                text = "لم تقم بتظليل أي نصوص في هذا المستند بعد",
                fontSize = 14.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    } else {
        Column(modifier = modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${highlights.size} اقتباسات وتظليلات",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                TextButton(onClick = { exportMarkdown() }, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)) {
                    Icon(Icons.Rounded.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("تصدير Markdown", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }

            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 12.dp)) {
                items(highlights, key = { it.id }) { h ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { onSelectPage(h.pageIndex) }
                    ) {
                        Row(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.Top) {
                            Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(Color(h.colorArgb)).padding(top = 4.dp))
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "صفحة ${h.pageIndex + 1}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.primary,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = h.text,
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 4,
                                    overflow = TextOverflow.Ellipsis,
                                    lineHeight = 18.sp
                                )
                            }
                            IconButton(onClick = { onDeleteHighlight(h) }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "حذف", tint = Color.Gray, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
