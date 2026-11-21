package com.otium.lab.ui

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.library.DocumentStore
import com.otium.lab.ui.components.UpdateBanner
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences

@Composable
fun SettingsScreen(
    themePreferences: ThemePreferences,
    documentStore: DocumentStore
) {
    val context = LocalContext.current
    val currentTheme by themePreferences.currentTheme
    val keepScreenOn by themePreferences.keepScreenOn
    val defaultHorizontal by themePreferences.defaultHorizontalLayout
    val volumeKeysPageTurn by themePreferences.volumeKeysPageTurn

    var storageBytes by remember { mutableLongStateOf(documentStore.getStorageUsageBytes()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "الإعدادات والمظهر",
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground
        )

        // Updates Card
        UpdateBanner()

        // 1. Theme Selection Card
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
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
                    ThemeOption(
                        title = "أبيض ناصع",
                        previewBg = Color(0xFFFFFFFF),
                        previewBorder = Color(0xFFE2E8F0),
                        previewText = Color(0xFF881337),
                        isSelected = currentTheme == AppThemeMode.LIGHT,
                        onSelect = { themePreferences.setTheme(AppThemeMode.LIGHT) },
                        modifier = Modifier.weight(1f)
                    )

                    ThemeOption(
                        title = "كريمي ورقي",
                        previewBg = Color(0xFFFBF7EE),
                        previewBorder = Color(0xFFDFD3BD),
                        previewText = Color(0xFF9F1239),
                        isSelected = currentTheme == AppThemeMode.CREAM,
                        onSelect = { themePreferences.setTheme(AppThemeMode.CREAM) },
                        modifier = Modifier.weight(1f)
                    )

                    ThemeOption(
                        title = "أموليـد أسود",
                        previewBg = Color(0xFF000000),
                        previewBorder = Color(0xFF27272E),
                        previewText = Color(0xFFF43F5E),
                        isSelected = currentTheme == AppThemeMode.AMOLED,
                        onSelect = { themePreferences.setTheme(AppThemeMode.AMOLED) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }

        // 2. Reading Preferences Card
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.AutoStories,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "تفضيلات القراءة",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Keep Screen On
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("إبقاء الشاشة مضاءة", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("منع قفل الشاشة أثناء قراءة المستندات", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = keepScreenOn,
                        onCheckedChange = { themePreferences.setKeepScreenOn(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = MaterialTheme.colorScheme.primary)
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

                // Default Layout Horizontal vs Vertical
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("تقليب أفقي افتراضياً", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("فتح المستندات بنمط تقليب الصفحات بدلاً من التمرير", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = defaultHorizontal,
                        onCheckedChange = { themePreferences.setDefaultHorizontalLayout(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = MaterialTheme.colorScheme.primary)
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

                // Volume Keys Navigation
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("التقليب بأزرار الصوت", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("الانتقال بين الصفحات بالضغط على أزرار رفع وخفض الصوت", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(
                        checked = volumeKeysPageTurn,
                        onCheckedChange = { themePreferences.setVolumeKeysPageTurn(it) },
                        colors = SwitchDefaults.colors(checkedThumbColor = MaterialTheme.colorScheme.primary)
                    )
                }
            }
        }

        // 3. Storage & Cache Management Card
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.Storage,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "التخزين والذاكرة المؤقتة",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("البيانات والذاكرة المخزنة", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val formattedSize = if (storageBytes > 1024 * 1024) {
                            String.format("%.1f ميغابايت", storageBytes / (1024.0 * 1024.0))
                        } else {
                            String.format("%.1f كيلوبايت", storageBytes / 1024.0)
                        }
                        Text(formattedSize, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }

                    OutlinedButton(
                        onClick = {
                            documentStore.clearTemporaryCache()
                            storageBytes = documentStore.getStorageUsageBytes()
                            Toast.makeText(context, "تم تفريغ الذاكرة المؤقتة بنجاح", Toast.LENGTH_SHORT).show()
                        },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Rounded.CleaningServices, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("تفريغ المؤقت", fontSize = 12.sp)
                    }
                }
            }
        }

        // 4. About Otium Card
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Rounded.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("عن Otium Mobile", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }

                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "قارئ PDF أصيل وكام سكانر احترافي عالي السرعة",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "محرك أندرويد نيتف (Kotlin + Jetpack Compose) مع معالجة صور بـ Rust",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                )

                Spacer(modifier = Modifier.height(14.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("معمارية المعالج", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("ARM64-v8a محسنة", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }

                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("مستوى الخصوصية", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("100% محلي بدون اتصال خارجي", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF10B981))
                }
            }
        }

        Spacer(modifier = Modifier.height(40.dp))
    }
}

@Composable
fun ThemeOption(
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
