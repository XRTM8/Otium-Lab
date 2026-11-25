package com.otium.lab.scanner.util

import android.content.Context
import android.util.Log
import android.widget.Toast
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

fun captureScannerPhoto(
    context: Context,
    scope: CoroutineScope,
    imageCapture: ImageCapture,
    onResult: (ByteArray?) -> Unit
) {
    imageCapture.takePicture(
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(imageProxy: ImageProxy) {
                scope.launch(Dispatchers.Default) {
                    try {
                        val processedBytes = ImageProcessingUtils.processImageProxy(imageProxy)
                        withContext(Dispatchers.Main) {
                            if (processedBytes != null && processedBytes.isNotEmpty()) {
                                onResult(processedBytes)
                            } else {
                                Toast.makeText(context, "تعذر معالجة الصورة الملتقطة", Toast.LENGTH_SHORT).show()
                                onResult(null)
                            }
                        }
                    } catch (t: Throwable) {
                        Log.e("CameraScanner", "Failed to process capture", t)
                        withContext(Dispatchers.Main) {
                            Toast.makeText(context, "فشل حفظ الصورة الملتقطة", Toast.LENGTH_SHORT).show()
                            onResult(null)
                        }
                    }
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e("CameraScanner", "Image capture error", exception)
                Toast.makeText(context, "تعذر التقاط الصورة: ${exception.localizedMessage ?: ""}", Toast.LENGTH_SHORT).show()
                onResult(null)
            }
        }
    )
}
