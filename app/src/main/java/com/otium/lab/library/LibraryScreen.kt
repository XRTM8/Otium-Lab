package com.otium.lab.library

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.widget.Toast
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
import com.otium.lab.library.components.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun LibraryScreen(
    documentStore: DocumentStore,
    onOpenPdf: (Uri, String) -> Unit,
    onNavigateToScanner: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isLandscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE

    var documents by remember { mutableStateOf<List<StoredDocument>>(emptyList()) }
    var searchQuery by remember { mutableStateOf("") }
    var documentToRename by remember { mutableStateOf<StoredDocument?>(null) }
    var documentToDelete by remember { mutableStateOf<StoredDocument?>(null) }
    var isInitialLoading by remember { mutableStateOf(true) }
    var selectedFilterIndex by remember { mutableIntStateOf(0) }
    var sortByName by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        documents = withContext(Dispatchers.IO) { documentStore.getDocuments() }
        isInitialLoading = false
    }

    val openPdfLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch(Dispatchers.IO) {
                try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
                val resolvedTitle = DocumentStore.resolveDisplayName(context, uri)
                documentStore.addOrUpdateDocument(uri, resolvedTitle, isScanned = false)
                val updated = documentStore.getDocuments()
                withContext(Dispatchers.Main) { documents = updated; onOpenPdf(uri, resolvedTitle) }
            }
        }
    }

    val mostRecent = documents.firstOrNull()
    val filtered = documents
        .filter { doc ->
            val matchesCategory = when (selectedFilterIndex) { 1 -> doc.isScanned; 2 -> !doc.isScanned; else -> true }
            val matchesSearch = if (searchQuery.isBlank()) true else doc.title.contains(searchQuery.trim(), ignoreCase = true)
            matchesCategory && matchesSearch
        }
        .let { list -> if (sortByName) list.sortedBy { it.title.lowercase() } else list }

    fun shareDoc(doc: StoredDocument) {
        try {
            val shareUri = if (doc.uri.scheme == "file") {
                val file = File(doc.uri.path ?: "")
                if (!file.exists()) {
                    Toast.makeText(context, "الملف غير موجود للمشاركة", Toast.LENGTH_SHORT).show()
                    return
                }
                FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            } else doc.uri
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, shareUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "مشاركة المستند"))
        } catch (_: Exception) {
            Toast.makeText(context, "تعذر مشاركة المستند", Toast.LENGTH_SHORT).show()
        }
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
            modifier = Modifier.fillMaxSize().padding(paddingValues).padding(horizontal = if (isLandscape) 32.dp else 20.dp),
            contentPadding = PaddingValues(top = 16.dp, bottom = if (isLandscape) 24.dp else 90.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                LibraryHeader(
                    documentCount = documents.size,
                    isLandscape = isLandscape,
                    onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) }
                )
            }
            if (documents.isNotEmpty()) {
                item { DocumentSearchBar(query = searchQuery, onQueryChange = { searchQuery = it }) }
            }
            if (mostRecent != null && selectedFilterIndex == 0 && searchQuery.isBlank()) {
                item { ContinueReadingHero(mostRecent = mostRecent, onOpenPdf = { doc -> onOpenPdf(doc.uri, doc.title) }) }
            }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Box(modifier = Modifier.weight(1f)) {
                        DocumentFilterChips(
                            selectedFilterIndex = selectedFilterIndex,
                            totalCount = documents.size,
                            onSelectFilter = { selectedFilterIndex = it }
                        )
                    }
                    if (documents.size > 1) {
                        FilterChip(
                            selected = sortByName,
                            onClick = { sortByName = !sortByName },
                            label = { Text(if (sortByName) "أبجدي" else "الأحدث", fontSize = 12.sp) }
                        )
                    }
                }
            }
            if (!isInitialLoading) {
                if (filtered.isEmpty()) {
                    item { EmptyLibraryState() }
                } else {
                    items(filtered, key = { it.uriString }) { doc ->
                        DocumentCard(
                            doc = doc,
                            onClick = { onOpenPdf(doc.uri, doc.title) },
                            onShare = { shareDoc(doc) },
                            onRename = { documentToRename = doc },
                            onExport = {
                                scope.launch(Dispatchers.IO) {
                                    val ok = documentStore.exportToDownloads(doc)
                                    withContext(Dispatchers.Main) {
                                        Toast.makeText(context, if (ok) "تم حفظ نسخة في التنزيلات" else "تعذر التصدير", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            onDelete = { documentToDelete = doc }
                        )
                    }
                }
            }
        }

        if (documentToRename != null) {
            DocumentRenameDialog(
                initialTitle = documentToRename!!.title,
                onConfirm = { newTitle ->
                    val doc = documentToRename!!
                    documentToRename = null
                    scope.launch(Dispatchers.IO) {
                        documentStore.renameDocument(doc, newTitle)
                        val updated = documentStore.getDocuments()
                        withContext(Dispatchers.Main) { documents = updated }
                    }
                },
                onDismiss = { documentToRename = null }
            )
        }

        if (documentToDelete != null) {
            DocumentDeleteDialog(
                documentTitle = documentToDelete!!.title,
                onConfirm = {
                    val doc = documentToDelete!!
                    documentToDelete = null
                    scope.launch(Dispatchers.IO) {
                        documentStore.deleteDocument(doc)
                        val updated = documentStore.getDocuments()
                        withContext(Dispatchers.Main) { documents = updated }
                    }
                },
                onDismiss = { documentToDelete = null }
            )
        }
    }
}
