package com.otium.lab.pdf

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

enum class ReaderTheme(val bg: Color, val surface: Color, val text: Color) {
    LIGHT(Color(0xFFF3F4F6), Color.White, Color(0xFF111827)),
    SEPIA(Color(0xFFFBF0D9), Color(0xFFF5E6C8), Color(0xFF4A3B2C)),
    DARK(Color(0xFF121212), Color(0xFF1E1E1E), Color(0xFFE5E7EB))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PdfViewerScreen(
    uri: Uri,
    title: String,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val renderer = remember { NativePdfRenderer(context) }

    var isLoaded by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var readerTheme by remember { mutableStateOf(ReaderTheme.LIGHT) }

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = title,
                            maxLines = 1,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = readerTheme.text
                        )
                        if (renderer.pageCount > 0) {
                            Text(
                                text = "صفحة $currentPage من ${renderer.pageCount}",
                                fontSize = 12.sp,
                                color = readerTheme.text.copy(alpha = 0.7f)
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(
                            Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "رجوع",
                            tint = readerTheme.text
                        )
                    }
                },
                actions = {
                    // Theme Switcher
                    IconButton(onClick = {
                        readerTheme = when (readerTheme) {
                            ReaderTheme.LIGHT -> ReaderTheme.SEPIA
                            ReaderTheme.SEPIA -> ReaderTheme.DARK
                            ReaderTheme.DARK -> ReaderTheme.LIGHT
                        }
                    }) {
                        Icon(
                            imageVector = when (readerTheme) {
                                ReaderTheme.LIGHT -> Icons.Rounded.LightMode
                                ReaderTheme.SEPIA -> Icons.Rounded.AutoStories
                                ReaderTheme.DARK -> Icons.Rounded.DarkMode
                            },
                            contentDescription = "تغيير نمط القراءة",
                            tint = readerTheme.text
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = readerTheme.surface
                )
            )
        },
        bottomBar = {
            if (renderer.pageCount > 1) {
                Surface(
                    color = readerTheme.surface,
                    tonalElevation = 4.dp,
                    modifier = Modifier.fillMaxWidth().height(56.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "$currentPage",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = readerTheme.text
                        )
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
                                thumbColor = Color(0xFFC29B38),
                                activeTrackColor = Color(0xFFC29B38)
                            )
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "${renderer.pageCount}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = readerTheme.text
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
                .background(readerTheme.bg)
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
                            contentPadding = PaddingValues(12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            items(renderer.pageCount) { index ->
                                PdfPageItem(
                                    pageIndex = index,
                                    renderer = renderer,
                                    readerTheme = readerTheme
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
    readerTheme: ReaderTheme
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

    Surface(
        shape = RoundedCornerShape(8.dp),
        color = readerTheme.surface,
        shadowElevation = 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap!!.asImageBitmap(),
                contentDescription = "صفحة ${pageIndex + 1}",
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(420.dp)
                    .background(readerTheme.surface),
                contentAlignment = Alignment.Center
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color(0xFFC29B38),
                        modifier = Modifier.size(32.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text("تعذر تحميل الصفحة", color = Color.Gray, fontSize = 12.sp)
                }
            }
        }
    }
}
