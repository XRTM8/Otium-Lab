package com.otium.lab.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    documentStore: DocumentStore
) {
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

        // 1. Updates Banner
        UpdateBanner()

        // 2. Theme Selection
        ThemeSelectionCard(themePreferences = themePreferences)

        // 3. Reading Preferences (Keep screen on, volume keys, layout)
        ReadingPreferencesCard(themePreferences = themePreferences)

        // 4. Storage & Cache Management
        StorageCacheCard(documentStore = documentStore)

        // 5. About Otium System Specs
        AboutOtiumCard()

        Spacer(modifier = Modifier.height(36.dp))
    }
}
