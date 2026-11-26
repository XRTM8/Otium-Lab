package com.otium.lab.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.otium.lab.library.DocumentStore
import com.otium.lab.ui.components.UpdateBanner
import com.otium.lab.ui.settings.components.AboutOtiumCard
import com.otium.lab.ui.settings.components.ReadingPreferencesCard
import com.otium.lab.ui.settings.components.StorageCacheCard
import com.otium.lab.ui.settings.components.ThemeSelectionCard
import com.otium.lab.ui.theme.ThemePreferences

@Composable
fun SettingsScreen(
    themePreferences: ThemePreferences,
    documentStore: DocumentStore,
    isLandscape: Boolean,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = if (isLandscape) 32.dp else 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp, bottom = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (!isLandscape) {
                Surface(
                    onClick = onBack,
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "العودة للمكتبة",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }
            Text(
                text = "الإعدادات والمظهر",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground
            )
        }

        UpdateBanner()

        SettingsSectionLabel(text = "المظهر")
        ThemeSelectionCard(themePreferences = themePreferences)

        Spacer(modifier = Modifier.height(2.dp))
        SettingsSectionLabel(text = "تجربة القراءة")
        ReadingPreferencesCard(themePreferences = themePreferences)

        Spacer(modifier = Modifier.height(2.dp))
        SettingsSectionLabel(text = "التخزين")
        StorageCacheCard(documentStore = documentStore)

        Spacer(modifier = Modifier.height(2.dp))
        SettingsSectionLabel(text = "عن التطبيق")
        AboutOtiumCard()

        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
private fun SettingsSectionLabel(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(horizontal = 4.dp)
    )
}
