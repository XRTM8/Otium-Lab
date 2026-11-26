package com.otium.lab.pdf.model

import androidx.compose.ui.graphics.Color

enum class PageColorMode(
    val labelAr: String,
    val containerBg: Color,
    val barBg: Color,
    val textColor: Color,
    val cardBg: Color
) {
    ORIGINAL(
        labelAr = "أبيض طبيعي",
        containerBg = Color(0xFFF1F5F9),
        barBg = Color(0xFFF8FAFC),
        textColor = Color(0xFF0F172A),
        cardBg = Color.White
    ),
    AMOLED_BLACK(
        labelAr = "أموليـد أسود",
        containerBg = Color(0xFF0A0B0E),
        barBg = Color(0xFF14151B),
        textColor = Color(0xFFF5F6F8),
        cardBg = Color.Black
    ),
    SEPIA(
        labelAr = "سيبيا ورقي",
        containerBg = Color(0xFFFBF7EE),
        barBg = Color(0xFFF4EBD9),
        textColor = Color(0xFF2C2416),
        cardBg = Color(0xFFFBF7EE)
    )
}
