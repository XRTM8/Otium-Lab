package com.otium.lab.ui

import android.app.Activity
import android.content.res.Configuration
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.otium.lab.core.extensions.findActivity
import com.otium.lab.library.DocumentStore
import com.otium.lab.library.LibraryScreen
import com.otium.lab.pdf.PdfViewerScreen
import com.otium.lab.ui.components.AppDestination
import com.otium.lab.ui.components.AppNavigationShell
import com.otium.lab.ui.theme.OtiumShapes
import com.otium.lab.ui.theme.OtiumTypography
import com.otium.lab.ui.theme.ThemePreferences
import com.otium.lab.ui.theme.animated
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun OtiumApp(
    initialPdfUri: Uri? = null,
    initialPdfTitle: String? = null
) {
    val context = LocalContext.current
    val view = LocalView.current
    val documentStore = remember { DocumentStore(context) }
    val themePreferences = remember { ThemePreferences(context) }
    var currentDestination by remember { mutableStateOf(AppDestination.LIBRARY) }
    var activePdfUri by remember { mutableStateOf(initialPdfUri) }
    var activePdfTitle by remember { mutableStateOf(initialPdfTitle ?: "") }
    var lastBackPressedTime by remember { mutableLongStateOf(0L) }

    val currentTheme = themePreferences.currentTheme.value

    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            com.otium.lab.update.UpdateManager(context).cleanupStaleUpdateApk()
        }
    }

    if (!view.isInEditMode) {
        SideEffect {
            val window = context.findActivity()?.window ?: return@SideEffect
            val insetsController = WindowCompat.getInsetsController(window, view)
            insetsController.isAppearanceLightStatusBars = currentTheme.isLightAppearance
            insetsController.isAppearanceLightNavigationBars = currentTheme.isLightAppearance
        }
    }

    LaunchedEffect(initialPdfUri) {
        if (initialPdfUri != null) {
            val resolved = withContext(Dispatchers.IO) {
                val title = initialPdfTitle ?: DocumentStore.resolveDisplayName(context, initialPdfUri)
                documentStore.addOrUpdateDocument(initialPdfUri, title)
                title
            }
            activePdfTitle = resolved
            activePdfUri = initialPdfUri
        }
    }

    BackHandler(enabled = activePdfUri != null) { activePdfUri = null }
    BackHandler(enabled = activePdfUri == null && currentDestination == AppDestination.SETTINGS) {
        currentDestination = AppDestination.LIBRARY
    }
    BackHandler(enabled = activePdfUri == null && currentDestination == AppDestination.LIBRARY) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressedTime < 2000L) (context as? Activity)?.finish()
        else {
            lastBackPressedTime = now
            Toast.makeText(context, "اضغط مرة أخرى للخروج من التطبيق", Toast.LENGTH_SHORT).show()
        }
    }

    MaterialTheme(
        colorScheme = themePreferences.getColorScheme().animated(),
        typography = OtiumTypography,
        shapes = OtiumShapes
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
            AnimatedContent(
                targetState = activePdfUri,
                transitionSpec = {
                    fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(180))
                },
                label = "root_pdf_transition"
            ) { pdfUri ->
                if (pdfUri != null) {
                    PdfViewerScreen(
                        uri = pdfUri,
                        title = activePdfTitle,
                        themePreferences = themePreferences,
                        onClose = { activePdfUri = null }
                    )
                } else {
                    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
                    AppNavigationShell(
                        currentDestination = currentDestination,
                        isLandscape = isLandscape,
                        onSelectDestination = { destination -> currentDestination = destination }
                    ) {
                        AnimatedContent(
                            targetState = currentDestination,
                            transitionSpec = {
                                fadeIn(animationSpec = tween(180)) togetherWith fadeOut(animationSpec = tween(140))
                            },
                            label = "destination_transition"
                        ) { destination ->
                            when (destination) {
                                AppDestination.LIBRARY -> LibraryScreen(
                                    documentStore = documentStore,
                                    isLandscape = isLandscape,
                                    onOpenSettings = { currentDestination = AppDestination.SETTINGS },
                                    onOpenPdf = { uri, title ->
                                        activePdfUri = uri
                                        activePdfTitle = title
                                    }
                                )
                                AppDestination.SETTINGS -> SettingsScreen(
                                    themePreferences = themePreferences,
                                    documentStore = documentStore,
                                    isLandscape = isLandscape,
                                    onBack = { currentDestination = AppDestination.LIBRARY }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
