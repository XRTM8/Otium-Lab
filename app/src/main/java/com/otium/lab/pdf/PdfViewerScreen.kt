package com.otium.lab.pdf

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
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
import com.otium.lab.library.DocumentStore
import com.otium.lab.ui.theme.AppThemeMode
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfViewerScreen(
    uri: Uri,
    title: String,
    currentTheme: AppThemeMode,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val renderer = remember { NativePdfRenderer(context) }
    val documentStore = remember { DocumentStore(context) }

    var isLoaded by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showControls by remember { mutableStateOf(true) }

    var readingLayout by remember { mutableStateOf(ReadingLayout.VERTICAL) }
    var showJumpDialog by remember { mutableStateOf(false) }
    var jumpInputText by remember { mutableStateOf("") }

    // Default to AMOLED page inversion if the user has chosen AMOLED theme!
    var pageColorMode by remember {
        mutableStateOf(
            if (currentTheme == AppThemeMode.AMOLED) PageColorMode.AMOLED_BLACK
            else if (currentTheme == AppThemeMode.CREAM) PageColorMode.SEPIA
            else PageColorMode.ORIGINAL
        )
    }

    val listState = rememberLazyListState()
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    val currentPage by remember {
        derivedStateOf {
            if (renderer.pageCount > 0) {
                (listState.firstVisibleItemIndex + 1).coerceAtMost(renderer.pageCount)
            } else 1
        }
    }

    // Smart Reading Resume: scroll to saved page on open
    LaunchedEffect(isLoaded) {
        if (isLoaded && renderer.pageCount > 0) {
            val savedPage = documentStore.getLastPage(uri)
            if (savedPage > 1 && savedPage <= renderer.pageCount) {
                listState.scrollToItem((savedPage - 1).coerceAtLeast(0))
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
        PageColorMode.ORIGINAL -> if (currentTheme == AppThemeMode.AMOLED) Color(0xFF0F0F0F) else Color(0xFFF1F5F9)
    }

    val barBg = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFF111111)
        PageColorMode.SEPIA -> Color(0xFFF4EBD9)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.surface
    }

    val textColor = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color(0xFFF8FAFC)
        PageColorMode.SEPIA -> Color(0xFF2C2416)
        PageColorMode.ORIGINAL -> MaterialTheme.colorScheme.onSurface
    }

    Scaffold(
        topBar = {
            AnimatedVisibility(
                visible = showControls,
                enter = fadeIn(),
                exit = fadeOut()
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
                                    text = "صفحة $currentPage من ${renderer.pageCount}",
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
                            readingLayout = if (readingLayout == ReadingLayout.VERTICAL) {
                                ReadingLayout.HORIZONTAL
                            } else {
                                ReadingLayout.VERTICAL
                            }
                        }) {
                            Icon(
                                imageVector = if (readingLayout == ReadingLayout.VERTICAL) Icons.Rounded.AutoStories else Icons.Rounded.ViewDay,
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
                                imageVector = when (pageColorMode) {
                                    PageColorMode.ORIGINAL -> Icons.Rounded.LightMode
                                    PageColorMode.AMOLED_BLACK -> Icons.Rounded.DarkMode
                                    PageColorMode.SEPIA -> Icons.Rounded.AutoStories
                                },
                                contentDescription = pageColorMode.labelAr,
                                tint = if (pageColorMode == PageColorMode.AMOLED_BLACK) MaterialTheme.colorScheme.primary else textColor
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = barBg
                    )
                )
            }
        },
        bottomBar = {
            AnimatedVisibility(
                visible = showControls && renderer.pageCount > 1,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Surface(
                    color = barBg,
                    tonalElevation = 6.dp,
                    modifier = Modifier.fillMaxWidth().height(60.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Quick Jump Trigger
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
                            Text(
                                text = "$currentPage / ${renderer.pageCount}",
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

                        Slider(
                            value = currentPage.toFloat(),
                            onValueChange = { targetPage ->
                                scope.launch {
                                    listState.scrollToItem((targetPage.toInt() - 1).coerceAtLeast(0))
                                }
                            },
                            valueRange = 1f..renderer.pageCount.toFloat(),
                            steps = (renderer.pageCount - 2).coerceAtLeast(0),
                            modifier = Modifier.weight(1f),
                            colors = SliderDefaults.colors(
                                thumbColor = MaterialTheme.colorScheme.primary,
                                activeTrackColor = MaterialTheme.colorScheme.primary
                            )
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(containerBg)
                .pointerInput(Unit) {
                    detectTapGestures(
                        onTap = {
                            showControls = !showControls
                        },
                        onDoubleTap = {
                            scale = if (scale > 1.2f) 1f else 2.5f
                            offsetX = 0f
                            offsetY = 0f
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
                    val cardBg = when (pageColorMode) {
                        PageColorMode.AMOLED_BLACK -> Color.Black
                        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
                        PageColorMode.ORIGINAL -> Color.White
                    }

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
                            contentPadding = PaddingValues(vertical = 12.dp)
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
                        val pagerState = rememberPagerState(
                            initialPage = (currentPage - 1).coerceAtLeast(0),
                            pageCount = { renderer.pageCount }
                        )

                        LaunchedEffect(pagerState.currentPage) {
                            documentStore.updateProgress(uri, pagerState.currentPage + 1, renderer.pageCount)
                        }

                        HorizontalPager(
                            state = pagerState,
                            modifier = Modifier
                                .fillMaxSize()
                                .graphicsLayer(scaleX = scale, scaleY = scale),
                            pageSpacing = 16.dp
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
                                onClick = { jumpInputText = "${renderer.pageCount / 2}" },
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
                                    listState.scrollToItem(target - 1)
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

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(6.dp))
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
                    .height(440.dp)
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
