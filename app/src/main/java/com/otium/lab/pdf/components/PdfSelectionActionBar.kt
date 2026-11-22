package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.model.PdfHighlight

val HighlightPalette = listOf(
    0xFFFACC15L, // Golden Yellow
    0xFF22C55EL, // Emerald Green
    0xFF38BDF8L, // Sky Blue
    0xFFF43F5EL, // Coral Rose
    0xFF881337L  // Regal Burgundy
)

@Composable
fun PdfSelectionActionBar(
    visible: Boolean,
    selectedText: String,
    selectedHighlight: PdfHighlight?,
    onCopy: () -> Unit,
    onHighlight: (Long) -> Unit,
    onDeleteHighlight: () -> Unit,
    onClear: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn() + slideInVertically(initialOffsetY = { -it }),
        exit = fadeOut() + slideOutVertically(targetOffsetY = { -it }),
        modifier = modifier
    ) {
        Surface(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .shadow(elevation = 12.dp, shape = RoundedCornerShape(20.dp)),
            shape = RoundedCornerShape(20.dp),
            color = Color(0xFF1E293B),
            tonalElevation = 6.dp
        ) {
            Row(
                modifier = Modifier
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Copy Action Button
                IconButton(onClick = onCopy, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Rounded.ContentCopy,
                        contentDescription = "نسخ",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }

                // Delete Button (if an existing highlight is selected)
                if (selectedHighlight != null) {
                    IconButton(onClick = onDeleteHighlight, modifier = Modifier.size(36.dp)) {
                        Icon(
                            Icons.Rounded.DeleteOutline,
                            contentDescription = "حذف التظليل",
                            tint = Color(0xFFF87171),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .height(24.dp)
                        .width(1.dp)
                        .background(Color.White.copy(alpha = 0.2f))
                )

                // Color Palette Buttons for Highlighting
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    HighlightPalette.forEach { colorArgb ->
                        val isCurrent = selectedHighlight?.colorArgb == colorArgb
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .background(Color(colorArgb))
                                .clickable { onHighlight(colorArgb) }
                                .then(
                                    if (isCurrent) Modifier.border(2.dp, Color.White, CircleShape)
                                    else Modifier
                                )
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .height(24.dp)
                        .width(1.dp)
                        .background(Color.White.copy(alpha = 0.2f))
                )

                // Dismiss / Close Button
                IconButton(onClick = onClear, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = "إلغاء",
                        tint = Color.LightGray,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
