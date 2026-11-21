package com.otium.lab.scanner

import android.Manifest
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
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
                    val bmp = android.graphics.BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.size)
                    if (bmp != null) {
                        val maxDim = maxOf(bmp.width, bmp.height)
                        val finalBmp = if (maxDim > 2048) {
                            val scale = 2048f / maxDim
                            Bitmap.createScaledBitmap(bmp, (bmp.width * scale).toInt(), (bmp.height * scale).toInt(), true)
                        } else bmp
                        val out = ByteArrayOutputStream()
                        finalBmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
                        onImageCaptured(out.toByteArray())
                    }
                }
            } catch (_: Exception) {}
        }
    }

    if (!hasCameraPermission) {
        ScannerPermissionGate(
            primaryColor = primaryColor,
            onRequestPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) }
        )
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

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        // High-Speed 60 FPS Camera Preview with Auto-Focus
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx).apply {
                    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    try {
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }

                        val resolutionSelector = ResolutionSelector.Builder()
                            .setResolutionStrategy(
                                ResolutionStrategy(
                                    Size(1920, 1440),
                                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                                )
                            )
                            .build()

                        val capture = ImageCapture.Builder()
                            .setResolutionSelector(resolutionSelector)
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                            .build()

                        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

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

        // 1. Animated Viewfinder Frame & Horizon Leveler
        ScannerViewfinder(primaryColor = primaryColor)

        // 2. Shutter Flash Feedback Animation
        AnimatedVisibility(
            visible = showShutterFlash,
            enter = fadeIn(animationSpec = tween(50)),
            exit = fadeOut(animationSpec = tween(150)),
            modifier = Modifier.fillMaxSize()
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.White))
        }

        // 3. Top Controls Bar
        ScannerTopBar(
            pageCount = pageCount,
            isFlashOn = isFlashOn,
            primaryColor = primaryColor,
            onClose = onClose,
            onToggleFlash = {
                val cam = camera
                if (cam != null && cam.cameraInfo.hasFlashUnit()) {
                    isFlashOn = !isFlashOn
                    cam.cameraControl.enableTorch(isFlashOn)
                }
            }
        )

        // 4. Bottom Controls Bar
        ScannerBottomBar(
            pageCount = pageCount,
            isCapturing = isCapturing,
            primaryColor = primaryColor,
            onOpenGallery = { galleryLauncher.launch("image/*") },
            onCapture = {
                val capture = imageCapture ?: return@ScannerBottomBar
                if (isCapturing) return@ScannerBottomBar
                isCapturing = true

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

                                val rotatedBitmap = if (rotationDegrees != 0) {
                                    val matrix = Matrix().apply { postRotate(rotationDegrees.toFloat()) }
                                    val rot = Bitmap.createBitmap(rawBitmap, 0, 0, rawBitmap.width, rawBitmap.height, matrix, true)
                                    if (rot != rawBitmap) rawBitmap.recycle()
                                    rot
                                } else rawBitmap

                                val maxDim = maxOf(rotatedBitmap.width, rotatedBitmap.height)
                                val finalBitmap = if (maxDim > 2048) {
                                    val scale = 2048f / maxDim
                                    val scaledW = (rotatedBitmap.width * scale).toInt()
                                    val scaledH = (rotatedBitmap.height * scale).toInt()
                                    val scaled = Bitmap.createScaledBitmap(rotatedBitmap, scaledW, scaledH, true)
                                    if (scaled != rotatedBitmap) rotatedBitmap.recycle()
                                    scaled
                                } else rotatedBitmap

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
            onFinishBatch = onFinishBatch
        )
    }
}
