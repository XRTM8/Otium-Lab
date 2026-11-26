package com.otium.lab.pdf.model

import androidx.compose.ui.graphics.ColorMatrix

val InvertColorMatrix = ColorMatrix(
    floatArrayOf(
        -1f,  0f,  0f,  0f, 255f,
         0f, -1f,  0f,  0f, 255f,
         0f,  0f, -1f,  0f, 255f,
         0f,  0f,  0f,  1f,   0f
    )
)

// Warm parchment tint that preserves crisp black ink while warming white paper
val SepiaColorMatrix = ColorMatrix(
    floatArrayOf(
        1.00f, 0.00f, 0.00f, 0f,  0f,
        0.00f, 0.94f, 0.00f, 0f,  0f,
        0.00f, 0.00f, 0.84f, 0f,  0f,
        0.00f, 0.00f, 0.00f, 1f,  0f
    )
)
