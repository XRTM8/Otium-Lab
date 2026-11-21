package com.otium.lab.ui

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
                currentTheme = currentTheme,
                onClose = { activePdfUri = null }
            )
            return@MaterialTheme
        }

        // Fullscreen Crop & Filter takes precedence when an image was captured
        if (capturedImageBytes != null) {
            CropAndFilterScreen(
                rawImageBytes = capturedImageBytes!!,
                onPageConfirmed = { bitmap ->
                    accumulatedPages.add(bitmap)
                    capturedImageBytes = null
                },
                onCancel = {
                    capturedImageBytes = null
                }
            )
            return@MaterialTheme
        }

        // Fullscreen CamScanner (Hides bottom bar completely for maximum immersive camera preview)
        if (currentDestination == AppDestination.SCANNER) {
            if (accumulatedPages.isNotEmpty()) {
                ScannedPagesReview(
                    pages = accumulatedPages,
                    isExporting = isExportingPdf,
                    onAddMore = {
                        // Will show camera again to add pages
                    },
                    onExportPdf = {
                        isExportingPdf = true
                        scope.launch {
                            try {
                                val file = PdfExporter.exportBitmapsToPdf(context, accumulatedPages)
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
                        accumulatedPages.clear()
                        currentDestination = AppDestination.LIBRARY
                    }
                )
            } else {
                CameraScannerScreen(
                    pageCount = accumulatedPages.size,
                    onImageCaptured = { bytes ->
                        capturedImageBytes = bytes
                    },
                    onFinishBatch = {
                        // Export accumulated batch
                    },
                    onClose = {
                        currentDestination = AppDestination.LIBRARY
                    }
                )
            }
            return@MaterialTheme
        }

        // Standard App Shell with 2 primary tabs: Library and Settings
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 2.dp
                ) {
                    AppDestination.entries.forEach { dest ->
                        val isSelected = currentDestination == dest
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = { currentDestination = dest },
                            icon = { Icon(dest.icon, contentDescription = dest.labelAr) },
                            label = { Text(dest.labelAr, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer
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
                    .background(MaterialTheme.colorScheme.background)
            ) {
                when (currentDestination) {
                    AppDestination.LIBRARY -> LibraryScreen(
                        documentStore = documentStore,
                        onOpenPdf = { uri, title ->
                            activePdfUri = uri
                            activePdfTitle = title
                        },
                        onNavigateToScanner = {
                            currentDestination = AppDestination.SCANNER
                        }
                    )

                    AppDestination.SETTINGS -> SettingsScreen(
                        themePreferences = themePreferences
                    )

                    AppDestination.SCANNER -> {
                        // Handled above in immersive mode
                    }
                }
            }
        }
    }
}

@Composable
fun ScannedPagesReview(
    pages: List<Bitmap>,
    isExporting: Boolean,
    onAddMore: () -> Unit,
    onExportPdf: () -> Unit,
    onCancel: () -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.background,
        modifier = Modifier.fillMaxSize()
    ) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(24.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(44.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "تم مسح ${pages.size} صفحة بنجاح",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "الصفحات جاهزة للتصدير كملف PDF معياري عالي الوضوح A4",
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(36.dp))

            Button(
                onClick = onExportPdf,
                enabled = !isExporting,
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                if (isExporting) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                } else {
                    Icon(Icons.Rounded.PictureAsPdf, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("تصدير الآن كملف PDF", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = onCancel,
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().height(48.dp)
            ) {
                Text("إلغاء وبدء من جديد", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
