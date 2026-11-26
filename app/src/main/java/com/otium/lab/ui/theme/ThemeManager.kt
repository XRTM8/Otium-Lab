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

// 1. Light Theme (Athar AMOLED White Palette + Deep Royal Burgundy #72142B)
val LightPalette = lightColorScheme(
    primary = Color(0xFF72142B),             // BurgundyDeep
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF4DCE2),
    onPrimaryContainer = Color(0xFF4A0B1B),
    secondary = Color(0xFF8B1538),           // BurgundyWarm
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFECEEF2),  // WhiteSurfaceElevated
    onSecondaryContainer = Color(0xFF72142B),
    background = Color(0xFFFFFFFF),          // AmoledWhite
    onBackground = Color(0xFF0F1014),        // DarkText
    surface = Color(0xFFF6F7F9),             // WhiteSurface
    onSurface = Color(0xFF0F1014),
    surfaceVariant = Color(0xFFECEEF2),      // WhiteSurfaceElevated
    onSurfaceVariant = Color(0xFF5A606E),    // DarkTextMuted
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFF6F7F9),
    surfaceContainer = Color(0xFFECEEF2),
    surfaceContainerHigh = Color(0xFFDFE2E8), // WhiteSurfaceActive
    surfaceContainerHighest = Color(0xFFD5D9E1),
    outline = Color(0x2E000000),
    outlineVariant = Color(0x1F000000),      // WhiteBorder
    inverseSurface = Color(0xFF14151B),
    inverseOnSurface = Color(0xFFF5F6F8)
)

// 2. Cream Theme (Warm Book Paper + Deep Royal Burgundy #72142B)
val CreamPalette = lightColorScheme(
    primary = Color(0xFF72142B),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF3D5DC),
    onPrimaryContainer = Color(0xFF4A0B1B),
    secondary = Color(0xFF8B1538),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFEBE1D0),
    onSecondaryContainer = Color(0xFF72142B),
    background = Color(0xFFFBF7EE),
    onBackground = Color(0xFF231815),
    surface = Color(0xFFF4ECE0),
    onSurface = Color(0xFF231815),
    surfaceVariant = Color(0xFFE9DEC9),
    onSurfaceVariant = Color(0xFF6B5B49),
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFFFDFBF5),
    surfaceContainerLow = Color(0xFFF4ECE0),
    surfaceContainer = Color(0xFFEBE1D0),
    surfaceContainerHigh = Color(0xFFE2D5C0),
    surfaceContainerHighest = Color(0xFFD8C9B1),
    outline = Color(0x2E000000),
    outlineVariant = Color(0x1F000000),
    inverseSurface = Color(0xFF231815),
    inverseOnSurface = Color(0xFFFBF7EE)
)

// 3. AMOLED Theme (Athar Pure AMOLED Black #000000 + StudioSurface #14151B + Velvet Burgundy #9E1B42)
val AmoledPalette = darkColorScheme(
    primary = Color(0xFF9E1B42),             // BurgundyAccent
    onPrimary = Color(0xFFF5F6F8),           // PureWhite
    primaryContainer = Color(0xFF330D1A),    // Solid Velvet Burgundy Pill Container
    onPrimaryContainer = Color(0xFFF5F6F8),
    secondary = Color(0xFF8B1538),           // BurgundyWarm
    onSecondary = Color(0xFFF5F6F8),
    secondaryContainer = Color(0x249E1B42),  // BurgundyMuted (14% tint)
    onSecondaryContainer = Color(0xFFF48AA7),
    background = Color(0xFF000000),          // AmoledBlack
    onBackground = Color(0xFFF5F6F8),        // PureWhite
    surface = Color(0xFF14151B),             // StudioSurface
    onSurface = Color(0xFFF5F6F8),
    surfaceVariant = Color(0xFF1E2028),      // StudioSurfaceElevated
    onSurfaceVariant = Color(0xFFA1A3AF),    // MutedWhite
    surfaceTint = Color.Transparent,
    surfaceContainerLowest = Color(0xFF0A0B0E), // StudioBackground
    surfaceContainerLow = Color(0xFF14151B),    // StudioSurface
    surfaceContainer = Color(0xFF1E2028),       // StudioSurfaceElevated
    surfaceContainerHigh = Color(0xFF282A36),   // StudioSurfaceActive
    surfaceContainerHighest = Color(0xFF323544),
    outline = Color(0x24FFFFFF),             // StudioBorderSubtle (14%)
    outlineVariant = Color(0x14FFFFFF),      // StudioBorder (8% white hairline)
    inverseSurface = Color(0xFF14151B),
    inverseOnSurface = Color(0xFFF5F6F8)
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
    val aSurfaceContainerLowest by animateColorAsState(surfaceContainerLowest, animSpec, label = "surfaceContainerLowest")
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
        surfaceContainerLowest = aSurfaceContainerLowest,
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
