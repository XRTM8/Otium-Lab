package com.otium.lab.ui

import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.library.DocumentStore
import com.otium.lab.library.LibraryScreen
import com.otium.lab.pdf.PdfViewerScreen
import com.otium.lab.scanner.CameraScannerScreen
import com.otium.lab.scanner.CropAndFilterScreen
import com.otium.lab.scanner.PdfExporter
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.launch

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
    SCANNER("الماسح", Icons.Rounded.CameraAlt),
    SETTINGS("الإعدادات", Icons.Rounded.Settings)
}

@Composable
fun OtiumApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val documentStore = remember { DocumentStore(context) }
    val themePreferences = remember { ThemePreferences(context) }

    val currentTheme by themePreferences.currentTheme
    var currentDestination by remember { mutableStateOf(AppDestination.LIBRARY) }

    // Active Reader State
    var activePdfUri by remember { mutableStateOf<Uri?>(null) }
    var activePdfTitle by remember { mutableStateOf("") }

    // CamScanner Active State
    var capturedImageBytes by remember { mutableStateOf<ByteArray?>(null) }
    val accumulatedPages = remember { mutableStateListOf<Bitmap>() }
    var isExportingPdf by remember { mutableStateOf(false) }

    // Theme container
    MaterialTheme(
        colorScheme = themePreferences.getColorScheme()
    ) {
        // Fullscreen PDF Viewer takes precedence
        if (activePdfUri != null) {
            PdfViewerScreen(
                uri = activePdfUri!!,
                title = activePdfTitle,
                themePreferences = themePreferences,
                onClose = { activePdfUri = null }
            )
            return@MaterialTheme
        }

        // Fullscreen Crop & Filter takes precedence when an image was captured
        if (capturedImageBytes != null) {
            CropAndFilterScreen(
                rawImageBytes = capturedImageBytes!!,
                pageNumber = accumulatedPages.size + 1,
                onAddMore = { bmp ->
                    accumulatedPages.add(bmp)
                    capturedImageBytes = null
                },
                onSavePdf = { bmp ->
                    accumulatedPages.add(bmp)
                    capturedImageBytes = null
                    isExportingPdf = true
                    scope.launch {
                        try {
                            val file = PdfExporter.exportBitmapsToPdf(context, accumulatedPages.toList())
                            val uri = Uri.fromFile(file)
                            documentStore.addOrUpdateDocument(uri, file.nameWithoutExtension, isScanned = true)
                            accumulatedPages.clear()
                            activePdfUri = uri
                            activePdfTitle = file.nameWithoutExtension
                            currentDestination = AppDestination.LIBRARY
                        } catch (_: Exception) {
                        } finally {
                            isExportingPdf = false
                        }
                    }
                },
                onCancel = {
                    capturedImageBytes = null
                }
            )
            return@MaterialTheme
        }

        // Fullscreen CamScanner (Hides bottom bar completely for maximum immersive camera preview)
        if (currentDestination == AppDestination.SCANNER) {
            CameraScannerScreen(
                pageCount = accumulatedPages.size,
                onImageCaptured = { bytes ->
                    capturedImageBytes = bytes
                },
                onFinishBatch = {
                    if (accumulatedPages.isNotEmpty()) {
                        isExportingPdf = true
                        scope.launch {
                            try {
                                val file = PdfExporter.exportBitmapsToPdf(context, accumulatedPages.toList())
                                val uri = Uri.fromFile(file)
                                documentStore.addOrUpdateDocument(uri, file.nameWithoutExtension, isScanned = true)
                                accumulatedPages.clear()
                                activePdfUri = uri
                                activePdfTitle = file.nameWithoutExtension
                                currentDestination = AppDestination.LIBRARY
                            } catch (_: Exception) {
                            } finally {
                                isExportingPdf = false
                            }
                        }
                    }
                },
                onClose = {
                    accumulatedPages.clear()
                    currentDestination = AppDestination.LIBRARY
                }
            )
            return@MaterialTheme
        }

        val configuration = LocalConfiguration.current
        val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

        if (isLandscape) {
            // Adaptive Landscape: Sleek NavigationRail on side, freeing 100% vertical screen height
            Row(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surface,
                    header = {
                        Spacer(modifier = Modifier.height(6.dp))
                    }
                ) {
                    AppDestination.entries.forEach { destination ->
                        val isSelected = currentDestination == destination
                        NavigationRailItem(
                            selected = isSelected,
                            onClick = {
                                if (destination == AppDestination.SCANNER) {
                                    accumulatedPages.clear()
                                    capturedImageBytes = null
                                }
                                currentDestination = destination
                            },
                            icon = {
                                Icon(
                                    imageVector = destination.icon,
                                    contentDescription = destination.labelAr,
                                    modifier = Modifier.size(22.dp)
                                )
                            },
                            label = {
                                Text(
                                    destination.labelAr,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 11.sp
                                )
                            },
                            colors = NavigationRailItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                ) {
                    when (currentDestination) {
                        AppDestination.LIBRARY -> {
                            LibraryScreen(
                                documentStore = documentStore,
                                onOpenPdf = { uri, title ->
                                    activePdfUri = uri
                                    activePdfTitle = title
                                },
                                onNavigateToScanner = {
                                    accumulatedPages.clear()
                                    capturedImageBytes = null
                                    currentDestination = AppDestination.SCANNER
                                }
                            )
                        }
                        AppDestination.SCANNER -> {}
                        AppDestination.SETTINGS -> {
                            SettingsScreen(
                                themePreferences = themePreferences,
                                documentStore = documentStore
                            )
                        }
                    }
                }
            }
        } else {
            // Standard Portrait Shell with Bottom NavigationBar
            Scaffold(
                bottomBar = {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface,
                        tonalElevation = 6.dp
                    ) {
                        AppDestination.entries.forEach { destination ->
                            val isSelected = currentDestination == destination
                            NavigationBarItem(
                                selected = isSelected,
                                onClick = {
                                    if (destination == AppDestination.SCANNER) {
                                        accumulatedPages.clear()
                                        capturedImageBytes = null
                                    }
                                    currentDestination = destination
                                },
                                icon = {
                                    Icon(
                                        imageVector = destination.icon,
                                        contentDescription = destination.labelAr,
                                        modifier = Modifier.size(24.dp)
                                    )
                                },
                                label = {
                                    Text(
                                        destination.labelAr,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                        fontSize = 12.sp
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            )
                        }
                    }
                }
            ) { paddingValues ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(paddingValues)
                ) {
                    when (currentDestination) {
                        AppDestination.LIBRARY -> {
                            LibraryScreen(
                                documentStore = documentStore,
                                onOpenPdf = { uri, title ->
                                    activePdfUri = uri
                                    activePdfTitle = title
                                },
                                onNavigateToScanner = {
                                    accumulatedPages.clear()
                                    capturedImageBytes = null
                                    currentDestination = AppDestination.SCANNER
                                }
                            )
                        }
                        AppDestination.SCANNER -> {}
                        AppDestination.SETTINGS -> {
                            SettingsScreen(
                                themePreferences = themePreferences,
                                documentStore = documentStore
                            )
                        }
                    }
                }
            }
        }
    }
}
