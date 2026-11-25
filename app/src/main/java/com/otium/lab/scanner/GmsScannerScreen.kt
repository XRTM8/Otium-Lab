package com.otium.lab.scanner

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

@Composable
fun GmsScannerScreen(
    onPagesCaptured: (List<Uri>) -> Unit,
    onFallback: () -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    var active by remember { mutableStateOf(true) }
    DisposableEffect(Unit) { onDispose { active = false } }
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { activityResult ->
        if (!active) return@rememberLauncherForActivityResult
        if (activityResult.resultCode != Activity.RESULT_OK) {
            onCancel()
            return@rememberLauncherForActivityResult
        }
        val pages = GmsDocumentScanningResult.fromActivityResultIntent(activityResult.data)
            ?.pages?.map { it.imageUri }.orEmpty()
        if (pages.isEmpty()) {
            Toast.makeText(context, "لم تُرجع عملية المسح أي صفحة", Toast.LENGTH_LONG).show()
            onFallback()
        } else onPagesCaptured(pages)
    }

    LaunchedEffect(Unit) {
        val activity = context.findActivity()
        if (activity == null) {
            onFallback()
            return@LaunchedEffect
        }
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
            .addOnSuccessListener { sender ->
                if (active) launcher.launch(IntentSenderRequest.Builder(sender).build())
            }
            .addOnFailureListener { error ->
                if (active) {
                    Toast.makeText(context, "تعذر تشغيل الماسح المحسّن: ${error.localizedMessage ?: ""}", Toast.LENGTH_LONG).show()
                    onFallback()
                }
            }
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(20.dp))
        Text("جارٍ فتح ماسح المستندات...")
        Spacer(Modifier.height(28.dp))
        OutlinedButton(onClick = { active = false; onFallback() }) {
            Text("استخدام الكاميرا الاحتياطية")
        }
        TextButton(onClick = { active = false; onCancel() }) { Text("إلغاء") }
    }
}

private fun Context.findActivity(): Activity? {
    var current: Context? = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        current = current.baseContext
    }
    return current as? Activity
}
