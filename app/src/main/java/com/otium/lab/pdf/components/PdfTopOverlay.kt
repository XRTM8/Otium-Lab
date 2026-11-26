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
import androidx.compose.material.icons.rounded.Bookmark
import androidx.compose.material.icons.rounded.BookmarkBorder
import androidx.compose.material.icons.rounded.Highlight
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfTopOverlay(
    visible: Boolean,
    title: String,
    currentPage: Int,
    pageCount: Int,
    barBg: Color,
    textColor: Color,
    isBookmarked: Boolean = false,
    isSelectionModeActive: Boolean = false,
    onToggleBookmark: () -> Unit = {},
    onToggleSelectionMode: () -> Unit = {},
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
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(barBg.copy(alpha = 0.96f))
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
                    IconButton(onClick = onToggleBookmark, modifier = Modifier.size(40.dp)) {
                        Icon(
                            imageVector = if (isBookmarked) Icons.Rounded.Bookmark else Icons.Rounded.BookmarkBorder,
                            contentDescription = if (isBookmarked) "إزالة العلامة المرجعية" else "إضافة علامة مرجعية",
                            tint = if (isBookmarked) MaterialTheme.colorScheme.primary else textColor
                        )
                    }

                    IconButton(
                        onClick = onToggleSelectionMode,
                        modifier = Modifier
                            .size(40.dp)
                            .then(
                                if (isSelectionModeActive) {
                                    Modifier.background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
                                } else Modifier
                            )
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Highlight,
                            contentDescription = if (isSelectionModeActive) "إيقاف التظليل" else "تفعيل التظليل",
                            tint = if (isSelectionModeActive) MaterialTheme.colorScheme.onPrimaryContainer else textColor
                        )
                    }

                    IconButton(onClick = onOpenToc, modifier = Modifier.size(40.dp)) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.MenuBook,
                            contentDescription = "الفهرس والتظليلات والعلامات",
                            tint = textColor
                        )
                    }

                    IconButton(onClick = onOpenDisplayOptions, modifier = Modifier.size(40.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.Tune,
                            contentDescription = "خيارات العرض والقراءة",
                            tint = textColor
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
            HorizontalDivider(thickness = 0.5.dp, color = textColor.copy(alpha = 0.12f))
        }
    }
}
