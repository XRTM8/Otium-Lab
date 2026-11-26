package com.otium.lab.scanner.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.PictureAsPdf
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.scanner.PdfExportQuality
import com.otium.lab.scanner.PdfPageSize

@Composable
fun DocumentSaveNameDialog(
    defaultTitle: String,
    onConfirmWithOptions: ((String, PdfExportQuality, PdfPageSize) -> Unit)? = null,
    onConfirm: (String) -> Unit = {},
    onDismiss: () -> Unit
) {
    var title by remember { mutableStateOf(defaultTitle) }
    var selectedQuality by remember { mutableStateOf(PdfExportQuality.BALANCED) }
    var selectedPageSize by remember { mutableStateOf(PdfPageSize.A4) }

    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Rounded.PictureAsPdf,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
        },
        title = {
            Text(
                text = "حفظ المستند بصيغة PDF",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
        },
        text = {
            Column {
                Text(
                    text = "حدد اسم المستند لحفظه في مكتبتك:",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                        unfocusedBorderColor = MaterialTheme.colorScheme.outline
                    ),
                    modifier = Modifier.fillMaxWidth()
                )
                if (onConfirmWithOptions != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("جودة التصدير:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PdfExportQuality.entries.forEach { q ->
                            FilterChip(
                                selected = selectedQuality == q,
                                onClick = { selectedQuality = q },
                                label = { Text(q.labelAr, fontSize = 11.sp) }
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text("مقاس الصفحة:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        PdfPageSize.entries.forEach { s ->
                            FilterChip(
                                selected = selectedPageSize == s,
                                onClick = { selectedPageSize = s },
                                label = { Text(s.labelAr, fontSize = 11.sp) }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val clean = title.trim().ifEmpty { defaultTitle }
                    if (onConfirmWithOptions != null) onConfirmWithOptions(clean, selectedQuality, selectedPageSize)
                    else onConfirm(clean)
                },
                enabled = title.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("حفظ المستند", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                shape = RoundedCornerShape(10.dp)
            ) {
                Text("إلغاء", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        shape = RoundedCornerShape(20.dp),
        containerColor = MaterialTheme.colorScheme.surface
    )
}
