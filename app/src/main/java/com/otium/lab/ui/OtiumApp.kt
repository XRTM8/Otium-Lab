package com.otium.lab.ui

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import com.otium.lab.library.StoredDocument
import com.otium.lab.pdf.PdfViewerScreen
import com.otium.lab.scanner.CameraScannerScreen
import com.otium.lab.scanner.CropAndFilterScreen
import com.otium.lab.scanner.PdfExporter
import com.otium.lab.ui.components.UpdateBanner
import kotlinx.coroutines.launch

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    HOME("الرئيسية", Icons.Rounded.Book),
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
    SCANNER("الماسح", Icons.Rounded.CameraAlt),
    SETTINGS("الإعدادات", Icons.Rounded.Settings)
}

@Composable
fun OtiumApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val documentStore = remember { DocumentStore(context) }

    var currentDestination by remember { mutableStateOf(AppDestination.HOME) }

    // Active Reader State
    var activePdfUri by remember { mutableStateOf<Uri?>(null) }
    var activePdfTitle by remember { mutableStateOf("") }

    // CamScanner Active State
    var capturedImageBytes by remember { mutableStateOf<ByteArray?>(null) }
    val accumulatedPages = remember { mutableStateListOf<Bitmap>() }
    var isExportingPdf by remember { mutableStateOf(false) }

    // Fullscreen PDF Viewer takes precedence
    if (activePdfUri != null) {
        PdfViewerScreen(
            uri = activePdfUri!!,
            title = activePdfTitle,
            onClose = { activePdfUri = null }
        )
        return
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
        return
    }

    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFFC29B38),
            background = Color(0xFFF9F7F4),
            surface = Color(0xFFFFFFFF),
            onBackground = Color(0xFF1E2124),
            onSurface = Color(0xFF1E2124),
        )
    ) {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                    tonalElevation = 0.dp
                ) {
                    AppDestination.entries.forEach { dest ->
                        NavigationBarItem(
                            selected = currentDestination == dest,
                            onClick = { currentDestination = dest },
                            icon = { Icon(dest.icon, contentDescription = dest.labelAr) },
                            label = { Text(dest.labelAr, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Color(0xFFC29B38),
                                selectedTextColor = Color(0xFFC29B38),
                                indicatorColor = Color(0xFFC29B38).copy(alpha = 0.12f)
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
                    AppDestination.HOME -> HomeScreen(
                        documentStore = documentStore,
                        onOpenPdf = { uri, title ->
                            activePdfUri = uri
                            activePdfTitle = title
                        },
                        onNavigateToScanner = { currentDestination = AppDestination.SCANNER }
                    )

                    AppDestination.LIBRARY -> LibraryScreen(
                        documentStore = documentStore,
                        onOpenPdf = { uri, title ->
                            activePdfUri = uri
                            activePdfTitle = title
                        }
                    )

                    AppDestination.SCANNER -> {
                        if (accumulatedPages.isNotEmpty()) {
                            // Review Accumulated Scanned Pages & Export
                            ScannedPagesReview(
                                pages = accumulatedPages,
                                isExporting = isExportingPdf,
                                onAddPage = {
                                    // Continues to camera
                                },
                                onExportPdf = {
                                    isExportingPdf = true
                                    scope.launch {
                                        try {
                                            val file = PdfExporter.exportBitmapsToPdf(context, accumulatedPages)
                                            val uri = Uri.fromFile(file)
                                            documentStore.addRecentDocument(uri, file.nameWithoutExtension, isScanned = true)
                                            accumulatedPages.clear()
                                            activePdfUri = uri
                                            activePdfTitle = file.nameWithoutExtension
                                        } catch (_: Exception) {
                                        } finally {
                                            isExportingPdf = false
                                        }
                                    }
                                },
                                onClear = { accumulatedPages.clear() }
                            )
                        } else {
                            CameraScannerScreen(
                                onImageCaptured = { bytes ->
                                    capturedImageBytes = bytes
                                },
                                onClose = {
                                    currentDestination = AppDestination.HOME
                                }
                            )
                        }
                    }

                    AppDestination.SETTINGS -> SettingsScreen()
                }
            }
        }
    }
}

