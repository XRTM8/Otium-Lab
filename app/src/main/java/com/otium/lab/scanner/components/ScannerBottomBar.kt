package com.otium.lab.scanner.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun ScannerBottomBar(
    pageCount: Int,
    isCapturing: Boolean,
    primaryColor: Color,
    onOpenGallery: () -> Unit,
    onCapture: () -> Unit,
    onFinishBatch: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(bottom = 28.dp, start = 24.dp, end = 24.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Pick from Gallery
        IconButton(
            onClick = onOpenGallery,
            modifier = Modifier
                .size(54.dp)
                .background(Color.Black.copy(alpha = 0.55f), CircleShape)
                .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
        ) {
            Icon(
                Icons.Rounded.PhotoLibrary,
                contentDescription = "معرض الصور",
                tint = Color.White,
                modifier = Modifier.size(26.dp)
            )
        }

        // Dual-Ring Optical Shutter Button
        Button(
            onClick = onCapture,
            enabled = !isCapturing,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
            contentPadding = PaddingValues(0.dp),
            modifier = Modifier
                .size(80.dp)
                .border(4.dp, Color.White, CircleShape)
        ) {
            if (isCapturing) {
                CircularProgressIndicator(
                    color = primaryColor,
                    modifier = Modifier.size(36.dp),
                    strokeWidth = 3.5.dp
                )
            } else {
                Box(
                    modifier = Modifier
                        .size(62.dp)
                        .background(primaryColor, CircleShape)
                )
            }
        }

        // Finish batch button (Active if at least 1 page already captured)
        if (pageCount > 0) {
            Button(
                onClick = onFinishBatch,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier
                    .size(54.dp)
                    .border(2.dp, Color.White.copy(alpha = 0.4f), CircleShape)
            ) {
                Icon(
                    Icons.Rounded.Check,
                    contentDescription = "إنهاء وحفظ",
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }
        } else {
            Spacer(modifier = Modifier.size(54.dp))
        }
    }
}
