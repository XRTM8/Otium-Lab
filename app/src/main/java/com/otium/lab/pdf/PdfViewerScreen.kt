package com.otium.lab.pdf

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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

    // Save reading progress when page changes
    LaunchedEffect(currentPage, renderer.pageCount) {
        if (renderer.pageCount > 0) {
            documentStore.addOrUpdateDocument(
                uri = uri,
                title = title,
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
                                tint = if (pageColorMode == PageColorMode.AMOLED_BLACK) Color(0xFFE5B842) else textColor
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
                        Text(
                            text = "$currentPage",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = textColor
                        )
                        Spacer(modifier = Modifier.width(12.dp))
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
                                thumbColor = Color(0xFFC29B38),
                                activeTrackColor = Color(0xFFC29B38)
                            )
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "${renderer.pageCount}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = textColor
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
                        CircularProgressIndicator(color = Color(0xFFC29B38))
                    }
                }

                else -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectTransformGestures { _, pan, zoom, _ ->
                                    scale = (scale * zoom).coerceIn(1f, 4f)
                                    if (scale == 1f) {
                                        offsetX = 0f
                                        offsetY = 0f
                                    } else {
                                        offsetX += pan.x
                                        offsetY += pan.y
                                    }
                                }
                            }
                            .graphicsLayer(
                                scaleX = scale,
                                scaleY = scale,
                                translationX = offsetX,
                                translationY = offsetY
                            )
                    ) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(8.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            items(renderer.pageCount) { index ->
                                PdfPageItem(
                                    pageIndex = index,
                                    renderer = renderer,
                                    pageColorMode = pageColorMode
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PdfPageItem(
    pageIndex: Int,
    renderer: NativePdfRenderer,
    pageColorMode: PageColorMode
) {
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(pageIndex) {
        isLoading = true
        try {
            bitmap = renderer.renderPage(pageIndex)
        } catch (_: Exception) {}
        isLoading = false
    }

    val pageColorFilter = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> ColorFilter.colorMatrix(InvertColorMatrix)
        PageColorMode.SEPIA -> ColorFilter.colorMatrix(SepiaColorMatrix)
        PageColorMode.ORIGINAL -> null
    }

    val cardBg = when (pageColorMode) {
        PageColorMode.AMOLED_BLACK -> Color.Black
        PageColorMode.SEPIA -> Color(0xFFFBF7EE)
        PageColorMode.ORIGINAL -> Color.White
    }

    Surface(
        shape = RoundedCornerShape(4.dp),
        color = cardBg,
        shadowElevation = if (pageColorMode == PageColorMode.AMOLED_BLACK) 0.dp else 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = "صفحة ${pageIndex + 1}",
                contentScale = ContentScale.FillWidth,
                colorFilter = pageColorFilter,
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
                        color = Color(0xFFC29B38),
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
