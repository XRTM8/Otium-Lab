package com.otium.lab.scanner

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.InputStream
import java.util.concurrent.Executors

@Composable
fun CameraScannerScreen(
    pageCount: Int = 0,
    onImageCaptured: (ByteArray) -> Unit,
    onFinishBatch: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
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
                val bytes = input?.readBytes()
                input?.close()
                if (bytes != null && bytes.isNotEmpty()) {
                    onImageCaptured(bytes)
                }
            } catch (_: Exception) {}
        }
    }

    if (!hasCameraPermission) {
        Box(
            modifier = Modifier.fillMaxSize().background(Color(0xFF0F172A)).padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Rounded.CameraAlt, contentDescription = null, tint = Color(0xFFC29B38), modifier = Modifier.size(56.dp))
                Spacer(modifier = Modifier.height(16.dp))
                Text("يتطلب ماسح المستندات إذن الكاميرا", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                Text("يرجى منح الإذن للتمكن من مسح الكتب والمستندات الورقية ضوئياً", color = Color.Gray, fontSize = 13.sp)
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC29B38)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("منح إذن الكاميرا", fontWeight = FontWeight.Bold)
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

    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        // Camera Preview
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }

                    val capture = ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setTargetRotation(previewView.display?.rotation ?: 0)
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

                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        // Modern Document Corner Guides Overlay
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp, vertical = 95.dp)
        ) {
            val strokeWidth = 3.5.dp.toPx()
            val cornerLength = 32.dp.toPx()
            val color = Color(0xFFE5B842)

            val w = size.width
            val h = size.height

            // Top-Left corner
            drawLine(color, Offset(0f, 0f), Offset(cornerLength, 0f), strokeWidth)
            drawLine(color, Offset(0f, 0f), Offset(0f, cornerLength), strokeWidth)

            // Top-Right corner
            drawLine(color, Offset(w, 0f), Offset(w - cornerLength, 0f), strokeWidth)
            drawLine(color, Offset(w, 0f), Offset(w, cornerLength), strokeWidth)

            // Bottom-Left corner
            drawLine(color, Offset(0f, h), Offset(cornerLength, h), strokeWidth)
            drawLine(color, Offset(0f, h), Offset(0f, h - cornerLength), strokeWidth)

            // Bottom-Right corner
            drawLine(color, Offset(w, h), Offset(w - cornerLength, h), strokeWidth)
            drawLine(color, Offset(w, h), Offset(w, h - cornerLength), strokeWidth)
        }

        // Top Controls Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onClose,
                modifier = Modifier.background(Color.Black.copy(alpha = 0.5f), CircleShape)
            ) {
                Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "رجوع", tint = Color.White)
            }

            Text(
                text = if (pageCount > 0) "تم التقاط $pageCount صفحة" else "وجه الكاميرا نحو المستند",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                    .padding(horizontal = 14.dp, vertical = 6.dp)
            )

            IconButton(
                onClick = {
                    val cam = camera
                    if (cam != null && cam.cameraInfo.hasFlashUnit()) {
                        isFlashOn = !isFlashOn
                        cam.cameraControl.enableTorch(isFlashOn)
                    }
                },
                modifier = Modifier.background(Color.Black.copy(alpha = 0.5f), CircleShape)
            ) {
                Icon(
                    imageVector = if (isFlashOn) Icons.Rounded.FlashOn else Icons.Rounded.FlashOff,
                    contentDescription = "الفلاش",
                    tint = if (isFlashOn) Color(0xFFE5B842) else Color.White
                )
            }
        }

        // Bottom Controls Bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 24.dp, start = 28.dp, end = 28.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Import from Gallery
            IconButton(
                onClick = { galleryLauncher.launch("image/*") },
                modifier = Modifier
                    .size(52.dp)
                    .background(Color.White.copy(alpha = 0.2f), CircleShape)
            ) {
                Icon(Icons.Rounded.PhotoLibrary, contentDescription = "معرض الصور", tint = Color.White)
            }

            // Capture Shutter Button
            Button(
                onClick = {
                    val capture = imageCapture ?: return@Button
                    if (isCapturing) return@Button
                    isCapturing = true

                    capture.takePicture(
                        cameraExecutor,
                        object : ImageCapture.OnImageCapturedCallback() {
                            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                                val buffer = imageProxy.planes[0].buffer
                                val bytes = ByteArray(buffer.remaining())
                                buffer.get(bytes)
                                imageProxy.close()
                                ContextCompat.getMainExecutor(context).execute {
                                    isCapturing = false
                                    onImageCaptured(bytes)
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
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                contentPadding = PaddingValues(0.dp),
                modifier = Modifier
                    .size(76.dp)
                    .border(4.dp, Color(0xFFE5B842), CircleShape)
            ) {
                if (isCapturing) {
                    CircularProgressIndicator(color = Color(0xFFE5B842), modifier = Modifier.size(32.dp), strokeWidth = 3.dp)
                } else {
                    Box(
                        modifier = Modifier
                            .size(60.dp)
                            .background(Color(0xFFE5B842), CircleShape)
                    )
                }
            }

            // Finish Batch Button (if at least 1 page scanned)
            if (pageCount > 0) {
                IconButton(
                    onClick = onFinishBatch,
                    modifier = Modifier
                        .size(52.dp)
                        .background(Color(0xFFE5B842), CircleShape)
                ) {
                    Icon(Icons.Rounded.Check, contentDescription = "إنهاء", tint = Color.Black)
                }
            } else {
                Spacer(modifier = Modifier.size(52.dp))
            }
        }
    }
}
