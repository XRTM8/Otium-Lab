package com.otium.lab.scanner.components

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.RotateRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CropFilterTopBar(
    pageNumber: Int,
    onCancel: () -> Unit,
    onRotate: () -> Unit
) {
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
        actions = {
            IconButton(onClick = onRotate) {
                @Suppress("DEPRECATION")
                Icon(Icons.Rounded.RotateRight, contentDescription = "تدوير 90°")
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    )
}
