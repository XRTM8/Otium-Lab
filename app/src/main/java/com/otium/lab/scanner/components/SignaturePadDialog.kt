package com.otium.lab.scanner.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint as AndroidPaint
import android.graphics.Path as AndroidPath
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.roundToInt

@Composable
fun SignaturePadDialog(
    onConfirm: (Bitmap) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val sigDir = remember { File(context.filesDir, "signatures").apply { if (!exists()) mkdirs() } }
    var savedFiles by remember { mutableStateOf(sigDir.listFiles()?.sortedByDescending { it.lastModified() }?.toList().orEmpty()) }
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var currentStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var selectedColor by remember { mutableStateOf(Color(0xFF0F172A)) }
    var canvasWidth by remember { mutableIntStateOf(600) }
    var canvasHeight by remember { mutableIntStateOf(260) }

    val inkColors = listOf(
        Color(0xFF0F172A), // Ink Black
        Color(0xFF1D4ED8), // Royal Blue
        Color(0xFFB91C1C)  // Stamp Red
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("التوقيع الإلكتروني", fontSize = 18.sp, fontWeight = FontWeight.Bold)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (savedFiles.isNotEmpty()) {
                    Text("التوقيعات المحفوظة (اضغط للاختيار):", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(savedFiles, key = { it.absolutePath }) { file ->
                            val bmp = remember(file) { BitmapFactory.decodeFile(file.absolutePath) }
                            if (bmp != null) {
                                Box(
                                    modifier = Modifier
                                        .size(width = 96.dp, height = 48.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color.White)
                                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
                                        .clickable { onConfirm(bmp) }
                                ) {
                                    Image(
                                        bitmap = bmp.asImageBitmap(),
                                        contentDescription = "توقيع محفوظ",
                                        contentScale = ContentScale.Fit,
                                        modifier = Modifier.fillMaxSize().padding(4.dp)
                                    )
                                    IconButton(
                                        onClick = {
                                            file.delete()
                                            savedFiles = sigDir.listFiles()?.sortedByDescending { it.lastModified() }?.toList().orEmpty()
                                        },
                                        modifier = Modifier.align(Alignment.TopEnd).size(20.dp)
                                    ) {
                                        Icon(Icons.Rounded.Delete, contentDescription = "حذف", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(14.dp))
                                    }
                                }
                            }
                        }
                    }
                }
                Text("أو ارسم توقيعاً جديداً:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("لون الحبر:", fontSize = 12.sp)
                    inkColors.forEach { c ->
                        Box(
                            modifier = Modifier
                                .size(26.dp)
                                .clip(CircleShape)
                                .background(c)
                                .border(
                                    width = if (selectedColor == c) 3.dp else 1.dp,
                                    color = if (selectedColor == c) MaterialTheme.colorScheme.primary else Color.Gray,
                                    shape = CircleShape
                                )
                                .clickable { selectedColor = c }
                        )
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(170.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                ) {
                    Canvas(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                canvasWidth = size.width.coerceAtLeast(1)
                                canvasHeight = size.height.coerceAtLeast(1)
                                detectDragGestures(
                                    onDragStart = { offset -> currentStroke = listOf(offset) },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        currentStroke = currentStroke + change.position
                                    },
                                    onDragEnd = {
                                        if (currentStroke.size > 1) strokes.add(currentStroke)
                                        currentStroke = emptyList()
                                    },
                                    onDragCancel = { currentStroke = emptyList() }
                                )
                            }
                    ) {
                        val strokeStyle = Stroke(width = 6f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                        (strokes + listOf(currentStroke)).forEach { pts ->
                            if (pts.size > 1) {
                                val p = Path().apply {
                                    moveTo(pts.first().x, pts.first().y)
                                    pts.drop(1).forEach { lineTo(it.x, it.y) }
                                }
                                drawPath(p, color = selectedColor, style = strokeStyle)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = strokes.isNotEmpty(),
                onClick = {
                    val bmp = renderSignatureBitmap(strokes, canvasWidth, canvasHeight, selectedColor.toArgb())
                    runCatching {
                        val out = File(sigDir, "sig_${UUID.randomUUID()}.png")
                        FileOutputStream(out).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    }
                    onConfirm(bmp)
                }
            ) { Text("حفظ ووضع على الصفحة") }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { strokes.clear(); currentStroke = emptyList() }) {
                    Text("مسح")
                }
                TextButton(onClick = onDismiss) {
                    Text("إلغاء")
                }
            }
        },
        shape = RoundedCornerShape(20.dp)
    )
}

private fun renderSignatureBitmap(
    strokes: List<List<Offset>>,
    width: Int,
    height: Int,
    colorArgb: Int
): Bitmap {
    val bmp = Bitmap.createBitmap(width.coerceAtLeast(100), height.coerceAtLeast(60), Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bmp)
    val paint = AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG).apply {
        color = colorArgb
        style = AndroidPaint.Style.STROKE
        strokeWidth = 7f
        strokeCap = AndroidPaint.Cap.ROUND
        strokeJoin = AndroidPaint.Join.ROUND
    }
    strokes.forEach { pts ->
        if (pts.size > 1) {
            val path = AndroidPath().apply {
                moveTo(pts.first().x, pts.first().y)
                pts.drop(1).forEach { lineTo(it.x, it.y) }
            }
            canvas.drawPath(path, paint)
        }
    }
    return bmp
}

