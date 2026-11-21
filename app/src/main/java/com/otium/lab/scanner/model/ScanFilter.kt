package com.otium.lab.scanner.model

enum class ScanFilter(val labelAr: String, val mode: String) {
    MAGIC_COLOR("لون سحري", "magic_color"),
    CLEAN_WHITE("ورقة بيضاء", "clean_white"),
    BLACK_WHITE("أبيض وأسود", "bw"),
    ORIGINAL("الأصل", "original")
}
