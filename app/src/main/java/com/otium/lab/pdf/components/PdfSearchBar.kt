package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PdfSearchBar(
    visible: Boolean,
    query: String,
    matchCount: Int,
    currentMatchIndex: Int,
    isSearching: Boolean,
    barBg: Color,
    textColor: Color,
    onQueryChange: (String) -> Unit,
    onNextMatch: () -> Unit,
    onPrevMatch: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(),
        exit = fadeOut(),
        modifier = modifier
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            shape = RoundedCornerShape(16.dp),
            color = barBg,
            shadowElevation = 8.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Rounded.Search,
                    contentDescription = null,
                    tint = textColor.copy(alpha = 0.7f),
                    modifier = Modifier.padding(start = 8.dp, end = 4.dp).size(20.dp)
                )

                OutlinedTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    placeholder = {
                        Text(
                            "بحث صرفي في المستند...",
                            fontSize = 13.sp,
                            color = textColor.copy(alpha = 0.5f)
                        )
                    },
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color.Transparent,
                        unfocusedBorderColor = Color.Transparent,
                        focusedTextColor = textColor,
                        unfocusedTextColor = textColor
                    ),
                    modifier = Modifier.weight(1f)
                )

                if (isSearching) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp).padding(end = 4.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary
                    )
                } else if (query.isNotBlank()) {
                    Text(
                        text = if (matchCount > 0) "${currentMatchIndex + 1}/$matchCount" else "0",
                        fontSize = 12.sp,
                        color = textColor.copy(alpha = 0.7f),
                        modifier = Modifier.padding(horizontal = 4.dp)
                    )

                    IconButton(onClick = onPrevMatch, enabled = matchCount > 0) {
                        Icon(
                            Icons.Rounded.KeyboardArrowUp,
                            contentDescription = "السابق",
                            tint = if (matchCount > 0) textColor else textColor.copy(alpha = 0.3f),
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    IconButton(onClick = onNextMatch, enabled = matchCount > 0) {
                        Icon(
                            Icons.Rounded.KeyboardArrowDown,
                            contentDescription = "التالي",
                            tint = if (matchCount > 0) textColor else textColor.copy(alpha = 0.3f),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                IconButton(onClick = onClose) {
                    Icon(
                        Icons.Rounded.Close,
                        contentDescription = "إغلاق البحث",
                        tint = textColor,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}
