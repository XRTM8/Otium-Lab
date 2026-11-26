package com.otium.lab.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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

// 1. Light Theme: Warm Studio White + Imperial Deep Burgundy
val LightPalette = lightColorScheme(
    primary = Color(0xFF881337),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFE4E6),
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF9F1239),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFCE7ED),
    onSecondaryContainer = Color(0xFF881337),
    background = Color(0xFFFAF8F9),
    onBackground = Color(0xFF140D10),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF140D10),
    surfaceVariant = Color(0xFFF5EFF2),
    onSurfaceVariant = Color(0xFF57474E),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFAF6F7),
    surfaceContainer = Color(0xFFF5EFF2),
    surfaceContainerHigh = Color(0xFFEDE3E7),
    surfaceContainerHighest = Color(0xFFE4D6DC),
    outline = Color(0xFFDFCFD5),
    outlineVariant = Color(0xFFECE1E5),
    inverseSurface = Color(0xFF1C1116),
    inverseOnSurface = Color(0xFFF8FAFC)
)

// 2. Cream Theme: Warm Book Paper + Imperial Deep Burgundy
val CreamPalette = lightColorScheme(
    primary = Color(0xFF881337),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF8D7E0),
    onPrimaryContainer = Color(0xFF4C0519),
    secondary = Color(0xFF9F1239),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF2E1DB),
    onSecondaryContainer = Color(0xFF7F1D3A),
    background = Color(0xFFFBF7EE),
    onBackground = Color(0xFF231815),
    surface = Color(0xFFF5EFE2),
    onSurface = Color(0xFF231815),
    surfaceVariant = Color(0xFFEBE2D1),
    onSurfaceVariant = Color(0xFF6B5B49),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFDFBF5),
    surfaceContainerLow = Color(0xFFF5EFE2),
    surfaceContainer = Color(0xFFEFE5D5),
    surfaceContainerHigh = Color(0xFFE6D9C4),
    surfaceContainerHighest = Color(0xFFDDD0B8),
    outline = Color(0xFFD5C8B0),
    outlineVariant = Color(0xFFE4D9C4),
    inverseSurface = Color(0xFF2A211D),
    inverseOnSurface = Color(0xFFFBF7EE)
)

// 3. AMOLED Theme: Pitch Black OLED + Warm Velvet Burgundy-Obsidian Surfaces
val AmoledPalette = darkColorScheme(
    primary = Color(0xFFBE123C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF4C0519),
    onPrimaryContainer = Color(0xFFFFE4E6),
    secondary = Color(0xFFE11D48),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFF3B0816),
    onSecondaryContainer = Color(0xFFFECDD3),
    background = Color(0xFF000000),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF130C0F),
    onSurface = Color(0xFFF5F2F3),
    surfaceVariant = Color(0xFF1D1217),
    onSurfaceVariant = Color(0xFFA899A0),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF090607),
    surfaceContainerLow = Color(0xFF130C0F),
    surfaceContainer = Color(0xFF1C1116),
    surfaceContainerHigh = Color(0xFF25161D),
    surfaceContainerHighest = Color(0xFF2F1C24),
    outline = Color(0xFF422530),
    outlineVariant = Color(0xFF331D25),
    inverseSurface = Color(0xFF1C1116),
    inverseOnSurface = Color(0xFFF8FAFC)
)

@Composable
fun ColorScheme.animated(): ColorScheme {
    val animSpec = tween<Color>(durationMillis = 260)
    val aPrimary by animateColorAsState(primary, animSpec, label = "primary")
    val aOnPrimary by animateColorAsState(onPrimary, animSpec, label = "onPrimary")
    val aPrimaryContainer by animateColorAsState(primaryContainer, animSpec, label = "primaryContainer")
    val aOnPrimaryContainer by animateColorAsState(onPrimaryContainer, animSpec, label = "onPrimaryContainer")
    val aSecondary by animateColorAsState(secondary, animSpec, label = "secondary")
    val aSecondaryContainer by animateColorAsState(secondaryContainer, animSpec, label = "secondaryContainer")
    val aOnSecondaryContainer by animateColorAsState(onSecondaryContainer, animSpec, label = "onSecondaryContainer")
    val aBackground by animateColorAsState(background, animSpec, label = "background")
    val aOnBackground by animateColorAsState(onBackground, animSpec, label = "onBackground")
    val aSurface by animateColorAsState(surface, animSpec, label = "surface")
    val aOnSurface by animateColorAsState(onSurface, animSpec, label = "onSurface")
    val aSurfaceVariant by animateColorAsState(surfaceVariant, animSpec, label = "surfaceVariant")
    val aOnSurfaceVariant by animateColorAsState(onSurfaceVariant, animSpec, label = "onSurfaceVariant")
    val aSurfaceContainerLow by animateColorAsState(surfaceContainerLow, animSpec, label = "surfaceContainerLow")
    val aSurfaceContainer by animateColorAsState(surfaceContainer, animSpec, label = "surfaceContainer")
    val aSurfaceContainerHigh by animateColorAsState(surfaceContainerHigh, animSpec, label = "surfaceContainerHigh")
    val aOutline by animateColorAsState(outline, animSpec, label = "outline")
    val aOutlineVariant by animateColorAsState(outlineVariant, animSpec, label = "outlineVariant")

    return copy(
        primary = aPrimary,
        onPrimary = aOnPrimary,
        primaryContainer = aPrimaryContainer,
        onPrimaryContainer = aOnPrimaryContainer,
        secondary = aSecondary,
        secondaryContainer = aSecondaryContainer,
        onSecondaryContainer = aOnSecondaryContainer,
        background = aBackground,
        onBackground = aOnBackground,
        surface = aSurface,
        onSurface = aOnSurface,
        surfaceVariant = aSurfaceVariant,
        onSurfaceVariant = aOnSurfaceVariant,
        surfaceContainerLow = aSurfaceContainerLow,
        surfaceContainer = aSurfaceContainer,
        surfaceContainerHigh = aSurfaceContainerHigh,
        outline = aOutline,
        outlineVariant = aOutlineVariant
    )
}

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
