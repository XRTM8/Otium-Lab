package com.otium.lab.ui

import android.app.Activity
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
    SCANNER("الماسح", Icons.Rounded.CameraAlt),
    SETTINGS("الإعدادات", Icons.Rounded.Settings)
}

@Composable
fun OtiumApp(
    initialPdfUri: Uri? = null,
    initialPdfTitle: String? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val documentStore = remember { DocumentStore(context) }
    val themePreferences = remember { ThemePreferences(context) }

    val currentTheme by themePreferences.currentTheme
    var currentDestination by remember { mutableStateOf(AppDestination.LIBRARY) }

    // Active Reader State
    var activePdfUri by remember { mutableStateOf(initialPdfUri) }
    var activePdfTitle by remember { mutableStateOf(initialPdfTitle ?: "") }

    LaunchedEffect(initialPdfUri) {
        if (initialPdfUri != null) {
            activePdfUri = initialPdfUri
            val resolved = initialPdfTitle ?: DocumentStore.resolveDisplayName(context, initialPdfUri)
            activePdfTitle = resolved
            documentStore.addOrUpdateDocument(initialPdfUri, resolved)
        }
    }

    // CamScanner Active State
    var capturedImageBytes by remember { mutableStateOf<ByteArray?>(null) }
    val accumulatedPageFiles = remember { mutableStateListOf<File>() }
    var isExportingPdf by remember { mutableStateOf(false) }

    fun clearScanSession() {
        accumulatedPageFiles.forEach { runCatching { it.delete() } }
        accumulatedPageFiles.clear()
    }

    // Back navigation control
    var lastBackPressedTime by remember { mutableLongStateOf(0L) }

    // --- BackHandler Navigation Stack (Rock-Solid User Experience) ---

    // 1. In PDF Viewer -> Close PDF and return to Library
    BackHandler(enabled = activePdfUri != null) {
        activePdfUri = null
    }

    // 2. In Crop & Filter Screen -> Cancel crop and return to Scanner
    BackHandler(enabled = activePdfUri == null && capturedImageBytes != null) {
        capturedImageBytes = null
    }

    // 3. In Camera Scanner -> Return to Library
    BackHandler(enabled = activePdfUri == null && capturedImageBytes == null && currentDestination == AppDestination.SCANNER) {
        clearScanSession()
        currentDestination = AppDestination.LIBRARY
    }

    // 4. In Settings Tab -> Return to Library Tab
    BackHandler(enabled = activePdfUri == null && capturedImageBytes == null && currentDestination == AppDestination.SETTINGS) {
        currentDestination = AppDestination.LIBRARY
    }

    // 5. At Root of Library Screen -> Double-tap Back within 2 seconds to exit cleanly
    BackHandler(enabled = activePdfUri == null && capturedImageBytes == null && currentDestination == AppDestination.LIBRARY) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressedTime < 2000L) {
            (context as? Activity)?.finish()
        } else {
            lastBackPressedTime = now
            Toast.makeText(context, "اضغط مرة أخرى للخروج من التطبيق", Toast.LENGTH_SHORT).show()
        }
    }

    // Theme container
    MaterialTheme(
        colorScheme = themePreferences.getColorScheme()
    ) {
        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                // Fullscreen PDF Viewer takes precedence
                if (activePdfUri != null) {
                    PdfViewerScreen(
                        uri = activePdfUri!!,
                        title = activePdfTitle,
                        themePreferences = themePreferences,
                        onClose = { activePdfUri = null }
                    )
                    return@Box
                }

                // Fullscreen Crop & Filter takes precedence when an image was captured
                if (capturedImageBytes != null) {
                    CropAndFilterScreen(
                        rawImageBytes = capturedImageBytes!!,
                        pageNumber = accumulatedPageFiles.size + 1,
                        onAddMore = { bmp ->
                            scope.launch(Dispatchers.IO) {
                                val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                                val tempFile = File(tempDir, "page_${System.currentTimeMillis()}_${accumulatedPageFiles.size}.jpg")
                                java.io.FileOutputStream(tempFile).use { out -> bmp.compress(Bitmap.CompressFormat.JPEG, 92, out) }
                                bmp.recycle()
                                accumulatedPageFiles.add(tempFile)
                            }
                            capturedImageBytes = null
                        },
                        onSavePdf = { bmp, title ->
                            capturedImageBytes = null
                            isExportingPdf = true
                            scope.launch(Dispatchers.IO) {
                                try {
                                    val tempDir = File(context.cacheDir, "scan_session").apply { if (!exists()) mkdirs() }
                                    val tempFile = File(tempDir, "page_${System.currentTimeMillis()}_${accumulatedPageFiles.size}.jpg")
                                    java.io.FileOutputStream(tempFile).use { out -> bmp.compress(Bitmap.CompressFormat.JPEG, 92, out) }
                                    bmp.recycle()
                                    accumulatedPageFiles.add(tempFile)

                                    val file = PdfExporter.exportImageFilesToPdf(context, accumulatedPageFiles.toList(), customTitle = title)
                                    val uri = Uri.fromFile(file)
                                    documentStore.addOrUpdateDocument(uri, file.nameWithoutExtension, isScanned = true)
                                    clearScanSession()
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
                    return@Box
                }

                // Fullscreen CamScanner (Hides bottom bar completely for maximum immersive camera preview)
                if (currentDestination == AppDestination.SCANNER) {
                    CameraScannerScreen(
                        pageCount = accumulatedPageFiles.size,
                        onImageCaptured = { bytes ->
                            capturedImageBytes = bytes
                        },
                        onFinishBatch = {
                            if (accumulatedPageFiles.isNotEmpty()) {
                                isExportingPdf = true
                                scope.launch(Dispatchers.IO) {
                                    try {
                                        val file = PdfExporter.exportImageFilesToPdf(context, accumulatedPageFiles.toList())
                                        val uri = Uri.fromFile(file)
                                        documentStore.addOrUpdateDocument(uri, file.nameWithoutExtension, isScanned = true)
                                        clearScanSession()
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
                            clearScanSession()
                            currentDestination = AppDestination.LIBRARY
                        }
                    )
                    return@Box
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
                                            clearScanSession()
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
                                            clearScanSession()
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
                                                clearScanSession()
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
                                            clearScanSession()
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
    }
