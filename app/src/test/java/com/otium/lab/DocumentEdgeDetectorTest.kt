package com.otium.lab

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import com.otium.lab.scanner.util.DocumentEdgeDetector
import com.otium.lab.scanner.util.ImageProcessingUtils
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class DocumentEdgeDetectorTest {
    @Test fun detectsTiltedPage() {
        val bitmap = Bitmap.createBitmap(600, 800, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(43, 57, 68))
        val path = Path().apply {
            moveTo(115f, 130f)
            lineTo(480f, 100f)
            lineTo(510f, 690f)
            lineTo(95f, 715f)
            close()
        }
        canvas.drawPath(path, Paint().apply { color = Color.WHITE; isAntiAlias = true })
        val result = DocumentEdgeDetector.detect(bitmap)
        assertNotNull(result)
        val quad = result!!.quad
        assertTrue(quad.isValid())
        assertTrue(kotlin.math.abs(quad.topLeft.x - 115f / 600f) < .12f)
        assertTrue(kotlin.math.abs(quad.bottomRight.y - 690f / 800f) < .12f)
        bitmap.recycle()
    }

    @Test fun rejectsUniformImage() {
        val bitmap = Bitmap.createBitmap(600, 800, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.WHITE)
        assertNull(DocumentEdgeDetector.detect(bitmap))
        bitmap.recycle()
    }

    @Test fun detectsPageWithBrokenEdgesAndBackgroundLines() {
        val bitmap = Bitmap.createBitmap(600, 800, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.rgb(37, 42, 49))
        val paint = Paint().apply { color = Color.rgb(100, 105, 111); strokeWidth = 8f }
        canvas.drawLine(0f, 110f, 600f, 110f, paint)
        canvas.drawLine(540f, 0f, 540f, 800f, paint)
        val page = Path().apply {
            moveTo(125f, 165f)
            lineTo(460f, 175f)
            lineTo(490f, 680f)
            lineTo(105f, 700f)
            lineTo(115f, 500f)
            close()
        }
        canvas.drawPath(page, Paint().apply { color = Color.rgb(222, 219, 207); isAntiAlias = true })
        paint.color = Color.DKGRAY
        paint.strokeWidth = 3f
        for (y in 300..550 step 25) canvas.drawLine(210f, y.toFloat(), 400f, y.toFloat(), paint)
        val result = DocumentEdgeDetector.detect(bitmap)
        assertNotNull(result)
        assertTrue(result!!.quad.isValid())
        assertTrue(kotlin.math.abs(result.quad.topLeft.x - 125f / 600f) < .13f)
        assertTrue(kotlin.math.abs(result.quad.bottomRight.y - 680f / 800f) < .13f)
        bitmap.recycle()
    }

    @Test fun appliesCaptureViewportBeforeRotation() {
        val bitmap = Bitmap.createBitmap(200, 150, Bitmap.Config.ARGB_8888)
        val cropped = ImageProcessingUtils.cropToViewPort(bitmap, Rect(100, 0, 300, 300), 400, 300)
        assertTrue(cropped.width == 100 && cropped.height == 150)
        cropped.recycle()
        bitmap.recycle()
    }
}
