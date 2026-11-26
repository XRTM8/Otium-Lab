package com.otium.lab.ui.settings.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import com.otium.lab.ui.theme.ThemePreferences

@Composable
fun ReadingPreferencesCard(
    themePreferences: ThemePreferences,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current
    val keepScreenOn = themePreferences.keepScreenOn.value
    val defaultHorizontal = themePreferences.defaultHorizontalLayout.value
    val volumeKeysPageTurn = themePreferences.volumeKeysPageTurn.value

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(vertical = 6.dp)) {
            PreferenceToggleRow(
                title = "إبقاء الشاشة مضاءة",
                subtitle = "منع قفل الشاشة أثناء قراءة المستندات",
                icon = Icons.Rounded.LightMode,
                checked = keepScreenOn,
                onCheckedChange = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    themePreferences.setKeepScreenOn(it)
                }
            )

            HorizontalDivider(
                modifier = Modifier.padding(start = 64.dp, end = 16.dp),
                color = MaterialTheme.colorScheme.outlineVariant
            )

            PreferenceToggleRow(
                title = "تقليب أفقي افتراضياً",
                subtitle = "فتح المستندات بنمط تقليب الصفحات بدلاً من التمرير",
                icon = Icons.Rounded.SwapHoriz,
                checked = defaultHorizontal,
                onCheckedChange = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    themePreferences.setDefaultHorizontalLayout(it)
                }
            )

            HorizontalDivider(
                modifier = Modifier.padding(start = 64.dp, end = 16.dp),
                color = MaterialTheme.colorScheme.outlineVariant
            )

            PreferenceToggleRow(
                title = "التقليب بأزرار الصوت",
                subtitle = "الانتقال بين الصفحات بأزرار رفع وخفض الصوت",
                icon = Icons.AutoMirrored.Rounded.VolumeUp,
                checked = volumeKeysPageTurn,
                onCheckedChange = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    themePreferences.setVolumeKeysPageTurn(it)
                }
            )
        }
    }
}

@Composable
private fun PreferenceToggleRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (checked) MaterialTheme.colorScheme.primaryContainer
                        else MaterialTheme.colorScheme.surfaceContainer
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (checked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(19.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                checkedTrackColor = MaterialTheme.colorScheme.primary,
                uncheckedThumbColor = MaterialTheme.colorScheme.outline,
                uncheckedTrackColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                uncheckedBorderColor = MaterialTheme.colorScheme.outline
            )
        )
    }
}
