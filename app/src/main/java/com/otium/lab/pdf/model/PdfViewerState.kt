package com.otium.lab.pdf.model

import android.content.Context
import android.net.Uri
import android.view.WindowManager
import android.widget.Toast
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.*
import androidx.compose.ui.unit.IntSize
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.otium.lab.core.extensions.findActivity
import com.otium.lab.library.DocumentStore
import com.otium.lab.pdf.NativePdfRenderer
import com.otium.lab.pdf.store.AnnotationStore
import com.otium.lab.pdf.text.PdfOutlineExtractor
import com.otium.lab.pdf.text.PdfSearchEngine
import com.otium.lab.pdf.text.PdfTextExtractor
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Stable
class PdfViewerState(
    val uri: Uri,
    val title: String,
    val context: Context,
    val renderer: NativePdfRenderer,
    val documentStore: DocumentStore,
    val annotationStore: AnnotationStore,
    val textExtractor: PdfTextExtractor,
    val listState: LazyListState,
    val pagerState: PagerState
) {
    var isLoaded by mutableStateOf(false)
    var errorMessage by mutableStateOf<String?>(null)
    var showControls by mutableStateOf(true)
    var showJumpDialog by mutableStateOf(false)
    var isSelectionModeActive by mutableStateOf(false)

    var savedPage by mutableIntStateOf(1)
    var savedOffset by mutableIntStateOf(0)
    var allHighlights by mutableStateOf<List<PdfHighlight>>(emptyList())

    var selectedSpans by mutableStateOf<List<PdfTextSpan>>(emptyList())
    var selectedHighlight by mutableStateOf<PdfHighlight?>(null)
    var selectedPage by mutableIntStateOf(0)

    var hasRestoredPosition by mutableStateOf(false)
    var showResumePill by mutableStateOf(false)
    var readingLayout by mutableStateOf(ReadingLayout.VERTICAL)
    var pageColorMode by mutableStateOf(PageColorMode.ORIGINAL)

    var viewportSize by mutableStateOf(IntSize.Zero)
    var targetScale by mutableFloatStateOf(1f)
    var offsetX by mutableFloatStateOf(0f)
    var offsetY by mutableFloatStateOf(0f)

    var isDraggingSlider by mutableStateOf(false)
    var sliderValue by mutableFloatStateOf(1f)

    var showSearch by mutableStateOf(false)
    var showTocDialog by mutableStateOf(false)
    var showDisplaySheet by mutableStateOf(false)
    var searchQuery by mutableStateOf("")
    var searchMatches by mutableStateOf<List<PdfSearchMatch>>(emptyList())
    var currentMatchIndex by mutableIntStateOf(0)
    var isSearching by mutableStateOf(false)
    var searchJob: Job? = null
    var outline by mutableStateOf<List<PdfOutlineItem>>(emptyList())

    fun clearSelection() {
        selectedSpans = emptyList()
        selectedHighlight = null
    }

    fun handleBack(onClose: () -> Unit) {
        if (showDisplaySheet) {
            showDisplaySheet = false
        } else if (showSearch) {
            closeSearch()
        } else if (showTocDialog) {
            showTocDialog = false
        } else if (selectedSpans.isNotEmpty() || selectedHighlight != null) {
            clearSelection()
        } else if (isSelectionModeActive) {
            isSelectionModeActive = false
        } else {
            onClose()
        }
    }

    fun closeSearch() {
        searchJob?.cancel()
        showSearch = false
        searchQuery = ""
        searchMatches = emptyList()
        isSearching = false
    }

    fun updateSearchQuery(scope: CoroutineScope, query: String, onScrollToPage: (Int) -> Unit) {
        searchQuery = query
        searchJob?.cancel()
        if (query.isBlank()) {
            searchMatches = emptyList()
            isSearching = false
            return
        }
        searchJob = scope.launch {
            delay(250)
            isSearching = true
            var scrolledToFirst = false
            val res = PdfSearchEngine.search(
                extractor = textExtractor,
                uri = uri,
                pageCount = renderer.pageCount,
                query = query,
                onProgress = { partial ->
                    searchMatches = partial
                    if (!scrolledToFirst && partial.isNotEmpty()) {
                        scrolledToFirst = true
                        currentMatchIndex = 0
                        onScrollToPage(partial[0].pageIndex)
                    }
                }
            )
            searchMatches = res
            currentMatchIndex = 0
            isSearching = false
            if (!scrolledToFirst && res.isNotEmpty()) onScrollToPage(res[0].pageIndex)
        }
    }

    fun applyHighlight(scope: CoroutineScope, colorArgb: Long) {
        val existing = selectedHighlight
        val spans = selectedSpans
        val targetPage = selectedPage
        clearSelection()
        isSelectionModeActive = false
        scope.launch {
            val toSave = existing?.copy(colorArgb = colorArgb) ?: if (spans.isNotEmpty()) {
                PdfHighlight(
                    pageIndex = targetPage,
                    text = spans.joinToString(" ") { it.text },
                    colorArgb = colorArgb,
                    bounds = spans.map { NormalizedRect(it.normLeft, it.normTop, it.normRight, it.normBottom) }
                )
            } else null
            if (toSave != null) {
                allHighlights = withContext(Dispatchers.IO) {
                    annotationStore.saveHighlight(uri, toSave)
                    annotationStore.getAllHighlights(uri)
                }
                if (existing == null) Toast.makeText(context, "تم حفظ التظليل", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun deleteHighlight(scope: CoroutineScope, target: PdfHighlight?) {
        selectedHighlight = null
        isSelectionModeActive = false
        if (target == null) return
        scope.launch {
            allHighlights = withContext(Dispatchers.IO) {
                annotationStore.deleteHighlight(uri, target.id)
                annotationStore.getAllHighlights(uri)
            }
            Toast.makeText(context, "تم حذف التظليل", Toast.LENGTH_SHORT).show()
        }
    }
}

@Composable
fun rememberPdfViewerState(
    uri: Uri,
    title: String,
    themePreferences: ThemePreferences
): PdfViewerState {
    val context = androidx.compose.ui.platform.LocalContext.current
    val renderer = remember(uri) { NativePdfRenderer(context) }
    val documentStore = remember { DocumentStore(context) }
    val annotationStore = remember { AnnotationStore(context) }
    val textExtractor = remember(uri) { PdfTextExtractor(context) }

    val listState = rememberLazyListState()
    val pagerState = rememberPagerState(initialPage = 0, pageCount = { renderer.pageCount.coerceAtLeast(1) })

    val state = remember(uri) {
        PdfViewerState(
            uri = uri, title = title, context = context, renderer = renderer,
            documentStore = documentStore, annotationStore = annotationStore,
            textExtractor = textExtractor, listState = listState, pagerState = pagerState
        ).apply {
            readingLayout = if (themePreferences.defaultHorizontalLayout.value) ReadingLayout.HORIZONTAL else ReadingLayout.VERTICAL
            val currentTheme = themePreferences.currentTheme.value
            pageColorMode = when (currentTheme) {
                AppThemeMode.AMOLED -> PageColorMode.AMOLED_BLACK
                AppThemeMode.CREAM -> PageColorMode.SEPIA
                else -> PageColorMode.ORIGINAL
            }
        }
    }

    // Keep screen awake & Immersive mode
    val keepScreenOn by themePreferences.keepScreenOn
    DisposableEffect(keepScreenOn) {
        val window = context.findActivity()?.window
        if (keepScreenOn) window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    DisposableEffect(Unit) {
        val window = context.findActivity()?.window
        val insets = window?.let { WindowInsetsControllerCompat(it, it.decorView) }
        insets?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insets?.hide(WindowInsetsCompat.Type.systemBars())
        onDispose { insets?.show(WindowInsetsCompat.Type.systemBars()) }
    }
    LaunchedEffect(uri) {
        try {
            val (lastPage, lastOffset, highlights) = withContext(Dispatchers.IO) {
                renderer.open(uri, title)
                Triple(
                    documentStore.getLastPage(uri),
                    documentStore.getLastScrollOffset(uri),
                    annotationStore.getAllHighlights(uri)
                )
            }
            state.savedPage = lastPage
            state.savedOffset = lastOffset
            state.allHighlights = highlights
            state.hasRestoredPosition = lastPage <= 1
            state.showResumePill = lastPage > 1
            state.isLoaded = true
        } catch (e: Exception) {
            state.errorMessage = if (e is SecurityException || e.message?.contains("password", ignoreCase = true) == true) {
                "هذا المستند محمي بكلمة مرور، يرجى إزالة الحماية لفتحه."
            } else {
                e.localizedMessage ?: "تعذر قراءة ملف الـ PDF"
            }
        }
    }
    DisposableEffect(uri) {
        onDispose {
            state.searchJob?.cancel()
            renderer.close()
            textExtractor.clearCache()
        }
    }

    LaunchedEffect(uri, state.isLoaded) {
        if (state.isLoaded) {
            state.outline = PdfOutlineExtractor.extractOutline(textExtractor, uri)
        }
    }

    return state
}
