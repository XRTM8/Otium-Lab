package com.otium.lab.library

import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.otium.lab.library.components.ContinueReadingHero
import com.otium.lab.library.components.DocumentCard
import com.otium.lab.library.components.DocumentFilterChips
import com.otium.lab.library.components.EmptyLibraryState
import com.otium.lab.library.components.LibraryHeader
import java.io.File

@Composable
fun LibraryScreen(
    documentStore: DocumentStore,
    onOpenPdf: (Uri, String) -> Unit,
    onNavigateToScanner: () -> Unit
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val isLandscape = configuration.orientation == Configuration.ORIENTATION_LANDSCAPE

    var documents by remember { mutableStateOf(documentStore.getDocuments()) }
    var selectedFilterIndex by remember { mutableIntStateOf(0) }

    val openPdfLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            } catch (_: Exception) {}

            val resolvedTitle = DocumentStore.resolveDisplayName(context, uri)
            documentStore.addOrUpdateDocument(uri, resolvedTitle, isScanned = false)
            documents = documentStore.getDocuments()
            onOpenPdf(uri, resolvedTitle)
        }
    }

    val mostRecent = documents.firstOrNull()

    val filtered = when (selectedFilterIndex) {
        1 -> documents.filter { it.isScanned }
        2 -> documents.filter { !it.isScanned }
        else -> documents
    }

    Scaffold(
        floatingActionButton = {
            if (!isLandscape) {
                ExtendedFloatingActionButton(
                    onClick = { openPdfLauncher.launch(arrayOf("application/pdf")) },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    shape = RoundedCornerShape(16.dp),
                    icon = { Icon(Icons.Rounded.Add, contentDescription = null) },
                    text = { Text("فتح ملف PDF", fontWeight = FontWeight.Bold, fontSize = 13.sp) },
                    modifier = Modifier.height(48.dp)
                )
            }
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = if (isLandscape) 32.dp else 20.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = if (isLandscape) 24.dp else 90.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Library Header
            item {
                LibraryHeader(
                    documentCount = documents.size,
                    isLandscape = isLandscape,
                    onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) }
                )
            }

            // 2. Continue Reading Hero Card
            if (mostRecent != null) {
                item {
                    ContinueReadingHero(
                        mostRecent = mostRecent,
                        onOpenPdf = { doc -> onOpenPdf(doc.uri, doc.title) }
                    )
                }
            }

            // 3. Filter Chips
            item {
                DocumentFilterChips(
                    selectedFilterIndex = selectedFilterIndex,
                    totalCount = documents.size,
                    onSelectFilter = { selectedFilterIndex = it }
                )
            }

            // 4. Documents List or Empty State
            if (filtered.isEmpty()) {
                item {
                    EmptyLibraryState()
                }
            } else {
                items(filtered, key = { it.uriString }) { doc ->
                    DocumentCard(
                        doc = doc,
                        onClick = { onOpenPdf(doc.uri, doc.title) },
                        onShare = {
                            try {
                                val shareUri = if (doc.uri.scheme == "file") {
                                    val f = File(doc.uri.path ?: "")
                                    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)
                                } else doc.uri

                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "application/pdf"
                                    putExtra(Intent.EXTRA_STREAM, shareUri)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(intent, "مشاركة المستند"))
                            } catch (_: Exception) {}
                        },
                        onDelete = {
                            documentStore.deleteDocument(doc)
                            documents = documentStore.getDocuments()
                        }
                    )
                }
            }
        }
    }
}
