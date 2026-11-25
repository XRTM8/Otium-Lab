package com.otium.lab

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import com.otium.lab.scanner.util.DocumentEdgeDetector
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
}
