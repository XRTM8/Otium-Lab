package com.otium.lab.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color

enum class AppThemeMode(val labelAr: String) {
    LIGHT("أبيض ناصع"),
    CREAM("كريمي ورقي"),
    AMOLED("أموليـد أسود")
}

// 1. Light Theme: Nordic Sapphire & Midnight Blue (أزرق حبري نورديك مريح وهادئ)
val LightPalette = lightColorScheme(
    primary = Color(0xFF1D4ED8),             // Royal Sapphire / Deep Cobalt Ink
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDBEAFE),    // Soft Ice Blue Tint
    onPrimaryContainer = Color(0xFF1E3A8A),
    secondary = Color(0xFF2563EB),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEFF6FF),
    onSecondaryContainer = Color(0xFF1E40AF),
    background = Color(0xFFFFFFFF),          // Pure Clean White
    onBackground = Color(0xFF0F172A),        // Deep Slate Charcoal
    surface = Color(0xFFF8FAFC),            // Slate Studio Surface
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF475569),
    outline = Color(0xFFE2E8F0),
    outlineVariant = Color(0xFFCBD5E1)
)

// 2. Cream Theme: Warm Natural Book Paper + Vintage Ink Navy (دفء ورقي وانسجام مكتبي)
val CreamPalette = lightColorScheme(
    primary = Color(0xFF1E3A5F),             // Vintage Ink Navy (كحلي عتيق دافئ متناسق مع الورق)
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE2DAC8),    // Natural Warm Parchment Container
    onPrimaryContainer = Color(0xFF152942),
    secondary = Color(0xFF2D4B73),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFEDE5D6),
    onSecondaryContainer = Color(0xFF1E3A5F),
    background = Color(0xFFFAF6ED),          // Warm Natural Book Paper (ورق طبيعي مريح جداً)
    onBackground = Color(0xFF231815),        // Deep Espresso (zero eye fatigue)
    surface = Color(0xFFF1EAD9),            // Warm Paper Surface Card
    onSurface = Color(0xFF231815),
    surfaceVariant = Color(0xFFE7DEC9),
    onSurfaceVariant = Color(0xFF6B5B49),
    outline = Color(0xFFD8CCB5),
    outlineVariant = Color(0xFFC7B89E)
)

// 3. AMOLED Theme: 100% Pitch Black + Eye-Soothing Sky Blue (سواد تام وأزرق سماوي غير متوهج)
val AmoledPalette = darkColorScheme(
    primary = Color(0xFF38BDF8),             // Calm Sky Blue (non-glaring, eye-soothing in dark)
    onPrimary = Color(0xFF082F49),          // Deep Navy on Sky Blue for high legibility
    primaryContainer = Color(0xFF0C4A6E),    // Deep Night Blue Pill Indicator
    onPrimaryContainer = Color(0xFFE0F2FE),
    secondary = Color(0xFF0EA5E9),
    onSecondary = Color(0xFF082F49),
    secondaryContainer = Color(0xFF07273C),
    onSecondaryContainer = Color(0xFFBAE6FD),
    background = Color(0xFF000000),          // 100% True Pitch Black (Pixels OFF)
    onBackground = Color(0xFFF8FAFC),        // Platinum White
    surface = Color(0xFF0F1318),            // Ultra Dark Charcoal Navy
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF161B22),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF262F3D),
    outlineVariant = Color(0xFF1E2633)
)

class ThemePreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("otium_theme_prefs", Context.MODE_PRIVATE)

    var currentTheme = mutableStateOf(loadTheme())
        private set

    var keepScreenOn = mutableStateOf(prefs.getBoolean("keep_screen_on", true))
        private set

    var defaultHorizontalLayout = mutableStateOf(prefs.getBoolean("default_horizontal_layout", false))
        private set

    var volumeKeysPageTurn = mutableStateOf(prefs.getBoolean("volume_keys_page_turn", false))
        private set

    private fun loadTheme(): AppThemeMode {
        val name = prefs.getString("theme_mode", AppThemeMode.LIGHT.name)
        return try {
            AppThemeMode.valueOf(name ?: AppThemeMode.LIGHT.name)
        } catch (_: Exception) {
            AppThemeMode.LIGHT
        }
    }

    fun setTheme(theme: AppThemeMode) {
        currentTheme.value = theme
        prefs.edit().putString("theme_mode", theme.name).apply()
    }

    fun setKeepScreenOn(enabled: Boolean) {
        keepScreenOn.value = enabled
        prefs.edit().putBoolean("keep_screen_on", enabled).apply()
    }

    fun setDefaultHorizontalLayout(enabled: Boolean) {
        defaultHorizontalLayout.value = enabled
        prefs.edit().putBoolean("default_horizontal_layout", enabled).apply()
    }

    fun setVolumeKeysPageTurn(enabled: Boolean) {
        volumeKeysPageTurn.value = enabled
        prefs.edit().putBoolean("volume_keys_page_turn", enabled).apply()
    }

    fun getColorScheme(): ColorScheme {
        return when (currentTheme.value) {
            AppThemeMode.LIGHT -> LightPalette
            AppThemeMode.CREAM -> CreamPalette
            AppThemeMode.AMOLED -> AmoledPalette
        }
    }
}
