package com.otium.lab.ui.settings.components

import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.otium.lab.BuildConfig
import com.otium.lab.update.UpdateManager
import com.otium.lab.update.UpdateState
import kotlinx.coroutines.launch

@Composable
fun AboutOtiumCard(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val updateManager = remember { UpdateManager(context) }
    var showTechDetails by remember { mutableStateOf(false) }
    var isChecking by remember { mutableStateOf(false) }

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Otium Mobile",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "قارئ PDF أصيل وسريع بدون تتبع",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.surfaceContainer,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier.clickable(enabled = !isChecking) {
                            isChecking = true
                            scope.launch {
                                updateManager.checkForUpdates(silentOnNetworkError = false).collect { st ->
                                    when (st) {
                                        is UpdateState.UpToDate -> {
                                            isChecking = false
                                            Toast.makeText(context, "أنت تستخدم أحدث إصدار (v${st.currentVersion})", Toast.LENGTH_SHORT).show()
                                        }
                                        is UpdateState.Available -> {
                                            isChecking = false
                                            Toast.makeText(context, "يتوفر تحديث جديد v${st.update.version}", Toast.LENGTH_LONG).show()
                                        }
                                        is UpdateState.Error -> {
                                            isChecking = false
                                            Toast.makeText(context, "تعذر الاتصال للتحقق من التحديثات", Toast.LENGTH_SHORT).show()
                                        }
                                        else -> Unit
                                    }
                                }
                            }
                        }
                    ) {
                        Box(modifier = Modifier.padding(7.dp), contentAlignment = Alignment.Center) {
                            if (isChecking) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Rounded.Refresh,
                                    contentDescription = "فحص التحديثات",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
                        modifier = Modifier.clickable { showTechDetails = true }
                    ) {
                        Text(
                            text = "v${BuildConfig.VERSION_NAME}",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                        )
                    }
                }
            }

            HorizontalDivider(
                modifier = Modifier.padding(vertical = 12.dp),
                color = MaterialTheme.colorScheme.outlineVariant
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Shield,
                        contentDescription = null,
                        tint = Color(0xFF10B981),
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "الخصوصية",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = "محلي 100% بدون اتصال",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF10B981)
                )
            }
        }
    }

    if (showTechDetails) {
        AlertDialog(
            onDismissRequest = { showTechDetails = false },
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            title = {
                Text("التفاصيل التقنية", style = MaterialTheme.typography.titleMedium)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TechSpecRow("الإصدار", "v${BuildConfig.VERSION_NAME}")
                    TechSpecRow("الواجهة", "Kotlin + Jetpack Compose")
                    TechSpecRow("محرك البحث العربي", "Rust Native Bridge")
                    TechSpecRow("معمارية المعالج", Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a")
                }
            },
            confirmButton = {
                TextButton(onClick = { showTechDetails = false }) {
                    Text("إغلاق")
                }
            }
        )
    }
}

@Composable
private fun TechSpecRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(text = value, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}
