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

// 1. Light Theme: Pure Studio White + Imperial Deep Burgundy
val LightPalette = lightColorScheme(
    primary = Color(0xFF881337),             // Deep Regal Burgundy (عنابي ملكي عميق)
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E6),    // Soft Rose Velvet Tint
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF9F1239),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFF1F2),
    onSecondaryContainer = Color(0xFF4C0519),
    background = Color(0xFFFFFFFF),          // Pure Clean White
    onBackground = Color(0xFF0F172A),        // Carbon Black (16.5:1 contrast)
    surface = Color(0xFFF8FAFC),            // Slate Studio Surface
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF475569),
    outline = Color(0xFFE2E8F0)
)

// 2. Cream Theme: Warm Japanese Book Paper + Deep Cherry Wine
val CreamPalette = lightColorScheme(
    primary = Color(0xFF9F1239),             // Warm Cherry Wine (كرزي خمري دافئ)
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFCE7ED),    // Soft Warm Blossom Tint
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF881337),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF5EBE1),
    onSecondaryContainer = Color(0xFF381E19),
    background = Color(0xFFFBF7EE),          // Warm Natural Book Paper (ورق طبيعي مريح جداً)
    onBackground = Color(0xFF231815),        // Deep Espresso (14.8:1 contrast, zero eye fatigue)
    surface = Color(0xFFF3ECE0),            // Warm Paper Surface Card
    onSurface = Color(0xFF231815),
    surfaceVariant = Color(0xFFEBE2D2),
    onSurfaceVariant = Color(0xFF6B5B49),
    outline = Color(0xFFDFD3BD)
)

// 3. AMOLED Theme: 100% Pure Pitch Black + Glowing Ruby Cherry
val AmoledPalette = darkColorScheme(
    primary = Color(0xFFF43F5E),             // Vibrant Ruby Cherry (كرزي ياقوتي متوهج على السواد)
    onPrimary = Color.White,
    primaryContainer = Color(0xFF4C0519),    // Rich Velvet Wine Pill Indicator
    onPrimaryContainer = Color(0xFFFECDD3),
    secondary = Color(0xFFE11D48),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF3B0715),
    onSecondaryContainer = Color(0xFFFDA4AF),
    background = Color(0xFF000000),          // 100% True Pitch Black (Pixels OFF)
    onBackground = Color(0xFFF8FAFC),        // Platinum White (20:1 contrast)
    surface = Color(0xFF0D0D10),            // Ultra Dark Glass
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF16161B),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF27272E)
)

class ThemePreferences(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("otium_theme_prefs", Context.MODE_PRIVATE)

    var currentTheme = mutableStateOf(loadTheme())
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

    fun getColorScheme(): ColorScheme {
        return when (currentTheme.value) {
            AppThemeMode.LIGHT -> LightPalette
            AppThemeMode.CREAM -> CreamPalette
            AppThemeMode.AMOLED -> AmoledPalette
        }
    }
}
