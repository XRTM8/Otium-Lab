package com.otium.lab.ui

import android.app.Activity
import android.content.res.Configuration
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import com.otium.lab.scanner.ScanSessionState
import com.otium.lab.scanner.ScanReviewScreen
import com.otium.lab.ui.components.AppDestination
import com.otium.lab.ui.components.AppNavigationShell
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun OtiumApp(
    initialPdfUri: Uri? = null,
    initialPdfTitle: String? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val documentStore = remember { DocumentStore(context) }
    val themePreferences = remember { ThemePreferences(context) }
    val scanSession = remember { ScanSessionState(context, scope, documentStore) }
    var currentDestination by remember { mutableStateOf(AppDestination.LIBRARY) }
    var activePdfUri by remember { mutableStateOf(initialPdfUri) }
    var activePdfTitle by remember { mutableStateOf(initialPdfTitle ?: "") }
    var lastBackPressedTime by remember { mutableLongStateOf(0L) }
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
    BackHandler(enabled = activePdfUri == null && scanSession.capturedImageBytes != null) {
        if (!scanSession.isStagingPage) scanSession.capturedImageBytes = null
    }
    BackHandler(enabled = activePdfUri == null && scanSession.isReviewingBatch) {
        scanSession.closeReview()
    }
    BackHandler(enabled = activePdfUri == null && scanSession.capturedImageBytes == null &&
        !scanSession.isReviewingBatch && currentDestination == AppDestination.SCANNER) {
        scanSession.clearSession()
        currentDestination = AppDestination.LIBRARY
    }
    BackHandler(enabled = activePdfUri == null && scanSession.capturedImageBytes == null && currentDestination == AppDestination.SETTINGS) {
        currentDestination = AppDestination.LIBRARY
    }
    BackHandler(enabled = activePdfUri == null && scanSession.capturedImageBytes == null && currentDestination == AppDestination.LIBRARY) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressedTime < 2000L) (context as? Activity)?.finish()
        else {
            lastBackPressedTime = now
            Toast.makeText(context, "اضغط مرة أخرى للخروج من التطبيق", Toast.LENGTH_SHORT).show()
        }
    }

    MaterialTheme(colorScheme = themePreferences.getColorScheme()) {
        Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            when {
                activePdfUri != null -> PdfViewerScreen(
                    uri = activePdfUri!!,
                    title = activePdfTitle,
                    themePreferences = themePreferences,
                    onClose = { activePdfUri = null }
                )
                scanSession.capturedImageBytes != null -> CropAndFilterScreen(
                    rawImageBytes = scanSession.capturedImageBytes!!,
                    pageNumber = scanSession.accumulatedPageFiles.size + 1,
                    onAddMore = { bmp -> scanSession.addPageAndContinue(bmp) },
                    onSavePdf = { bmp, title ->
                        scanSession.saveWithLastPage(bmp, title) { uri, savedTitle ->
                            activePdfUri = uri
                            activePdfTitle = savedTitle
                            currentDestination = AppDestination.LIBRARY
                        }
                    },
                    onCancel = { if (!scanSession.isStagingPage) scanSession.capturedImageBytes = null }
                )
                scanSession.isReviewingBatch -> ScanReviewScreen(
                    pages = scanSession.accumulatedPageFiles.toList(),
                    isBusy = scanSession.isStagingPage || scanSession.isExportingPdf,
                    onBack = { scanSession.closeReview() },
                    onMove = scanSession::movePage,
                    onRotate = scanSession::rotatePage,
                    onDelete = scanSession::removePage,
                    onApplyFilterAll = scanSession::applyFilterToAllPages,
                    onSave = { title ->
                        scanSession.saveBatch(title) { uri, savedTitle ->
                            activePdfUri = uri
                            activePdfTitle = savedTitle
                            currentDestination = AppDestination.LIBRARY
                        }
                    }
                )
                currentDestination == AppDestination.SCANNER -> CameraScannerScreen(
                    pageCount = scanSession.accumulatedPageFiles.size,
                    onImageCaptured = { bytes -> scanSession.capturedImageBytes = bytes },
                    onQuickBatchCapture = { bytes -> scanSession.quickProcessAndStagePage(bytes) },
                    onFinishBatch = { scanSession.reviewBatch() },
                    onClose = {
                        scanSession.clearSession()
                        currentDestination = AppDestination.LIBRARY
                    }
                )
                else -> {
                    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
                    AppNavigationShell(
                        currentDestination = currentDestination,
                        isLandscape = isLandscape,
                        onSelectDestination = { destination ->
                            if (destination == AppDestination.SCANNER) scanSession.clearSession()
                            currentDestination = destination
                        }
                    ) {
                        when (currentDestination) {
                            AppDestination.LIBRARY -> LibraryScreen(
                                documentStore = documentStore,
                                onOpenPdf = { uri, title -> activePdfUri = uri; activePdfTitle = title },
                                onNavigateToScanner = {
                                    scanSession.clearSession()
                                    currentDestination = AppDestination.SCANNER
                                }
                            )
                            AppDestination.SETTINGS -> SettingsScreen(
                                themePreferences = themePreferences,
                                documentStore = documentStore
                            )
                            AppDestination.SCANNER -> Unit
                        }
                    }
                }
            }

            if (scanSession.isExportingPdf || scanSession.isStagingPage) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.65f))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {}
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface) {
                        Column(
                            modifier = Modifier.padding(horizontal = 28.dp, vertical = 22.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.height(14.dp))
                            Text(
                                if (scanSession.isExportingPdf) "جارٍ إنشاء ملف PDF..." else "جارٍ حفظ الصفحة...",
                                fontWeight = FontWeight.Bold, fontSize = 14.sp
                            )
                        }
                    }
                }
            }
        }
    }
}
