package com.otium.lab.scanner.components

import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Crop
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
    isCropping: Boolean,
    onCancel: () -> Unit,
    onRotate: () -> Unit,
    onToggleCropMode: () -> Unit
) {
    TopAppBar(
        title = {
            Column {
                Text(
                    text = if (isCropping) "تحديد وقص أطراف المستند" else "معالجة المستند الممسوح",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = if (isCropping) "اسحب المقابض لتطابق حدود الصفحة" else "الصفحة $pageNumber",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
            }
        },
        navigationIcon = {
            IconButton(onClick = onCancel) {
                Icon(Icons.Rounded.Close, contentDescription = "إلغاء وإعادة التقاط")
            }
        },
        actions = {
            if (!isCropping) {
                IconButton(onClick = onToggleCropMode) {
                    Icon(Icons.Rounded.Crop, contentDescription = "تعديل القص")
                }
            }
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
