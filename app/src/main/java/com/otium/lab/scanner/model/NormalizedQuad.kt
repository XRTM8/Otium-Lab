package com.otium.lab.scanner.model

import androidx.compose.ui.geometry.Offset

data class NormalizedQuad(
    val topLeft: Offset = Offset(0.05f, 0.05f),
    val topRight: Offset = Offset(0.95f, 0.05f),
    val bottomRight: Offset = Offset(0.95f, 0.95f),
    val bottomLeft: Offset = Offset(0.05f, 0.95f)
)
