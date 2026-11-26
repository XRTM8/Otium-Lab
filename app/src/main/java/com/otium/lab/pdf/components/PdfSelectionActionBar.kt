package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material.icons.rounded.Highlight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
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
                .shadow(10.dp, RoundedCornerShape(20.dp)),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.inverseSurface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val activeColor = selectedHighlight?.colorArgb ?: HighlightPalette.first()
                IconButton(onClick = { onHighlight(activeColor) }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Rounded.Highlight, contentDescription = "تظليل", tint = Color(activeColor), modifier = Modifier.size(20.dp))
                }

                Box(modifier = Modifier.height(22.dp).width(1.dp).background(MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.2f)))

                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    HighlightPalette.forEach { colorArgb ->
                        val isCurrent = selectedHighlight?.colorArgb == colorArgb
                        Box(
                            modifier = Modifier.size(34.dp).clip(CircleShape).clickable { onHighlight(colorArgb) },
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(20.dp)
                                    .clip(CircleShape)
                                    .background(Color(colorArgb))
                                    .then(
                                        if (isCurrent) Modifier.border(2.dp, MaterialTheme.colorScheme.inverseOnSurface, CircleShape)
                                        else Modifier
                                    )
                            )
                        }
                    }
                }

                Box(modifier = Modifier.height(22.dp).width(1.dp).background(MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.2f)))

                IconButton(onClick = onCopy, modifier = Modifier.size(36.dp)) {
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = "نسخ",
                        tint = MaterialTheme.colorScheme.inverseOnSurface,
                        modifier = Modifier.size(18.dp)
                    )
                }

                if (selectedHighlight != null) {
                    IconButton(onClick = onDeleteHighlight, modifier = Modifier.size(36.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.DeleteOutline,
                            contentDescription = "حذف التظليل",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                IconButton(onClick = onClear, modifier = Modifier.size(36.dp)) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "إلغاء",
                        tint = MaterialTheme.colorScheme.inverseOnSurface.copy(alpha = 0.7f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}
