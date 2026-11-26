package com.otium.lab.library

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.LibraryAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.otium.lab.library.components.*
import com.otium.lab.library.util.PdfMerger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun LibraryScreen(
    documentStore: DocumentStore,
    isLandscape: Boolean,
    onOpenSettings: () -> Unit,
    onOpenPdf: (Uri, String) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var documents by remember { mutableStateOf<List<StoredDocument>>(emptyList()) }
    var searchQuery by remember { mutableStateOf("") }
    var documentToRename by remember { mutableStateOf<StoredDocument?>(null) }
    var documentToDelete by remember { mutableStateOf<StoredDocument?>(null) }
    var isInitialLoading by remember { mutableStateOf(true) }
    var selectedFilterIndex by remember { mutableIntStateOf(0) }
    var sortByName by remember { mutableStateOf(false) }
    var selectedUris by remember { mutableStateOf<Set<String>>(emptySet()) }
    var isMerging by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        documents = withContext(Dispatchers.IO) { documentStore.getDocuments() }
        isInitialLoading = false
    }

    val openPdfLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch(Dispatchers.IO) {
                try {
                    context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: Exception) {}
                val resolvedTitle = DocumentStore.resolveDisplayName(context, uri)
                documentStore.addOrUpdateDocument(uri, resolvedTitle, isScanned = false)
                val updated = documentStore.getDocuments()
                withContext(Dispatchers.Main) {
                    documents = updated
                    onOpenPdf(uri, resolvedTitle)
                }
            }
        }
    }

    val mostRecent = documents.firstOrNull()
    val heroDoc = if (selectedFilterIndex == 0 && searchQuery.isBlank()) mostRecent else null

    val filtered = documents
        .filter { doc ->
            val matchesCategory = when (selectedFilterIndex) {
                1 -> doc.isScanned
                2 -> !doc.isScanned
                else -> true
            }
            val matchesSearch = if (searchQuery.isBlank()) true else {
                doc.title.contains(searchQuery.trim(), ignoreCase = true)
            }
            matchesCategory && matchesSearch
        }
        .let { list -> if (sortByName) list.sortedBy { it.title.lowercase() } else list }

    val listDocuments = if (heroDoc != null) {
        filtered.filterNot { it.uriString == heroDoc.uriString }
    } else {
        filtered
    }

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

    @Composable
    fun RenderDocumentCard(doc: StoredDocument) {
        val isSelected = doc.uriString in selectedUris
        DocumentCard(
            doc = doc,
            isSelected = isSelected,
            onClick = {
                if (selectedUris.isNotEmpty()) {
                    selectedUris = if (isSelected) selectedUris - doc.uriString else selectedUris + doc.uriString
                } else {
                    onOpenPdf(doc.uri, doc.title)
                }
            },
            onLongClick = {
                selectedUris = if (isSelected) selectedUris - doc.uriString else selectedUris + doc.uriString
            },
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

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            if (selectedUris.isNotEmpty()) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                    tonalElevation = 0.dp
                ) {
                    Column {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .statusBarsPadding()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            IconButton(onClick = { selectedUris = emptySet() }) {
                                Icon(Icons.Rounded.Close, contentDescription = "إلغاء التحديد")
                            }
                            Text(
                                text = "${selectedUris.size} محدد",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.weight(1f)
                            )
                            if (selectedUris.size >= 2) {
                                TextButton(
                                    enabled = !isMerging,
                                    onClick = {
                                        val targets = documents.filter { it.uriString in selectedUris }
                                        isMerging = true
                                        scope.launch {
                                            try {
                                                val merged = PdfMerger.mergePdfUris(context, targets.map { it.uri })
                                                val mergedUri = Uri.fromFile(merged)
                                                withContext(Dispatchers.IO) {
                                                    documentStore.addOrUpdateDocument(mergedUri, merged.nameWithoutExtension, isScanned = true)
                                                }
                                                val updated = withContext(Dispatchers.IO) { documentStore.getDocuments() }
                                                documents = updated
                                                selectedUris = emptySet()
                                                Toast.makeText(context, "تم دمج الملفات بنجاح", Toast.LENGTH_SHORT).show()
                                            } catch (t: Throwable) {
                                                Toast.makeText(context, "تعذر الدمج: ${t.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
                                            } finally {
                                                isMerging = false
                                            }
                                        }
                                    }
                                ) {
                                    Icon(Icons.Rounded.LibraryAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("دمج PDF", fontWeight = FontWeight.Bold)
                                }
                            }
                            IconButton(onClick = {
                                val targets = documents.filter { it.uriString in selectedUris }
                                selectedUris = emptySet()
                                scope.launch(Dispatchers.IO) {
                                    targets.forEach { documentStore.deleteDocument(it) }
                                    val updated = documentStore.getDocuments()
                                    withContext(Dispatchers.Main) { documents = updated }
                                }
                            }) {
                                Icon(Icons.Rounded.Delete, contentDescription = "حذف المحدد", tint = MaterialTheme.colorScheme.error)
                            }
                        }
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    ) { paddingValues ->
        if (isLandscape) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 24.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    LibraryHeader(
                        documentCount = documents.size,
                        isLandscape = true,
                        onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) },
                        onOpenSettings = onOpenSettings,
                        modifier = Modifier.weight(1f)
                    )
                    if (documents.isNotEmpty()) {
                        DocumentSearchBar(
                            query = searchQuery,
                            onQueryChange = { searchQuery = it },
                            modifier = Modifier.weight(0.9f)
                        )
                    }
                }

                if (!isInitialLoading) {
                    if (documents.isEmpty()) {
                        EmptyLibraryState(
                            isFilteredEmpty = false,
                            onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) }
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            if (heroDoc != null) {
                                Column(
                                    modifier = Modifier.weight(0.42f),
                                    verticalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    ContinueReadingHero(
                                        mostRecent = heroDoc,
                                        onOpenPdf = { doc -> onOpenPdf(doc.uri, doc.title) }
                                    )
                                }
                            }

                            Column(
                                modifier = Modifier.weight(if (heroDoc != null) 0.58f else 1f),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                DocumentFilterChips(
                                    selectedFilterIndex = selectedFilterIndex,
                                    totalCount = documents.size,
                                    sortByName = sortByName,
                                    showSortChip = documents.size > 1,
                                    onSelectFilter = { selectedFilterIndex = it },
                                    onToggleSort = { sortByName = !sortByName }
                                )

                                if (filtered.isEmpty()) {
                                    EmptyLibraryState(isFilteredEmpty = true)
                                } else {
                                    LazyColumn(
                                        modifier = Modifier.fillMaxSize(),
                                        contentPadding = PaddingValues(bottom = 16.dp),
                                        verticalArrangement = Arrangement.spacedBy(10.dp)
                                    ) {
                                        items(listDocuments, key = { it.uriString }) { doc ->
                                            RenderDocumentCard(doc)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 20.dp),
                contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item {
                    LibraryHeader(
                        documentCount = documents.size,
                        isLandscape = false,
                        onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) },
                        onOpenSettings = onOpenSettings
                    )
                }

                if (documents.isNotEmpty()) {
                    item {
                        DocumentSearchBar(
                            query = searchQuery,
                            onQueryChange = { searchQuery = it }
                        )
                    }
                }

                if (heroDoc != null) {
                    item {
                        ContinueReadingHero(
                            mostRecent = heroDoc,
                            onOpenPdf = { doc -> onOpenPdf(doc.uri, doc.title) }
                        )
                    }
                }

                if (documents.isNotEmpty()) {
                    item {
                        DocumentFilterChips(
                            selectedFilterIndex = selectedFilterIndex,
                            totalCount = documents.size,
                            sortByName = sortByName,
                            showSortChip = documents.size > 1,
                            onSelectFilter = { selectedFilterIndex = it },
                            onToggleSort = { sortByName = !sortByName }
                        )
                    }
                }

                if (!isInitialLoading) {
                    if (documents.isEmpty()) {
                        item {
                            EmptyLibraryState(
                                isFilteredEmpty = false,
                                onOpenPdfPicker = { openPdfLauncher.launch(arrayOf("application/pdf")) }
                            )
                        }
                    } else if (filtered.isEmpty()) {
                        item {
                            EmptyLibraryState(isFilteredEmpty = true)
                        }
                    } else if (listDocuments.isNotEmpty()) {
                        if (heroDoc != null) {
                            item {
                                Text(
                                    text = "مستندات أخرى (${listDocuments.size})",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 2.dp)
                                )
                            }
                        }
                        items(listDocuments, key = { it.uriString }) { doc ->
                            RenderDocumentCard(doc)
                        }
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
