package com.otium.lab.scanner

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.net.Uri
import android.util.Size
import android.view.MotionEvent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.*
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Composable
fun CameraScannerScreen(
    pageCount: Int = 0,
    onImageCaptured: (ByteArray) -> Unit,
    onFinishBatch: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val primaryColor = MaterialTheme.colorScheme.primary

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                val input: InputStream? = context.contentResolver.openInputStream(uri)
                val rawBytes = input?.readBytes()
                input?.close()
                if (rawBytes != null && rawBytes.isNotEmpty()) {
                    // Safe downscale from gallery if needed
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
                    if (bmp != null) {
                        val maxDim = maxOf(bmp.width, bmp.height)
                        val finalBmp = if (maxDim > 2048) {
                            val scale = 2048f / maxDim
                            Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
                        } else {
                            bmp
                        }
                        val out = ByteArrayOutputStream()
                        finalBmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
                        onImageCaptured(out.toByteArray())
                    }
                }
            } catch (_: Exception) {}
        }
    }

    if (!hasCameraPermission) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0A0F1D))
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(
                    Icons.Rounded.CameraAlt,
                    contentDescription = null,
                    tint = primaryColor,
                    modifier = Modifier.size(64.dp)
                )
                Spacer(modifier = Modifier.height(18.dp))
                Text(
                    "يتطلب ماسح المستندات إذن الكاميرا",
                    color = Color.White,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "يرجى منح الإذن للتمكن من مسح الكتب والمستندات الورقية ضوئياً بدقة فائقة",
                    color = Color.Gray,
                    fontSize = 13.sp,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("منح إذن الكاميرا", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
        return
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    var camera by remember { mutableStateOf<Camera?>(null) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isFlashOn by remember { mutableStateOf(false) }
    var isCapturing by remember { mutableStateOf(false) }
    var showShutterFlash by remember { mutableStateOf(false) }

    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "viewfinder")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        // High-Speed 60 FPS Camera Preview with Auto-Focus
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    // Ideal Document Scanning Resolution: ~1080p/1440p (Super sharp text, instant processing, 0 OOM risk)
                    val resolutionSelector = ResolutionSelector.Builder()
                        .setResolutionStrategy(
                            ResolutionStrategy(
                                Size(1920, 1440),
                                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                            )
                        )
                        .build()

                    val preview = Preview.Builder()
                        .setResolutionSelector(resolutionSelector)
                        .build()
                        .also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }

                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setResolutionSelector(resolutionSelector)
                        .build()

                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                    try {
                        cameraProvider.unbindAll()
                        camera = cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            capture
                        )
                        imageCapture = capture
                    } catch (_: Exception) {}
                }, ContextCompat.getMainExecutor(ctx))

                // Tap-to-focus on document
                previewView.setOnTouchListener { view, event ->
                    if (event.action == MotionEvent.ACTION_UP) {
                        val cam = camera
                        if (cam != null) {
                            val factory = previewView.meteringPointFactory
                            val point = factory.createPoint(event.x, event.y)
                            val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF)
                                .setAutoCancelDuration(3, TimeUnit.SECONDS)
                                .build()
                            cam.cameraControl.startFocusAndMetering(action)
                        }
                        view.performClick()
                    }
                    true
                }

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Document Corner Guides with Horizon Crosshair
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 90.dp)
        ) {
            val strokeWidth = 3.5.dp.toPx()
            val cornerLength = 32.dp.toPx()
            val color = primaryColor.copy(alpha = pulseAlpha)

            val w = size.width
            val h = size.height

            // Top-Left
            drawLine(color, Offset(0f, 0f), Offset(cornerLength, 0f), strokeWidth)
            drawLine(color, Offset(0f, 0f), Offset(0f, cornerLength), strokeWidth)

            // Top-Right
            drawLine(color, Offset(w, 0f), Offset(w - cornerLength, 0f), strokeWidth)
            drawLine(color, Offset(w, 0f), Offset(w, cornerLength), strokeWidth)

            // Bottom-Left
            drawLine(color, Offset(0f, h), Offset(cornerLength, h), strokeWidth)
            drawLine(color, Offset(0f, h), Offset(0f, h - cornerLength), strokeWidth)

            // Bottom-Right
            drawLine(color, Offset(w, h), Offset(w - cornerLength, h), strokeWidth)
            drawLine(color, Offset(w, h), Offset(w, h - cornerLength), strokeWidth)

            // Horizon Alignment Crosshair
            val crossColor = Color.White.copy(alpha = 0.22f)
            val cx = w / 2f
            val cy = h / 2f
            drawLine(crossColor, Offset(cx - 16f, cy), Offset(cx + 16f, cy), 1.5.dp.toPx())
            drawLine(crossColor, Offset(cx, cy - 16f), Offset(cx, cy + 16f), 1.5.dp.toPx())
        }

        // Shutter Flash Animation Effect
        AnimatedVisibility(
            visible = showShutterFlash,
            enter = fadeIn(animationSpec = tween(50)),
            exit = fadeOut(animationSpec = tween(150)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.White))
        }

        // Top Controls Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .size(44.dp)
                    .background(Color.Black.copy(alpha = 0.55f), CircleShape)
            ) {
                Icon(
                    Icons.AutoMirrored.Rounded.ArrowBack,
                    contentDescription = "رجوع",
                    tint = Color.White
                )
            }

            // Status Badge
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = Color.Black.copy(alpha = 0.65f),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.2f))
            ) {
                Text(
                    text = if (pageCount > 0) "تم التقاط $pageCount صفحة" else "وجه الكاميرا نحو المستند واضغط للتركيز",
                    color = if (pageCount > 0) primaryColor else Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp)
                )
            }

            // Flash Toggle
            IconButton(
                onClick = {
                    val cam = camera
                    if (cam != null && cam.cameraInfo.hasFlashUnit()) {
                        isFlashOn = !isFlashOn
                        cam.cameraControl.enableTorch(isFlashOn)
                    }
                },
                modifier = Modifier
                    .size(44.dp)
                    .background(Color.Black.copy(alpha = 0.55f), CircleShape)
            ) {
                Icon(
                    imageVector = if (isFlashOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                    contentDescription = "الفلاش",
                    tint = if (isFlashOn) primaryColor else Color.White
                )
            }
        }

        // Bottom Controls Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 28.dp, start = 24.dp, end = 24.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Pick from Gallery
            IconButton(
                onClick = { galleryLauncher.launch("image/*") },
                modifier = Modifier
                    .size(54.dp)
                    .background(Color.Black.copy(alpha = 0.55f), CircleShape)
                    .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
            ) {
                Icon(
                    Icons.Rounded.PhotoLibrary,
                    contentDescription = "معرض الصور",
                    tint = Color.White,
                    modifier = Modifier.size(26.dp)
                )
            }

            // Main Shutter Button
            Button(
                onClick = {
                    val capture = imageCapture ?: return@Button
                    if (isCapturing) return@Button
                    isCapturing = true

                    // Trigger shutter blink
                    scope.launch {
                        showShutterFlash = true
                        delay(70)
                        showShutterFlash = false
                    }

                    capture.takePicture(
                        cameraExecutor,
                        object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                                try {
                                    val rotationDegrees = imageProxy.imageInfo.rotationDegrees
                                    val rawBitmap = imageProxy.toBitmap()
                                    imageProxy.close()

                                    // Rotate to upright orientation
                                    val rotatedBitmap = if (rotationDegrees != 0) {
                                        val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                                        val rot = Bitmap.createBitmap(rawBitmap, 0, 0, rawBitmap.width, rawBitmap.height, matrix, true)
                                        if (rot != rawBitmap) {
                                            rawBitmap.recycle()
                                        }
                                        rot
                                    } else {
                                        rawBitmap
                                    }

                                    // Prevent OOM: Downscale if exceeds 2048px on max dimension
                                    val maxDim = maxOf(rotatedBitmap.width, rotatedBitmap.height)
                                    val finalBitmap = if (maxDim > 2048) {
                                        val scale = 2048f / maxDim
                                        val scaledW = (rotatedBitmap.width * scale).toInt()
                                        val scaledH = (rotatedBitmap.height * scale).toInt()
                                        val scaled = Bitmap.createScaledBitmap(rotatedBitmap, scaledW, scaledH, true)
                                        if (scaled != rotatedBitmap) {
                                            rotatedBitmap.recycle()
                                        }
                                        scaled
                                    } else {
                                        rotatedBitmap
                                    }

                                    // Fast hardware JPEG compression (85% quality: ~350KB - 800KB, ultra sharp text)
                                    val stream = ByteArrayOutputStream()
                                    finalBitmap.compress(Bitmap.CompressFormat.JPEG, 85, stream)
                                    finalBitmap.recycle()
                                    val jpegBytes = stream.toByteArray()

                                    ContextCompat.getMainExecutor(context).execute {
                                        isCapturing = false
                                        onImageCaptured(jpegBytes)
                                    }
                                } catch (e: Exception) {
                                    imageProxy.close()
                                    ContextCompat.getMainExecutor(context).execute {
                                        isCapturing = false
                                    }
                                }
                            }

                            override fun onError(exception: ImageCaptureException) {
                                ContextCompat.getMainExecutor(context).execute {
                                    isCapturing = false
                                }
                            }
                        }
                    )
                },
                enabled = !isCapturing,
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier
                    .size(80.dp)
                    .border(4.dp, Color.White, CircleShape)
            ) {
                if (isCapturing) {
                    CircularProgressIndicator(
                        color = primaryColor,
                        modifier = Modifier.size(36.dp),
                        strokeWidth = 3.5.dp
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .size(62.dp)
                            .background(primaryColor, CircleShape)
                    )
                }
            }

            // Finish batch button (Active if at least 1 page already captured)
            if (pageCount > 0) {
                Button(
                    onClick = onFinishBatch,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(containerColor = primaryColor),
                    contentPadding = PaddingValues(0.dp),
                    modifier = Modifier
                        .size(54.dp)
                        .border(2.dp, Color.White.copy(alpha = 0.4f), CircleShape)
                ) {
                    Icon(
                        Icons.Rounded.Check,
                        contentDescription = "إنهاء وحفظ",
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                }
            } else {
                Spacer(modifier = Modifier.size(54.dp))
            }
        }
    }
}