@Composable
fun SignaturePlacementDialog(
    pageBitmap: Bitmap,
    signatureBitmap: Bitmap,
    onConfirm: (normX: Float, normY: Float, normW: Float) -> Unit,
    onDismiss: () -> Unit
) {
    var boxSize by remember { mutableStateOf(IntSize(1, 1)) }
    var normX by remember { mutableFloatStateOf(0.62f) }
    var normY by remember { mutableFloatStateOf(0.78f) }
    var normW by remember { mutableFloatStateOf(0.28f) }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Scaffold(
            containerColor = Color(0xFF0B111E),
            topBar = {
                Row(
                    modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Rounded.Close, contentDescription = "إلغاء", tint = Color.White)
                    }
                    Text("اسحب التوقيع للمكان المطلوب", color = Color.White, fontWeight = FontWeight.Bold)
                    Button(onClick = { onConfirm(normX, normY, normW) }) {
                        Text("تثبيت")
                    }
                }
            },
            bottomBar = {
                Surface(color = Color.Black.copy(alpha = 0.75f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("الحجم", color = Color.White, fontSize = 12.sp)
                        Spacer(Modifier.width(12.dp))
                        Slider(
                            value = normW,
                            onValueChange = { normW = it.coerceIn(0.12f, 0.65f) },
                            valueRange = 0.12f..0.65f,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        ) { padding ->
            Box(
                modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                val aspect = (pageBitmap.width.toFloat() / pageBitmap.height.toFloat().coerceAtLeast(1f)).coerceIn(0.2f, 5f)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(aspect)
                        .onSizeChanged { boxSize = it }
                ) {
                    Image(
                        bitmap = pageBitmap.asImageBitmap(),
                        contentDescription = null,
                        contentScale = ContentScale.FillBounds,
                        modifier = Modifier.fillMaxSize()
                    )
                    val sigAspect = signatureBitmap.height.toFloat() / signatureBitmap.width.toFloat().coerceAtLeast(1f)
                    val sigPxW = (boxSize.width * normW).roundToInt().coerceAtLeast(30)
                    val sigPxH = (sigPxW * sigAspect).roundToInt().coerceAtLeast(20)
                    val posX = (normX * boxSize.width).roundToInt().coerceIn(0, (boxSize.width - sigPxW).coerceAtLeast(0))
                    val posY = (normY * boxSize.height).roundToInt().coerceIn(0, (boxSize.height - sigPxH).coerceAtLeast(0))

                    Image(
                        bitmap = signatureBitmap.asImageBitmap(),
                        contentDescription = "التوقيع",
                        contentScale = ContentScale.FillBounds,
                        modifier = Modifier
                            .offset { IntOffset(posX, posY) }
                            .size(
                                width = with(androidx.compose.ui.platform.LocalDensity.current) { sigPxW.toDp() },
                                height = with(androidx.compose.ui.platform.LocalDensity.current) { sigPxH.toDp() }
                            )
                            .border(1.5.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp))
                            .pointerInput(boxSize) {
                                detectDragGestures { change, drag ->
                                    change.consume()
                                    if (boxSize.width > 0 && boxSize.height > 0) {
                                        normX = (normX + drag.x / boxSize.width).coerceIn(0f, 1f - normW)
                                        normY = (normY + drag.y / boxSize.height).coerceIn(0f, 0.92f)
                                    }
                                }
                            }
                    )
                }
            }
        }
    }
}
