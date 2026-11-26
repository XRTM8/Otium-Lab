package com.otium.lab.pdf.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
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
    val interactionSource = remember { MutableInteractionSource() }

    AnimatedVisibility(
        visible = visible && pageCount > 1,
        enter = fadeIn(tween(160)),
        exit = fadeOut(tween(160)),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            AnimatedVisibility(
                visible = isDraggingSlider,
                enter = fadeIn(tween(100)),
                exit = fadeOut(tween(100)),
                modifier = Modifier.padding(bottom = 8.dp)
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

            Surface(
                shape = RoundedCornerShape(20.dp),
                color = barBg.copy(alpha = 0.96f),
                border = BorderStroke(1.dp, textColor.copy(alpha = 0.14f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(10.dp, RoundedCornerShape(20.dp))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = textColor.copy(alpha = 0.08f),
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
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

                    Spacer(modifier = Modifier.width(12.dp))

                    Slider(
                        value = sliderValue,
                        onValueChange = onSliderValueChange,
                        onValueChangeFinished = onSliderValueChangeFinished,
                        valueRange = 1f..pageCount.toFloat().coerceAtLeast(1f),
                        steps = 0,
                        interactionSource = interactionSource,
                        thumb = {
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .shadow(2.dp, CircleShape)
                                    .background(MaterialTheme.colorScheme.primary, CircleShape)
                            )
                        },
                        track = { sliderState ->
                            val fraction = ((sliderState.value - sliderState.valueRange.start) /
                                (sliderState.valueRange.endInclusive - sliderState.valueRange.start).coerceAtLeast(1f))
                                .coerceIn(0f, 1f)
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp))
                                    .background(textColor.copy(alpha = 0.18f))
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth(fraction)
                                        .fillMaxHeight()
                                        .clip(RoundedCornerShape(3.dp))
                                        .background(MaterialTheme.colorScheme.primary)
                                )
                            }
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}