@Composable
fun HomeScreen(
    documentStore: DocumentStore,
    onOpenPdf: (Uri, String) -> Unit,
    onNavigateToScanner: () -> Unit
) {
    val context = LocalContext.current
    var recentDocs by remember { mutableStateOf(documentStore.getDocuments()) }

    val openPdfLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            val name = uri.lastPathSegment?.substringAfterLast('/') ?: "مستند بدون عنوان"
            documentStore.addRecentDocument(uri, name, isScanned = false)
            recentDocs = documentStore.getDocuments()
            onOpenPdf(uri, name)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        contentPadding = PaddingValues(top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            UpdateBanner()
        }

        item {
            // Main Action Cards
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Open PDF Card
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 1.dp,
                    modifier = Modifier
                        .weight(1f)
                        .height(130.dp)
                        .clickable { openPdfLauncher.launch(arrayOf("application/pdf")) }
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(Color(0xFF3B82F6).copy(alpha = 0.15f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.FolderOpen, contentDescription = null, tint = Color(0xFF3B82F6))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("فتح مستند PDF", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("تصفح كتبك ومستنداتك", fontSize = 11.sp, color = Color.Gray)
                    }
                }

                // CamScanner Card
                Surface(
                    shape = RoundedCornerShape(20.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 1.dp,
                    modifier = Modifier
                        .weight(1f)
                        .height(130.dp)
                        .clickable { onNavigateToScanner() }
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(Color(0xFFC29B38).copy(alpha = 0.15f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.CameraAlt, contentDescription = null, tint = Color(0xFFC29B38))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("كام سكانر", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text("مسح فائق الدقة وتصدير PDF", fontSize = 11.sp, color = Color.Gray)
                    }
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("المستندات الأخيرة", fontSize = 17.sp, fontWeight = FontWeight.Bold)
            }
        }

        if (recentDocs.isEmpty()) {
            item {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Rounded.AutoStories, contentDescription = null, tint = Color.LightGray, modifier = Modifier.size(40.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("ابدأ بفتح كتاب أو مسح مستند جديد", color = Color.Gray, fontSize = 13.sp)
                    }
                }
            }
        } else {
            items(recentDocs.take(5)) { doc ->
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth().clickable { onOpenPdf(doc.uri, doc.title) }
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .background(
                                    if (doc.isScanned) Color(0xFFC29B38).copy(alpha = 0.12f) else Color(0xFF3B82F6).copy(alpha = 0.12f),
                                    RoundedCornerShape(10.dp)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (doc.isScanned) Icons.Rounded.CameraAlt else Icons.Rounded.PictureAsPdf,
                                contentDescription = null,
                                tint = if (doc.isScanned) Color(0xFFC29B38) else Color(0xFF3B82F6),
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(doc.title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
                            Text(if (doc.isScanned) "مستند ممسوح" else "ملف PDF", fontSize = 11.sp, color = Color.Gray)
                        }

                        Icon(Icons.Rounded.ChevronLeft, contentDescription = null, tint = Color.Gray)
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
    onAddPage: () -> Unit,
    onExportPdf: () -> Unit,
    onClear: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = Color(0xFFC29B38), modifier = Modifier.size(64.dp))
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "تم مسح ${pages.size} صفحة بنجاح",
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "جاهز للتصدير كملف PDF سيادي عالي الجودة ومطبوع رقمياً",
            fontSize = 13.sp,
            color = Color.Gray
        )
        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = onExportPdf,
            enabled = !isExporting,
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC29B38)),
            modifier = Modifier.fillMaxWidth().height(52.dp)
        ) {
            if (isExporting) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
            } else {
                Icon(Icons.Rounded.PictureAsPdf, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("تصدير الآن كملف PDF", fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onClear,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("إلغاء وبدء مسح جديد", color = Color.Gray)
        }
    }
}

@Composable
fun SettingsScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
    ) {
        Text("الإعدادات والتحديثات", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(16.dp))
        UpdateBanner()

        Spacer(modifier = Modifier.height(24.dp))

        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(18.dp)) {
                Text("عن التطبيق", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Spacer(modifier = Modifier.height(6.dp))
                Text("Otium Sovereign Mobile — القارئ الهادئ والماسح الضوئي الأصيل", fontSize = 12.sp, color = Color.Gray)
                Text("مبني بـ Kotlin و Jetpack Compose مع محرك صور ومعالجة بـ Rust", fontSize = 12.sp, color = Color.Gray)
                Spacer(modifier = Modifier.height(12.dp))
                Text("المعمارية: ARM64 v8 + Universal", fontSize = 12.sp, color = Color(0xFFC29B38), fontWeight = FontWeight.Medium)
                Text("الخصوصية: 100% بدون اتصال خارجي أو خوادم وسيطة", fontSize = 12.sp, color = Color(0xFF10B981), fontWeight = FontWeight.Medium)
            }
        }
    }
}
