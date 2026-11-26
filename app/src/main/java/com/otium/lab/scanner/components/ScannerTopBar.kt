package com.otium.lab.scanner.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.FlashOff
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ScannerTopBar(
    pageCount: Int,
    isFlashOn: Boolean,
    primaryColor: Color,
    statusText: String? = null,
    onClose: () -> Unit,
    onToggleFlash: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onClose,
            modifier = Modifier
                .size(44.dp)
                .background(Color.Black.copy(alpha = 0.55f), CircleShape)
        ) {
            Icon(
                Icons.AutoMirrored.Rounded.ArrowBack,
                contentDescription = "رجوع",
                tint = Color.White
            )
        }

        // Status Badge
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = Color.Black.copy(alpha = 0.65f),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.2f))
        ) {
            Text(
                text = statusText ?: if (pageCount > 0) "تم التقاط $pageCount صفحة" else "وجه الكاميرا نحو المستند واضغط للتركيز",
                color = if (statusText != null || pageCount > 0) primaryColor else Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp)
            )
        }

        // Flash Toggle
        IconButton(
            onClick = onToggleFlash,
            modifier = Modifier
                .size(44.dp)
                .background(Color.Black.copy(alpha = 0.55f), CircleShape)
        ) {
            Icon(
                imageVector = if (isFlashOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                contentDescription = "الفلاش",
                tint = if (isFlashOn) primaryColor else Color.White
            )
        }
    }
}
