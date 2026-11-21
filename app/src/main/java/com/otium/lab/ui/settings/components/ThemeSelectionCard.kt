package com.otium.lab.ui.settings.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences

@Composable
fun ThemeSelectionCard(
    themePreferences: ThemePreferences,
    modifier: Modifier = Modifier
) {
    val currentTheme = themePreferences.currentTheme.value

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Rounded.Palette,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "مظهر التطبيق (3 ثيمات)",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                ThemeOptionItem(
                    title = "أبيض ناصع",
                    previewBg = Color(0xFFFFFFFF),
                    previewBorder = Color(0xFFE2E8F0),
                    previewText = Color(0xFF1D4ED8),
                    isSelected = currentTheme == AppThemeMode.LIGHT,
                    onSelect = { themePreferences.setTheme(AppThemeMode.LIGHT) },
                    modifier = Modifier.weight(1f)
                )

                ThemeOptionItem(
                    title = "كريمي ورقي",
                    previewBg = Color(0xFFFAF6ED),
                    previewBorder = Color(0xFFD8CCB5),
                    previewText = Color(0xFF1E3A5F),
                    isSelected = currentTheme == AppThemeMode.CREAM,
                    onSelect = { themePreferences.setTheme(AppThemeMode.CREAM) },
                    modifier = Modifier.weight(1f)
                )

                ThemeOptionItem(
                    title = "أموليـد أسود",
                    previewBg = Color(0xFF000000),
                    previewBorder = Color(0xFF262F3D),
                    previewText = Color(0xFF38BDF8),
                    isSelected = currentTheme == AppThemeMode.AMOLED,
                    onSelect = { themePreferences.setTheme(AppThemeMode.AMOLED) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
fun ThemeOptionItem(
    title: String,
    previewBg: Color,
    previewBorder: Color,
    previewText: Color,
    isSelected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = previewBg,
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
        } else {
            androidx.compose.foundation.BorderStroke(1.dp, previewBorder)
        },
        modifier = modifier
            .height(95.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(onClick = onSelect)
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(10.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                if (isSelected) {
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.Check, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(12.dp))
                    }
                } else {
                    Spacer(modifier = Modifier.size(18.dp))
                }
            }

            Text(
                text = title,
                fontSize = 12.sp,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                color = previewText
            )
        }
    }
}
