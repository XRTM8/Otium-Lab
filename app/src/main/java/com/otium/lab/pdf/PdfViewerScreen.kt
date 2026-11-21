package com.otium.lab.pdf

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.net.Uri
import android.view.WindowManager
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.otium.lab.library.DocumentStore
import com.otium.lab.ui.theme.AppThemeMode
import com.otium.lab.ui.theme.ThemePreferences
import kotlinx.coroutines.launch

enum class PageColorMode(val labelAr: String) {
    ORIGINAL("أبيض طبيعي"),
    AMOLED_BLACK("أموليـد أسود"),
    SEPIA("سيبيا ورقي")
}

enum class ReadingLayout(val labelAr: String) {
    VERTICAL("تمرير عمودي"),
    HORIZONTAL("تقليب أفقي")
}

val InvertColorMatrix = ColorMatrix(
    floatArrayOf(
        -1f,  0f,  0f,  0f, 255f,
         0f, -1f,  0f,  0f, 255f,
         0f,  0f, -1f,  0f, 255f,
         0f,  0f,  0f,  1f,   0f
    )
)

val SepiaColorMatrix = ColorMatrix(
    floatArrayOf(
        0.393f, 0.769f, 0.189f, 0f, 0f,
        0.349f, 0.686f, 0.168f, 0f, 0f,
        0.272f, 0.534f, 0.131f, 0f, 0f,
        0f,     0f,     0f,     1f, 0f
    )
)

