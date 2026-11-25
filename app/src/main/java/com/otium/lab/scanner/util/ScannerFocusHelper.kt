package com.otium.lab.scanner.util

import android.view.MotionEvent
import androidx.camera.core.Camera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.view.PreviewView
import java.util.concurrent.TimeUnit

fun installScannerTapToFocus(previewView: PreviewView, camera: () -> Camera?) {
    previewView.setOnTouchListener { view, event ->
        if (event.action == MotionEvent.ACTION_UP) {
            runCatching {
                camera()?.let { cam ->
                    val point = previewView.meteringPointFactory.createPoint(event.x, event.y)
                    val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF)
                        .setAutoCancelDuration(3, TimeUnit.SECONDS).build()
                    cam.cameraControl.startFocusAndMetering(action)
                }
            }
            view.performClick()
        }
        true
    }
}
