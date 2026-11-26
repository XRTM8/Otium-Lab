package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PdfBottomScrubber(
    visible: Boolean,
    currentPage: Int,
    pageCount: Int,
    sliderValue: Float,
    isDraggingSlider: Boolean,
    barBg: Color,
    textColor: Color,
    onSliderValueChange: (Float) -> Unit,
    onSliderValueChangeFinished: () -> Unit,
    onOpenJumpDialog: () -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible && pageCount > 1,
        enter = fadeIn(tween(160)),
        exit = fadeOut(tween(160)),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            barBg.copy(alpha = 0.90f),
                            barBg.copy(alpha = 0.98f)
                        )
                    )
                )
                .navigationBarsPadding()
        ) {
            AnimatedVisibility(
                visible = isDraggingSlider,
                enter = fadeIn(tween(100)),
                exit = fadeOut(tween(100)),
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 6.dp)
            ) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primary,
                    shadowElevation = 6.dp
                ) {
                    val activePage = sliderValue.toInt()
                    val percent = ((activePage.toFloat() / pageCount.toFloat()) * 100).toInt()
                    Text(
                        text = "\u200Eصفحة $activePage من $pageCount · $percent%\u200E",
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                    )
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = textColor.copy(alpha = 0.08f),
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(onClick = onOpenJumpDialog)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val displayNum = if (isDraggingSlider) sliderValue.toInt() else currentPage
                        Text(
                            text = "\u200E$displayNum / $pageCount\u200E",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = textColor
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.Rounded.UnfoldMore,
                            contentDescription = "انتقال سريع",
                            tint = textColor.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(10.dp))

                Slider(
                    value = sliderValue,
                    onValueChange = onSliderValueChange,
                    onValueChangeFinished = onSliderValueChangeFinished,
                    valueRange = 1f..pageCount.toFloat().coerceAtLeast(1f),
                    steps = 0,
                    modifier = Modifier.weight(1f),
                    colors = SliderDefaults.colors(
                        thumbColor = MaterialTheme.colorScheme.primary,
                        activeTrackColor = MaterialTheme.colorScheme.primary,
                        inactiveTrackColor = textColor.copy(alpha = 0.2f)
                    )
                )
            }
        }
    }
}
