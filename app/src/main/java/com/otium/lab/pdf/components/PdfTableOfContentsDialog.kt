package com.otium.lab.pdf.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.otium.lab.pdf.model.PdfHighlight
import com.otium.lab.pdf.model.PdfOutlineItem

@Composable
fun PdfTableOfContentsDialog(
    outline: List<PdfOutlineItem>,
    currentPage: Int,
    highlights: List<PdfHighlight> = emptyList(),
    documentTitle: String = "",
    onDeleteHighlight: (PdfHighlight) -> Unit = {},
    onSelectPage: (Int) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(if (outline.isNotEmpty()) 0 else if (highlights.isNotEmpty()) 1 else 0) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.78f)
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TabRow(
                        selectedTabIndex = selectedTab,
                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                        containerColor = MaterialTheme.colorScheme.surface,
                        divider = {}
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = { Text("الفهرس (${outline.size})", fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = { Text("التظليلات (${highlights.size})", fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Rounded.Close, contentDescription = "إلغاء")
                    }
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 6.dp))

                if (selectedTab == 0) {
                    if (outline.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("لا يتوفر فهرس رقمي لهذا المستند", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 4.dp)) {
                            items(outline) { item ->
                                val isCurrent = item.pageIndex == (currentPage - 1)
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isCurrent) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)
                                        .clickable { onSelectPage(item.pageIndex); onDismiss() }
                                ) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(start = 8.dp + (item.level * 16).dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(item.title, fontSize = 13.sp, fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                                        Text("${item.pageIndex + 1}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }
                } else {
                    TocHighlightsList(
                        highlights = highlights,
                        documentTitle = documentTitle,
                        onSelectPage = { p -> onSelectPage(p); onDismiss() },
                        onDeleteHighlight = onDeleteHighlight
                    )
                }
            }
        }
    }
}
