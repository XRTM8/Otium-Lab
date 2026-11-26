package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.otium.lab.pdf.model.PageColorMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfTopOverlay(
    visible: Boolean,
    title: String,
    currentPage: Int,
    pageCount: Int,
    barBg: Color,
    textColor: Color,
    pageColorMode: PageColorMode,
    isSelectionModeActive: Boolean = false,
    onOpenSearch: () -> Unit = {},
    onOpenToc: () -> Unit = {},
    onOpenDisplayOptions: () -> Unit = {},
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
                            barBg.copy(alpha = 0.90f),
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
                            overflow = TextOverflow.Ellipsis,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = textColor
                        )
                        if (pageCount > 0) {
                            Text(
                                text = "\u200Eصفحة $currentPage من $pageCount\u200E",
                                style = MaterialTheme.typography.bodySmall,
                                color = textColor.copy(alpha = 0.72f)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "رجوع",
                            tint = textColor
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onOpenSearch) {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = "بحث في المستند",
                            tint = textColor
                        )
                    }

                    IconButton(onClick = onOpenToc) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.MenuBook,
                            contentDescription = "فهرس المحتويات والتظليلات",
                            tint = textColor
                        )
                    }

                    IconButton(
                        onClick = onOpenDisplayOptions,
                        modifier = if (isSelectionModeActive || pageColorMode != PageColorMode.ORIGINAL) {
                            Modifier.background(MaterialTheme.colorScheme.primary.copy(alpha = 0.16f), CircleShape)
                        } else Modifier
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Tune,
                            contentDescription = "خيارات العرض والقراءة",
                            tint = if (isSelectionModeActive) MaterialTheme.colorScheme.primary else textColor
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
