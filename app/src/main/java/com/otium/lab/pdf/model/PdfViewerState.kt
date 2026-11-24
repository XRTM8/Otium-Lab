package com.otium.lab.pdf.model

import android.content.Context
import android.net.Uri
import android.view.WindowManager
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.*
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.otium.lab.core.extensions.findActivity
import com.otium.lab.library.DocumentStore
import com.otium.lab.pdf.NativePdfRenderer
import com.otium.lab.pdf.store.AnnotationStore
import com.otium.lab.pdf.text.PdfTextExtractor
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences

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
    val pagerState: PagerState,
    val savedPage: Int,
    val savedOffset: Int
) {
    var isLoaded by mutableStateOf(false)
    var errorMessage by mutableStateOf<String?>(null)
    var showControls by mutableStateOf(true)
    var showJumpDialog by mutableStateOf(false)
    var isSelectionModeActive by mutableStateOf(false)

    var selectedSpans by mutableStateOf<List<PdfTextSpan>>(emptyList())
    var selectedHighlight by mutableStateOf<PdfHighlight?>(null)
    var selectedPage by mutableIntStateOf(0)
    var refreshHighlightTrigger by mutableIntStateOf(0)

    var hasRestoredPosition by mutableStateOf(savedPage <= 1)
    var showResumePill by mutableStateOf(savedPage > 1)
    var readingLayout by mutableStateOf(ReadingLayout.VERTICAL)
    var pageColorMode by mutableStateOf(PageColorMode.ORIGINAL)

    var targetScale by mutableFloatStateOf(1f)
    var offsetX by mutableFloatStateOf(0f)
    var offsetY by mutableFloatStateOf(0f)

    var isDraggingSlider by mutableStateOf(false)
    var sliderValue by mutableFloatStateOf(1f)

    var showSearch by mutableStateOf(false)
    var showTocDialog by mutableStateOf(false)
    var searchQuery by mutableStateOf("")
    var searchMatches by mutableStateOf<List<PdfSearchMatch>>(emptyList())
    var currentMatchIndex by mutableIntStateOf(0)
    var isSearching by mutableStateOf(false)
    var outline by mutableStateOf<List<PdfOutlineItem>>(emptyList())

    fun clearSelection() {
        selectedSpans = emptyList()
        selectedHighlight = null
    }

    fun handleBack(onClose: () -> Unit) {
        if (showSearch) {
            showSearch = false
            searchQuery = ""
            searchMatches = emptyList()
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
}

@Composable
fun rememberPdfViewerState(
    uri: Uri,
    title: String,
    themePreferences: ThemePreferences
): PdfViewerState {
    val context = androidx.compose.ui.platform.LocalContext.current
    val renderer = remember { NativePdfRenderer(context) }
    val documentStore = remember { DocumentStore(context) }
    val annotationStore = remember { AnnotationStore(context) }
    val textExtractor = remember { PdfTextExtractor(context) }

    val savedPage = remember(uri) { documentStore.getLastPage(uri) }
    val savedOffset = remember(uri) { documentStore.getLastScrollOffset(uri) }
    val initialIndex = (savedPage - 1).coerceAtLeast(0)

    val listState = rememberLazyListState(initialFirstVisibleItemIndex = initialIndex, initialFirstVisibleItemScrollOffset = savedOffset)
    val pagerState = rememberPagerState(initialPage = initialIndex, pageCount = { renderer.pageCount.coerceAtLeast(1) })

    val state = remember(uri) {
        PdfViewerState(
            uri = uri, title = title, context = context, renderer = renderer,
            documentStore = documentStore, annotationStore = annotationStore,
            textExtractor = textExtractor, listState = listState, pagerState = pagerState,
            savedPage = savedPage, savedOffset = savedOffset
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
    DisposableEffect(uri) {
        try {
            renderer.open(uri, title)
            state.isLoaded = true
        } catch (e: Exception) {
            state.errorMessage = if (e is SecurityException || e.message?.contains("password", ignoreCase = true) == true) {
                "هذا المستند محمي بكلمة مرور، يرجى إزالة الحماية لفتحه."
            } else {
                e.localizedMessage ?: "تعذر قراءة ملف الـ PDF"
            }
        }
        onDispose { renderer.close(); textExtractor.clearCache() }
    }

    LaunchedEffect(uri, state.isLoaded) {
        if (state.isLoaded) {
            state.outline = com.otium.lab.pdf.text.PdfOutlineExtractor.extractOutline(textExtractor, uri)
        }
    }

    return state
}
