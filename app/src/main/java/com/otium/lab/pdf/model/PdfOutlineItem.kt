package com.otium.lab.pdf.model

data class PdfOutlineItem(
    val title: String,
    val pageIndex: Int,
    val level: Int = 0
)
