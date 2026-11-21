package com.otium.lab.pdf

import android.net.Uri
import android.view.WindowManager
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.otium.lab.core.extensions.findActivity
import com.otium.lab.library.DocumentStore
import com.otium.lab.pdf.components.PdfBottomScrubber
import com.otium.lab.pdf.components.PdfJumpDialog
import com.otium.lab.pdf.components.PdfPageItem
import com.otium.lab.pdf.components.PdfTopOverlay
import com.otium.lab.pdf.model.PageColorMode
import com.otium.lab.pdf.model.ReadingLayout
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.launch

@Composable
fun PdfViewerScreen(
    uri: Uri,
    title: String,
    themePreferences: ThemePreferences,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val renderer = remember { NativePdfRenderer(context) }
    val documentStore = remember { DocumentStore(context) }

    val currentTheme by themePreferences.currentTheme
    val keepScreenOn by themePreferences.keepScreenOn

    var isLoaded by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showControls by remember { mutableStateOf(true) }
    var showJumpDialog by remember { mutableStateOf(false) }

    var readingLayout by remember {
        mutableStateOf(
            if (themePreferences.defaultHorizontalLayout.value) ReadingLayout.HORIZONTAL
            else ReadingLayout.VERTICAL
        )
    }

    var pageColorMode by remember {
        mutableStateOf(
            if (currentTheme == AppThemeMode.AMOLED) PageColorMode.AMOLED_BLACK
            else if (currentTheme == AppThemeMode.CREAM) PageColorMode.SEPIA
            else PageColorMode.ORIGINAL
        )
    }

    val listState = rememberLazyListState()
    val pagerState = rememberPagerState(
        initialPage = 0,
        pageCount = { renderer.pageCount.coerceAtLeast(1) }
    )

    var targetScale by remember { mutableFloatStateOf(1f) }
    val scale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = tween(durationMillis = 220, easing = FastOutSlowInEasing),
        label = "scale"
    )
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    val currentPage by remember {
        derivedStateOf {
            if (renderer.pageCount <= 0) 1
            else if (readingLayout == ReadingLayout.VERTICAL) {
                (listState.firstVisibleItemIndex + 1).coerceAtMost(renderer.pageCount)
            } else {
                (pagerState.currentPage + 1).coerceAtMost(renderer.pageCount)
            }
        }
    }

    var isDraggingSlider by remember { mutableStateOf(false) }
    var sliderValue by remember { mutableFloatStateOf(1f) }

    LaunchedEffect(currentPage, isDraggingSlider) {
        if (!isDraggingSlider) {
            sliderValue = currentPage.toFloat()
        }
    }

    // Keep screen awake
    DisposableEffect(keepScreenOn) {
        val window = context.findActivity()?.window
        if (keepScreenOn) {
            window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Immersive Mode
    DisposableEffect(Unit) {
        val window = context.findActivity()?.window
        val insetsController = window?.let { WindowInsetsControllerCompat(it, it.decorView) }
        insetsController?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController?.hide(WindowInsetsCompat.Type.systemBars())

        onDispose {
            insetsController?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    // Smart Reading Resume
    LaunchedEffect(isLoaded) {
        if (isLoaded && renderer.pageCount > 0) {
            val savedPage = documentStore.getLastPage(uri)
            if (savedPage > 1 && savedPage <= renderer.pageCount) {
                val targetIndex = (savedPage - 1).coerceAtLeast(0)
                listState.scrollToItem(targetIndex)
                pagerState.scrollToPage(targetIndex)
            }
        }
    }

    // Save reading progress
    LaunchedEffect(currentPage, renderer.pageCount) {
        if (renderer.pageCount > 0) {
            documentStore.updateProgress(uri, currentPage, renderer.pageCount)
        }
    }

    DisposableEffect(uri) {
        try {
            renderer.open(uri, title)
            isLoaded = true
        } catch (e: Exception) {
            errorMessage = e.localizedMessage ?: "تعذر قراءة ملف الـ PDF"
        }
        onDispose { renderer.close() }
    }

    val containerBg = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color.Black
        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
        PageColorMode.ORIGINAL -> if (currentTheme == AppThemeMode.AMOLED) Color.Black else Color(0xFFF1F5F9)
    }

    val barBg = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFF111114)
        PageColorMode.SEPIA -> Color(0xFFF4EBD9)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.surface
    }

    val textColor = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFFF8FAFC)
        PageColorMode.SEPIA -> Color(0xFF2C2416)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.onSurface
    }

    val cardBg = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color.Black
        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
        PageColorMode.ORIGINAL -> Color.White
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(containerBg)
    ) {
        // PDF Content Layer (Takes 100% full screen, zero CLS on toggle)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = { showControls = !showControls },
                        onDoubleTap = {
                            if (targetScale > 1.2f) {
                                targetScale = 1f
                                offsetX = 0f
                                offsetY = 0f
                            } else {
                                targetScale = 2.2f
                            }
                        }
                    )
                }
        ) {
            when {
                errorMessage != null -> {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(text = errorMessage ?: "", color = MaterialTheme.colorScheme.error, fontSize = 14.sp)
                    }
                }

                !isLoaded -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                    }
                }

                else -> {
                    if (readingLayout == ReadingLayout.VERTICAL) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            items(renderer.pageCount, key = { it }) { pageIndex ->
                                PdfPageItem(renderer = renderer, pageIndex = pageIndex, pageColorMode = pageColorMode, cardBg = cardBg)
                            }
                        }
                    } else {
                        HorizontalPager(
                            state = pagerState,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX, translationY = offsetY),
                            pageSpacing = 0.dp
                        ) { pageIndex ->
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                PdfPageItem(renderer = renderer, pageIndex = pageIndex, pageColorMode = pageColorMode, cardBg = cardBg)
                            }
                        }
                    }
                }
            }
        }

        // Floating Top Bar Overlay
        PdfTopOverlay(
            visible = showControls,
            title = title,
            currentPage = currentPage,
            pageCount = renderer.pageCount,
            barBg = barBg,
            textColor = textColor,
            readingLayout = readingLayout,
            pageColorMode = pageColorMode,
            onToggleLayout = {
                val target = currentPage
                readingLayout = if (readingLayout == ReadingLayout.VERTICAL) ReadingLayout.HORIZONTAL else ReadingLayout.VERTICAL
                scope.launch {
                    if (readingLayout == ReadingLayout.HORIZONTAL) pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                    else listState.scrollToItem((target - 1).coerceAtLeast(0))
                }
            },
            onToggleColorMode = {
                pageColorMode = when (pageColorMode) {
                    PageColorMode.ORIGINAL -> PageColorMode.AMOLED_BLACK
                    PageColorMode.AMOLED_BLACK -> PageColorMode.SEPIA
                    PageColorMode.SEPIA -> PageColorMode.ORIGINAL
                }
            },
            onClose = onClose,
            modifier = Modifier.align(Alignment.TopCenter)
        )

        // Floating Bottom Bar Overlay
        PdfBottomScrubber(
            visible = showControls,
            currentPage = currentPage,
            pageCount = renderer.pageCount,
            sliderValue = sliderValue,
            isDraggingSlider = isDraggingSlider,
            barBg = barBg,
            textColor = textColor,
            onSliderValueChange = { newVal ->
                isDraggingSlider = true
                sliderValue = newVal
            },
            onSliderValueChangeFinished = {
                isDraggingSlider = false
                val target = sliderValue.toInt()
                scope.launch {
                    if (readingLayout == ReadingLayout.VERTICAL) listState.scrollToItem((target - 1).coerceAtLeast(0))
                    else pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                }
            },
            onOpenJumpDialog = { showJumpDialog = true },
            modifier = Modifier.align(Alignment.BottomCenter)
        )

        // Fast Page Jump Dialog
        if (showJumpDialog) {
            PdfJumpDialog(
                pageCount = renderer.pageCount,
                initialPage = currentPage,
                onDismiss = { showJumpDialog = false },
                onConfirmJump = { target ->
                    scope.launch {
                        if (readingLayout == ReadingLayout.VERTICAL) listState.scrollToItem(target - 1)
                        else pagerState.scrollToPage(target - 1)
                    }
                    showJumpDialog = false
                }
            )
        }
    }
}
