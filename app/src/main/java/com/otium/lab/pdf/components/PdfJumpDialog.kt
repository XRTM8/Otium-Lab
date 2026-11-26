package com.otium.lab.pdf.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun PdfJumpDialog(
    pageCount: Int,
    initialPage: Int,
    onDismiss: () -> Unit,
    onConfirmJump: (Int) -> Unit
) {
    var jumpInputText by remember { mutableStateOf("$initialPage") }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        shape = RoundedCornerShape(20.dp),
        title = {
            Text(
                text = "انتقال سريع إلى صفحة",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column {
                Text(
                    text = "\u200Eأدخل رقم الصفحة (1 - $pageCount):\u200E",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = jumpInputText,
                    onValueChange = { jumpInputText = it.filter { char -> char.isDigit() } },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { jumpInputText = "1" },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("الأولى", style = MaterialTheme.typography.labelMedium) }
                    OutlinedButton(
                        onClick = { jumpInputText = "${(pageCount / 2).coerceAtLeast(1)}" },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("المنتصف", style = MaterialTheme.typography.labelMedium) }
                    OutlinedButton(
                        onClick = { jumpInputText = "$pageCount" },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.weight(1f)
                    ) { Text("الأخيرة", style = MaterialTheme.typography.labelMedium) }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val target = jumpInputText.toIntOrNull()
                    if (target != null && target in 1..pageCount) {
                        onConfirmJump(target)
                    }
                },
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            ) {
                Text("انتقال", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("إلغاء")
            }
        }
    )
}
