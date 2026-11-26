package com.otium.lab.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color

enum class AppThemeMode(
    val labelAr: String,
    val isLightAppearance: Boolean
) {
    LIGHT("أبيض ناصع", true),
    CREAM("كريمي ورقي", true),
    AMOLED("أموليـد أسود", false)
}

// 1. Light Theme: Studio Paper White + Deep Regal Burgundy (neutral surfaces, zero tint bleed)
val LightPalette = lightColorScheme(
    primary = Color(0xFF881337),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E6),
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF9F1239),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFFF1F2),
    onSecondaryContainer = Color(0xFF4C0519),
    background = Color(0xFFF8FAFC),
    onBackground = Color(0xFF0F172A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF475569),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF8FAFC),
    surfaceContainer = Color(0xFFF1F5F9),
    surfaceContainerHigh = Color(0xFFE2E8F0),
    surfaceContainerHighest = Color(0xFFCBD5E1),
    outline = Color(0xFFCBD5E1),
    outlineVariant = Color(0xFFE2E8F0),
    inverseSurface = Color(0xFF18181B),
    inverseOnSurface = Color(0xFFF8FAFC)
)

// 2. Cream Theme: Warm Book Paper + Deep Regal Burgundy
val CreamPalette = lightColorScheme(
    primary = Color(0xFF881337),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF7D8DF),
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF9F1239),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF2E6D8),
    onSecondaryContainer = Color(0xFF381E19),
    background = Color(0xFFFBF7EE),
    onBackground = Color(0xFF231815),
    surface = Color(0xFFF5EFE2),
    onSurface = Color(0xFF231815),
    surfaceVariant = Color(0xFFEBE2D1),
    onSurfaceVariant = Color(0xFF6B5B49),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFDFBF5),
    surfaceContainerLow = Color(0xFFF5EFE2),
    surfaceContainer = Color(0xFFEFE7D6),
    surfaceContainerHigh = Color(0xFFE7DEC9),
    surfaceContainerHighest = Color(0xFFDFD3BD),
    outline = Color(0xFFD5C8B0),
    outlineVariant = Color(0xFFE4D9C4),
    inverseSurface = Color(0xFF2A211D),
    inverseOnSurface = Color(0xFFFBF7EE)
)

// 3. AMOLED Theme: True Pitch Black + Neutral Charcoal Surfaces + Velvet Burgundy Accents
val AmoledPalette = darkColorScheme(
    primary = Color(0xFFBE123C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF3D0C1B),
    onPrimaryContainer = Color(0xFFFECDD3),
    secondary = Color(0xFFE11D48),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF2B0A15),
    onSecondaryContainer = Color(0xFFFDA4AF),
    background = Color(0xFF000000),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111116),
    onSurface = Color(0xFFF4F4F5),
    surfaceVariant = Color(0xFF18181F),
    onSurfaceVariant = Color(0xFF9CA3AF),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF08080B),
    surfaceContainerLow = Color(0xFF111116),
    surfaceContainer = Color(0xFF17171D),
    surfaceContainerHigh = Color(0xFF1F1F27),
    surfaceContainerHighest = Color(0xFF282832),
    outline = Color(0xFF363644),
    outlineVariant = Color(0xFF272730),
    inverseSurface = Color(0xFF18181F),
    inverseOnSurface = Color(0xFFF8FAFC)
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
