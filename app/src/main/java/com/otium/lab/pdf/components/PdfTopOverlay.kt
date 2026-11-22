package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoStories
import androidx.compose.material.icons.rounded.BorderColor
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.ViewStream
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.ReadingLayout

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfTopOverlay(
    visible: Boolean,
    title: String,
    currentPage: Int,
    pageCount: Int,
    barBg: Color,
    textColor: Color,
    readingLayout: ReadingLayout,
    pageColorMode: PageColorMode,
    isSelectionModeActive: Boolean = false,
    onToggleSelectionMode: () -> Unit = {},
    onToggleLayout: () -> Unit,
    onToggleColorMode: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(160)),
        exit = fadeOut(tween(160)),
        modifier = modifier
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            barBg.copy(alpha = 0.98f),
                            barBg.copy(alpha = 0.88f),
                            Color.Transparent
                        )
                    )
                )
                .statusBarsPadding()
        ) {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = title,
                            maxLines = 1,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = textColor
                        )
                        if (pageCount > 0) {
                            Text(
                                text = "\u200Eصفحة $currentPage من $pageCount\u200E",
                                fontSize = 12.sp,
                                color = textColor.copy(alpha = 0.7f)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(
                            Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "رجوع",
                            tint = textColor
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onToggleSelectionMode) {
                        Icon(
                            imageVector = Icons.Rounded.BorderColor,
                            contentDescription = if (isSelectionModeActive) "إيقاف التحديد" else "أداة التحديد والتظليل",
                            tint = if (isSelectionModeActive) MaterialTheme.colorScheme.primary else textColor
                        )
                    }

                    IconButton(onClick = onToggleLayout) {
                        Icon(
                            imageVector = if (readingLayout == ReadingLayout.VERTICAL) Icons.Rounded.AutoStories else Icons.Rounded.ViewStream,
                            contentDescription = readingLayout.labelAr,
                            tint = textColor
                        )
                    }

                    IconButton(onClick = onToggleColorMode) {
                        Icon(
                            imageVector = Icons.Rounded.Palette,
                            contentDescription = pageColorMode.labelAr,
                            tint = if (pageColorMode == PageColorMode.AMOLED_BLACK) MaterialTheme.colorScheme.primary else textColor
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
        }
    }
}
