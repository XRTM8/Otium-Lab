package com.otium.lab.pdf.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

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
        title = { Text("انتقال سريع إلى صفحة", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
        text = {
            Column {
                Text("أدخل رقم الصفحة (1 - $pageCount):", fontSize = 12.sp, color = Color.Gray)
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = jumpInputText,
                    onValueChange = { jumpInputText = it.filter { char -> char.isDigit() } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(14.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = { jumpInputText = "1" },
                        modifier = Modifier.weight(1f)
                    ) { Text("الأولى", fontSize = 12.sp) }
                    OutlinedButton(
                        onClick = { jumpInputText = "${(pageCount / 2).coerceAtLeast(1)}" },
                        modifier = Modifier.weight(1f)
                    ) { Text("المنتصف", fontSize = 12.sp) }
                    OutlinedButton(
                        onClick = { jumpInputText = "$pageCount" },
                        modifier = Modifier.weight(1f)
                    ) { Text("الأخيرة", fontSize = 12.sp) }
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
