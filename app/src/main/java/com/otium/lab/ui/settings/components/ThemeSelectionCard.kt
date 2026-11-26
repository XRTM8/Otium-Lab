package com.otium.lab.ui.settings.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences

private data class ThemePreviewSpec(
    val mode: AppThemeMode,
    val bg: Color,
    val cardBg: Color,
    val border: Color,
    val textLine: Color,
    val accent: Color
)

@Composable
fun ThemeSelectionCard(
    themePreferences: ThemePreferences,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current
    val currentTheme = themePreferences.currentTheme.value

    val specs = listOf(
        ThemePreviewSpec(
            mode = AppThemeMode.LIGHT,
            bg = Color(0xFFF8FAFC),
            cardBg = Color(0xFFFFFFFF),
            border = Color(0xFFE2E8F0),
            textLine = Color(0xFF0F172A),
            accent = Color(0xFF881337)
        ),
        ThemePreviewSpec(
            mode = AppThemeMode.CREAM,
            bg = Color(0xFFFBF7EE),
            cardBg = Color(0xFFF3ECE0),
            border = Color(0xFFDFD3BD),
            textLine = Color(0xFF231815),
            accent = Color(0xFF881337)
        ),
        ThemePreviewSpec(
            mode = AppThemeMode.AMOLED,
            bg = Color(0xFF000000),
            cardBg = Color(0xFF141419),
            border = Color(0xFF2C2C35),
            textLine = Color(0xFFF4F4F5),
            accent = Color(0xFFBE123C)
        )
    )

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            specs.forEach { spec ->
                ThemeOptionItem(
                    spec = spec,
                    isSelected = currentTheme == spec.mode,
                    onSelect = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        themePreferences.setTheme(spec.mode)
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun ThemeOptionItem(
    spec: ThemePreviewSpec,
    isSelected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onSelect)
            .padding(2.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = spec.bg,
            border = BorderStroke(
                width = if (isSelected) 2.dp else 1.dp,
                color = if (isSelected) MaterialTheme.colorScheme.primary else spec.border
            ),
            modifier = Modifier
                .fillMaxWidth()
                .height(86.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize().padding(8.dp)) {
                // Miniature UI Wireframe
                Column(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .width(28.dp)
                                .height(5.dp)
                                .clip(RoundedCornerShape(3.dp))
                                .background(spec.textLine.copy(alpha = 0.75f))
                        )
                        if (isSelected) {
                            Box(
                                modifier = Modifier
                                    .size(18.dp)
                                    .background(MaterialTheme.colorScheme.primary, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Check,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onPrimary,
                                    modifier = Modifier.size(11.dp)
                                )
                            }
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(7.dp),
                        color = spec.cardBg,
                        border = BorderStroke(0.5.dp, spec.border),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(7.dp),
                            verticalArrangement = Arrangement.spacedBy(5.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.75f)
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(spec.textLine.copy(alpha = 0.65f))
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(0.45f)
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(spec.textLine.copy(alpha = 0.3f))
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(3.dp)
                                    .clip(RoundedCornerShape(2.dp))
                                    .background(spec.accent)
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = spec.mode.labelAr,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
    }
}
