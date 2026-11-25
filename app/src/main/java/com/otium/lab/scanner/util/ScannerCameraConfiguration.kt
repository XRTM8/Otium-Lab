package com.otium.lab.scanner.util

import android.util.Rational
import android.view.Surface
import androidx.camera.core.ViewPort
import androidx.camera.view.PreviewView

fun scannerViewPort(previewView: PreviewView): ViewPort = previewView.viewPort
    ?: ViewPort.Builder(
        Rational(previewView.width, previewView.height),
        previewView.display?.rotation ?: Surface.ROTATION_0
    ).build()
