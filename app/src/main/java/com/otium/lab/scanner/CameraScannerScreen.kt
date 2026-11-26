package com.otium.lab.scanner

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.otium.lab.scanner.components.ScannerBottomBar
import com.otium.lab.scanner.components.ScannerPermissionGate
import com.otium.lab.scanner.components.ScannerTopBar
import com.otium.lab.scanner.components.ScannerViewfinder
import com.otium.lab.scanner.model.NormalizedQuad
import com.otium.lab.scanner.util.ImageProcessingUtils
import com.otium.lab.scanner.util.DocumentEdgeDetector
import com.otium.lab.scanner.util.ScannerLiveAnalyzer
import com.otium.lab.scanner.util.captureScannerPhoto
import com.otium.lab.scanner.util.installScannerTapToFocus
import com.otium.lab.scanner.util.scannerViewPort
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors
import kotlin.math.hypot

@Composable
fun CameraScannerScreen(
    pageCount: Int = 0,
    onImageCaptured: (ByteArray) -> Unit,
    onFinishBatch: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val primaryColor = MaterialTheme.colorScheme.primary
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { hasCameraPermission = it }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch(Dispatchers.IO) {
                val processed = ImageProcessingUtils.processUriImage(context, uri)
                if (processed != null) withContext(Dispatchers.Main) { onImageCaptured(processed) }
            }
        }
    }

    if (!hasCameraPermission) {
        ScannerPermissionGate(primaryColor = primaryColor, onRequestPermission = {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        })
        return
    }

    var cameraProvider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isFlashOn by remember { mutableStateOf(false) }
    var isCapturing by remember { mutableStateOf(false) }
    var showShutterFlash by remember { mutableStateOf(false) }
    var autoCaptureEnabled by remember { mutableStateOf(true) }
    var smoothedQuad by remember { mutableStateOf<NormalizedQuad?>(null) }
    var stabilityProgress by remember { mutableFloatStateOf(0f) }
    var lastAutoCaptureTime by remember { mutableLongStateOf(0L) }
    var analysisSize by remember { mutableStateOf(Pair(1, 1)) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }

    fun triggerCapture() {
        val capture = imageCapture ?: return
        if (isCapturing) return
        isCapturing = true
        stabilityProgress = 0f
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        scope.launch { showShutterFlash = true; delay(70); showShutterFlash = false }
        captureScannerPhoto(context, scope, capture) { bytes ->
            isCapturing = false
            if (bytes != null) onImageCaptured(bytes)
        }
    }

    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }

    LaunchedEffect(hasCameraPermission, lifecycleOwner) {
        if (!hasCameraPermission) return@LaunchedEffect
        try {
            while (previewView.width == 0 || previewView.height == 0) withFrameNanos { }
            val provider = withContext(Dispatchers.IO) { ProcessCameraProvider.getInstance(context).get() }
            cameraProvider = provider
            provider.unbindAll()

            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            val capture = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).build()
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(analysisExecutor, ScannerLiveAnalyzer { result, size ->
                scope.launch(Dispatchers.Main) {
                    analysisSize = size
                    val nextQuad = result?.quad
                    if (nextQuad == null) {
                        smoothedQuad = null
                        stabilityProgress = 0f
                    } else {
                        val prev = smoothedQuad
                        val nextSmooth = if (prev == null) nextQuad else smoothQuad(prev, nextQuad, 0.45f)
                        val steady = prev != null && maxCornerDrift(prev, nextQuad) < 0.028f
                        smoothedQuad = nextSmooth
                        if (autoCaptureEnabled && !isCapturing) {
                            val nextProgress = if (steady) (stabilityProgress + 0.22f).coerceAtMost(1f) else (stabilityProgress - 0.15f).coerceAtLeast(0f)
                            stabilityProgress = nextProgress
                            val now = System.currentTimeMillis()
                            if (nextProgress >= 1f && now - lastAutoCaptureTime > 2500L) {
                                lastAutoCaptureTime = now
                                triggerCapture()
                            }
                        } else {
                            stabilityProgress = 0f
                        }
                    }
                }
            })
            val cameraSelector = when {
                provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                else -> throw IllegalStateException("لا توجد كاميرا متاحة")
            }
            val group = UseCaseGroup.Builder().addUseCase(preview).addUseCase(capture).addUseCase(analysis)
            group.setViewPort(scannerViewPort(previewView))
            camera = provider.bindToLifecycle(lifecycleOwner, cameraSelector, group.build())
            imageCapture = capture
        } catch (t: Throwable) {
            Log.e("CameraScanner", "Failed to bind camera lifecycle", t)
            Toast.makeText(context, "تعذر تشغيل الكاميرا: ${t.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
        }
    }

    DisposableEffect(lifecycleOwner) {
        onDispose {
            try { cameraProvider?.unbindAll() } catch (_: Throwable) {}
            analysisExecutor.shutdown()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = {
                installScannerTapToFocus(previewView) { camera }
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        ScannerViewfinder(
            primaryColor = primaryColor,
            detectedQuad = smoothedQuad,
            analysisWidth = analysisSize.first,
            analysisHeight = analysisSize.second,
            stabilityProgress = if (autoCaptureEnabled) stabilityProgress else 0f,
            modifier = Modifier.fillMaxSize()
        )

        AnimatedVisibility(
            visible = showShutterFlash,
            enter = fadeIn(tween(50)),
            exit = fadeOut(tween(150)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.White))
        }

        val liveStatus = when {
            isCapturing -> "جارٍ الالتقاط..."
            autoCaptureEnabled && stabilityProgress > 0.35f -> "ثبّت الجهاز... جارٍ الالتقاط التلقائي"
            else -> null
        }

        ScannerTopBar(
            pageCount = pageCount,
            isFlashOn = isFlashOn,
            primaryColor = primaryColor,
            statusText = liveStatus,
            onClose = onClose,
            onToggleFlash = {
                camera?.takeIf { it.cameraInfo.hasFlashUnit() }?.let { cam ->
                    isFlashOn = !isFlashOn; cam.cameraControl.enableTorch(isFlashOn)
                }
            },
            modifier = Modifier.align(Alignment.TopCenter)
        )

        Column(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = Color.Black.copy(alpha = 0.62f),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.18f)),
                modifier = Modifier.padding(bottom = 14.dp)
            ) {
                Row(modifier = Modifier.padding(4.dp)) {
                    CaptureModeChip(
                        label = "التقاط تلقائي",
                        selected = autoCaptureEnabled,
                        primaryColor = primaryColor,
                        onClick = { autoCaptureEnabled = true }
                    )
                    CaptureModeChip(
                        label = "يدوياً",
                        selected = !autoCaptureEnabled,
                        primaryColor = primaryColor,
                        onClick = { autoCaptureEnabled = false; stabilityProgress = 0f }
                    )
                }
            }

            ScannerBottomBar(
                pageCount = pageCount,
                isCapturing = isCapturing,
                primaryColor = primaryColor,
                onOpenGallery = { galleryLauncher.launch("image/*") },
                onCapture = { triggerCapture() },
                onFinishBatch = onFinishBatch
            )
        }
    }
}

@Composable
private fun CaptureModeChip(
    label: String,
    selected: Boolean,
    primaryColor: Color,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(if (selected) primaryColor else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 7.dp)
    ) {
        Text(
            text = label,
            color = Color.White,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium
        )
    }
}

private fun smoothQuad(prev: NormalizedQuad, next: NormalizedQuad, alpha: Float): NormalizedQuad {
    fun lerp(a: Offset, b: Offset) = Offset(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha)
    return NormalizedQuad(
        topLeft = lerp(prev.topLeft, next.topLeft),
        topRight = lerp(prev.topRight, next.topRight),
        bottomRight = lerp(prev.bottomRight, next.bottomRight),
        bottomLeft = lerp(prev.bottomLeft, next.bottomLeft)
    )
}

private fun maxCornerDrift(a: NormalizedQuad, b: NormalizedQuad): Float {
    fun dist(p1: Offset, p2: Offset) = hypot((p1.x - p2.x).toDouble(), (p1.y - p2.y).toDouble()).toFloat()
    return maxOf(
        dist(a.topLeft, b.topLeft),
        dist(a.topRight, b.topRight),
        dist(a.bottomRight, b.bottomRight),
        dist(a.bottomLeft, b.bottomLeft)
    )
}