private fun Context.findActivity(): Activity? {
    var ctx = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

@OptIn(ExperimentalMaterial3Api::class)
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

    var readingLayout by remember {
        mutableStateOf(
            if (themePreferences.defaultHorizontalLayout.value) ReadingLayout.HORIZONTAL
            else ReadingLayout.VERTICAL
        )
    }

    var showJumpDialog by remember { mutableStateOf(false) }
    var jumpInputText by remember { mutableStateOf("") }

    // Page color mode defaulting based on active theme
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

    // Smooth physical zoom (No harsh instantaneous jumps)
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

    // Slider state decoupled from scroll events to prevent recomposition stutter
    var isDraggingSlider by remember { mutableStateOf(false) }
    var sliderValue by remember { mutableFloatStateOf(1f) }

    LaunchedEffect(currentPage, isDraggingSlider) {
        if (!isDraggingSlider) {
            sliderValue = currentPage.toFloat()
        }
    }

    // Prevent Screen Sleep while reading (Respect user preference)
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

    // True Full-Screen Immersive Mode: Hides Status Bar & Navigation Bar
    DisposableEffect(Unit) {
        val window = context.findActivity()?.window
        val insetsController = window?.let { WindowInsetsControllerCompat(it, it.decorView) }
        insetsController?.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        insetsController?.hide(WindowInsetsCompat.Type.systemBars())

        onDispose {
            insetsController?.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    // Smart Reading Resume: scroll to saved page on open
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

    // Save reading progress when page changes
    LaunchedEffect(currentPage, renderer.pageCount) {
        if (renderer.pageCount > 0) {
            documentStore.updateProgress(
                uri = uri,
                page = currentPage,
                total = renderer.pageCount
            )
        }
    }

    DisposableEffect(uri) {
        try {
            renderer.open(uri, title)
            isLoaded = true
        } catch (e: Exception) {
            errorMessage = e.localizedMessage ?: "تعذر قراءة ملف الـ PDF"
        }

        onDispose {
            renderer.close()
        }
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

    // Root Layout: NO SCAFFOLD PADDING TO PREVENT ANY JUMP/LAYOUT SHIFT
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(containerBg)
    ) {
        // 1. PDF Content Layer (Takes 100% full screen, zero shifts when controls toggle)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = {
                            showControls = !showControls
                        },
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
                        Icon(
                            Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(48.dp)
                        )
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
                                .graphicsLayer(
                                    scaleX = scale,
                                    scaleY = scale,
                                    translationX = offsetX,
                                    translationY = offsetY
                                ),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            items(renderer.pageCount, key = { it }) { pageIndex ->
                                PdfPageItem(
                                    renderer = renderer,
                                    pageIndex = pageIndex,
                                    pageColorMode = pageColorMode,
                                    cardBg = cardBg
                                )
                            }
                        }
                    } else {
                        HorizontalPager(
                            state = pagerState,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer(
                                    scaleX = scale,
                                    scaleY = scale,
                                    translationX = offsetX,
                                    translationY = offsetY
                                ),
                            pageSpacing = 0.dp
                        ) { pageIndex ->
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                PdfPageItem(
                                    renderer = renderer,
                                    pageIndex = pageIndex,
                                    pageColorMode = pageColorMode,
                                    cardBg = cardBg
                                )
                            }
                        }
                    }
                }
            }
        }

        // 2. Floating Top Bar Overlay with Soft Gradient Scrim
        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(tween(160)),
            exit = fadeOut(tween(160)),
            modifier = Modifier.align(Alignment.TopCenter)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                barBg.copy(alpha = 0.98f),
                                barBg.copy(alpha = 0.88f),
                                Color.Transparent
                            )
                        )
                    )
                    .statusBarsPadding()
            ) {
                TopAppBar(
                    title = {
                        Column {
                            Text(
                                text = title,
                                maxLines = 1,
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = textColor
                            )
                            if (renderer.pageCount > 0) {
                                Text(
                                    text = "\u200Eصفحة $currentPage من ${renderer.pageCount}\u200E",
                                    fontSize = 12.sp,
                                    color = textColor.copy(alpha = 0.7f)
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onClose) {
                            Icon(
                                Icons.AutoMirrored.Rounded.ArrowBack,
                                contentDescription = "رجوع",
                                tint = textColor
                            )
                        }
                    },
                    actions = {
                        // Reading Layout Toggle (Vertical <-> Horizontal)
                        IconButton(onClick = {
                            val target = currentPage
                            readingLayout = if (readingLayout == ReadingLayout.VERTICAL) {
                                ReadingLayout.HORIZONTAL
                            } else {
                                ReadingLayout.VERTICAL
                            }
                            scope.launch {
                                if (readingLayout == ReadingLayout.HORIZONTAL) {
                                    pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                                } else {
                                    listState.scrollToItem((target - 1).coerceAtLeast(0))
                                }
                            }
                        }) {
                            Icon(
                                imageVector = if (readingLayout == ReadingLayout.VERTICAL) Icons.Rounded.AutoStories else Icons.Rounded.ViewStream,
                                contentDescription = readingLayout.labelAr,
                                tint = textColor
                            )
                        }

                        // Page color mode toggle (Original -> AMOLED Black -> Sepia)
                        IconButton(onClick = {
                            pageColorMode = when (pageColorMode) {
                                PageColorMode.ORIGINAL -> PageColorMode.AMOLED_BLACK
                                PageColorMode.AMOLED_BLACK -> PageColorMode.SEPIA
                                PageColorMode.SEPIA -> PageColorMode.ORIGINAL
                            }
                        }) {
                            Icon(
                                imageVector = Icons.Rounded.Palette,
                                contentDescription = pageColorMode.labelAr,
                                tint = if (pageColorMode == PageColorMode.AMOLED_BLACK) MaterialTheme.colorScheme.primary else textColor
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent
                    )
                )
            }
        }

        // 3. Floating Bottom Bar Overlay with Soft Gradient Scrim & Silk Scrubber
        AnimatedVisibility(
            visible = showControls && renderer.pageCount > 1,
            enter = fadeIn(tween(160)),
            exit = fadeOut(tween(160)),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(
                                Color.Transparent,
                                barBg.copy(alpha = 0.88f),
                                barBg.copy(alpha = 0.98f)
                            )
                        )
                    )
                    .navigationBarsPadding()
            ) {
                // Floating Dynamic Scrubber Bubble
                AnimatedVisibility(
                    visible = isDraggingSlider,
                    enter = fadeIn(tween(100)),
                    exit = fadeOut(tween(100)),
                    modifier = Modifier.align(Alignment.CenterHorizontally).padding(bottom = 6.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primary,
                        shadowElevation = 8.dp
                    ) {
                        Text(
                            text = "\u200Eصفحة ${sliderValue.toInt()} من ${renderer.pageCount}\u200E",
                            color = MaterialTheme.colorScheme.onPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(64.dp)
                        .padding(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Quick Jump Trigger with Directional Marker to prevent RTL reversal
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                jumpInputText = "$currentPage"
                                showJumpDialog = true
                            }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val displayNum = if (isDraggingSlider) sliderValue.toInt() else currentPage
                        Text(
                            text = "\u200E$displayNum / ${renderer.pageCount}\u200E",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = textColor
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            Icons.Rounded.UnfoldMore,
                            contentDescription = "انتقال سريع",
                            tint = textColor.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    // Silk Scrubber (Continuous smooth line with 0 tick dots)
                    Slider(
                        value = sliderValue,
                        onValueChange = { newVal ->
                            isDraggingSlider = true
                            sliderValue = newVal
                        },
                        onValueChangeFinished = {
                            isDraggingSlider = false
                            val target = sliderValue.toInt()
                            scope.launch {
                                if (readingLayout == ReadingLayout.VERTICAL) {
                                    listState.scrollToItem((target - 1).coerceAtLeast(0))
                                } else {
                                    pagerState.scrollToPage((target - 1).coerceAtLeast(0))
                                }
                            }
                        },
                        valueRange = 1f..renderer.pageCount.toFloat().coerceAtLeast(1f),
                        steps = 0,
                        modifier = Modifier.weight(1f),
                        colors = SliderDefaults.colors(
                            thumbColor = MaterialTheme.colorScheme.primary,
                            activeTrackColor = MaterialTheme.colorScheme.primary,
                            inactiveTrackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
                        )
                    )
                }
            }
        }

        // Fast Page Jump Dialog
        if (showJumpDialog) {
            AlertDialog(
                onDismissRequest = { showJumpDialog = false },
                title = { Text("انتقال سريع إلى صفحة", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
                text = {
                    Column {
                        Text("أدخل رقم الصفحة (1 - ${renderer.pageCount}):", fontSize = 12.sp, color = Color.Gray)
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = jumpInputText,
                            onValueChange = { jumpInputText = it.filter { char -> char.isDigit() } },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(modifier = Modifier.height(14.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { jumpInputText = "1" },
                                modifier = Modifier.weight(1f)
                            ) { Text("الأولى", fontSize = 12.sp) }
                            OutlinedButton(
                                onClick = { jumpInputText = "${(renderer.pageCount / 2).coerceAtLeast(1)}" },
                                modifier = Modifier.weight(1f)
                            ) { Text("المنتصف", fontSize = 12.sp) }
                            OutlinedButton(
                                onClick = { jumpInputText = "${renderer.pageCount}" },
                                modifier = Modifier.weight(1f)
                            ) { Text("الأخيرة", fontSize = 12.sp) }
                        }
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            val target = jumpInputText.toIntOrNull()
                            if (target != null && target in 1..renderer.pageCount) {
                                scope.launch {
                                    if (readingLayout == ReadingLayout.VERTICAL) {
                                        listState.scrollToItem(target - 1)
                                    } else {
                                        pagerState.scrollToPage(target - 1)
                                    }
                                }
                                showJumpDialog = false
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text("انتقال", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showJumpDialog = false }) {
                        Text("إلغاء")
                    }
                }
            )
        }
    }
}

@Composable
fun PdfPageItem(
    renderer: NativePdfRenderer,
    pageIndex: Int,
    pageColorMode: PageColorMode,
    cardBg: Color
) {
    var pageBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(pageIndex) {
        isLoading = true
        try {
            pageBitmap = renderer.renderPage(pageIndex)
        } catch (_: Exception) {}
        isLoading = false
    }

    val colorFilter = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> ColorFilter.colorMatrix(InvertColorMatrix)
        PageColorMode.SEPIA -> ColorFilter.colorMatrix(SepiaColorMatrix)
        PageColorMode.ORIGINAL -> null
    }

    // Edge-to-edge flush canvas: NO padding, NO card clipping
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(cardBg),
        contentAlignment = Alignment.Center
    ) {
        val bmp = pageBitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = "صفحة ${pageIndex + 1}",
                colorFilter = colorFilter,
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(480.dp)
                    .background(cardBg),
                contentAlignment = Alignment.Center
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("تعذر تحميل الصفحة", color = Color.Gray, fontSize = 12.sp)
                }
            }
        }
    }
}
