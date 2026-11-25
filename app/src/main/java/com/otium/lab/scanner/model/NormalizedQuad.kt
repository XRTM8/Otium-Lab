package com.otium.lab.scanner.model

import androidx.compose.ui.geometry.Offset

data class NormalizedQuad(
    val topLeft: Offset = Offset(0.05f, 0.05f),
    val topRight: Offset = Offset(0.95f, 0.05f),
    val bottomRight: Offset = Offset(0.95f, 0.95f),
    val bottomLeft: Offset = Offset(0.05f, 0.95f)
) {
    fun isValid(): Boolean {
        val points = listOf(topLeft, topRight, bottomRight, bottomLeft)
        if (points.any { it.x !in 0f..1f || it.y !in 0f..1f }) return false
        val area = kotlin.math.abs(points.indices.sumOf { i ->
            val a = points[i]; val b = points[(i + 1) % 4]
            (a.x * b.y - b.x * a.y).toDouble()
        } / 2.0)
        if (area < 0.12) return false
        val turns = points.indices.map { i ->
            val a = points[i]; val b = points[(i + 1) % 4]; val c = points[(i + 2) % 4]
            (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
        }
        return turns.all { it > 0.001f } || turns.all { it < -0.001f }
    }
}
