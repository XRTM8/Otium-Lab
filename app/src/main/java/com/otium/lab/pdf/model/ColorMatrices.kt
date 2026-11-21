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

val SepiaColorMatrix = ColorMatrix(
    floatArrayOf(
        0.393f, 0.769f, 0.189f, 0f, 0f,
        0.349f, 0.686f, 0.168f, 0f, 0f,
        0.272f, 0.534f, 0.131f, 0f, 0f,
        0f,     0f,     0f,     1f, 0f
    )
)
