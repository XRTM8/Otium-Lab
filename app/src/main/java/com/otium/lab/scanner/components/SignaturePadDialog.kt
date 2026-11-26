package com.otium.lab.scanner.components

import android.graphics.Bitmap
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint as AndroidPaint
import android.graphics.Path as AndroidPath
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SignaturePadDialog(
    onConfirm: (Bitmap) -> Unit,
    onDismiss: () -> Unit
) {
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
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("ارسم توقيعك بالأسفل لإدراجه في الصفحة:", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    onConfirm(bmp)
                }
            ) { Text("إدراج التوقيع") }
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
