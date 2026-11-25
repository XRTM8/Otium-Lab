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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.otium.lab.scanner.components.ScannerBottomBar
import com.otium.lab.scanner.components.ScannerPermissionGate
import com.otium.lab.scanner.components.ScannerTopBar
import com.otium.lab.scanner.components.ScannerViewfinder
import com.otium.lab.scanner.util.ImageProcessingUtils
import com.otium.lab.scanner.util.DocumentEdgeDetector
import com.otium.lab.scanner.util.ScannerLiveAnalyzer
import com.otium.lab.scanner.util.captureScannerPhoto
import com.otium.lab.scanner.util.installScannerTapToFocus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.Executors

@Composable
fun CameraScannerScreen(
    pageCount: Int = 0,
    onImageCaptured: (ByteArray) -> Unit,
    onFinishBatch: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
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
    var liveDetection by remember { mutableStateOf<DocumentEdgeDetector.Detection?>(null) }
    var analysisSize by remember { mutableStateOf(Pair(1, 1)) }
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }

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
                    liveDetection = result
                    analysisSize = size
                }
            })
            val cameraSelector = when {
                provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                else -> throw IllegalStateException("لا توجد كاميرا متاحة")
            }
            val group = UseCaseGroup.Builder().addUseCase(preview).addUseCase(capture).addUseCase(analysis)
            previewView.viewPort?.let { group.setViewPort(it) }
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
            detectedQuad = liveDetection?.quad,
            analysisWidth = analysisSize.first,
            analysisHeight = analysisSize.second,
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

        ScannerTopBar(
            pageCount = pageCount,
            isFlashOn = isFlashOn,
            primaryColor = primaryColor,
            onClose = onClose,
            onToggleFlash = {
                camera?.takeIf { it.cameraInfo.hasFlashUnit() }?.let { cam ->
                    isFlashOn = !isFlashOn; cam.cameraControl.enableTorch(isFlashOn)
                }
            },
            modifier = Modifier.align(Alignment.TopCenter)
        )

        ScannerBottomBar(
            pageCount = pageCount,
            isCapturing = isCapturing,
            primaryColor = primaryColor,
            onOpenGallery = { galleryLauncher.launch("image/*") },
            onCapture = {
                val capture = imageCapture ?: return@ScannerBottomBar
                if (isCapturing) return@ScannerBottomBar
                isCapturing = true
                scope.launch { showShutterFlash = true; delay(70); showShutterFlash = false }
                captureScannerPhoto(context, scope, capture) { bytes ->
                    isCapturing = false
                    if (bytes != null) onImageCaptured(bytes)
                }
            },
            onFinishBatch = onFinishBatch,
            modifier = Modifier.align(Alignment.BottomCenter)
        )
    }
}
