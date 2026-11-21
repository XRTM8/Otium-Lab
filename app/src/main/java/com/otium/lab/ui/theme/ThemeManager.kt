package com.otium.lab.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color

enum class AppThemeMode(val labelAr: String) {
    LIGHT("أبيض ناصع"),
    CREAM("كريمي ورقي"),
    AMOLED("أموليـد أسود")
}

val LightPalette = lightColorScheme(
    primary = Color(0xFFC29B38),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFBF4E4),
    onPrimaryContainer = Color(0xFF5A440D),
    background = Color(0xFFF8FAFC),
    onBackground = Color(0xFF0F172A),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F172A),
    surfaceVariant = Color(0xFFF1F5F9),
    onSurfaceVariant = Color(0xFF64748B),
    outline = Color(0xFFE2E8F0)
)

val CreamPalette = lightColorScheme(
    primary = Color(0xFFB4822B),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFEDE0C7),
    onPrimaryContainer = Color(0xFF432D06),
    background = Color(0xFFFBF7EE),
    onBackground = Color(0xFF2C2416),
    surface = Color(0xFFF4EBD9),
    onSurface = Color(0xFF2C2416),
    surfaceVariant = Color(0xFFEDE3D0),
    onSurfaceVariant = Color(0xFF7A6A50),
    outline = Color(0xFFDFCFAF)
)

val AmoledPalette = darkColorScheme(
    primary = Color(0xFFE5B842),
    onPrimary = Color.Black,
    primaryContainer = Color(0xFF262626),
    onPrimaryContainer = Color(0xFFFDE68A),
    background = Color(0xFF000000),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF111111),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF1A1A1A),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF2E2E2E)
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
