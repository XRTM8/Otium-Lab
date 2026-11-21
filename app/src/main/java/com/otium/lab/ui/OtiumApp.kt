package com.otium.lab.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Book
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.ui.components.UpdateBanner

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    HOME("الرئيسية", Icons.Rounded.Book),
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
    SCANNER("الماسح", Icons.Rounded.CameraAlt),
    SETTINGS("الإعدادات", Icons.Rounded.Settings)
}

@Composable
fun OtiumApp() {
    var currentDestination by remember { mutableStateOf(AppDestination.HOME) }

    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFFC29B38),
            background = Color(0xFFF9F7F4),
            surface = Color(0xFFFFFFFF),
            onBackground = Color(0xFF1E2124),
            onSurface = Color(0xFF1E2124),
        )
    ) {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
                    tonalElevation = 0.dp
                ) {
                    AppDestination.entries.forEach { dest ->
                        NavigationBarItem(
                            selected = currentDestination == dest,
                            onClick = { currentDestination = dest },
                            icon = { Icon(dest.icon, contentDescription = dest.labelAr) },
                            label = { Text(dest.labelAr, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = Color(0xFFC29B38),
                                selectedTextColor = Color(0xFFC29B38),
                                indicatorColor = Color(0xFFC29B38).copy(alpha = 0.12f)
                            )
                        )
                    }
                }
            }
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .background(MaterialTheme.colorScheme.background)
            ) {
                when (currentDestination) {
                    AppDestination.HOME -> HomeScreen()
                    AppDestination.LIBRARY -> PlaceholderScreen(title = "مكتبة المستندات والكتب")
                    AppDestination.SCANNER -> PlaceholderScreen(title = "ماسح المستندات فائق السرعة (CameraX)")
                    AppDestination.SETTINGS -> SettingsScreen()
                }
            }
        }
    }
}

@Composable
fun HomeScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // In-App Update Notification Banner
        UpdateBanner()

        Spacer(modifier = Modifier.weight(1f))

        Surface(
            shape = RoundedCornerShape(24.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 2.dp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp)
        ) {
            Column(
                modifier = Modifier.padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Otium Native Mobile",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "القارئ الهادئ فائق السرعة · محرك أصيل Kotlin + Rust",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
                Spacer(modifier = Modifier.height(24.dp))
                Button(
                    onClick = { /* Open file intent */ },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().height(50.dp)
                ) {
                    Icon(Icons.Rounded.FolderOpen, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("فتح مستند PDF", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }
        }

        Spacer(modifier = Modifier.weight(1.2f))
    }
}

@Composable
fun SettingsScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp)
    ) {
        Text("الإعدادات والتحديثات", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(16.dp))
        UpdateBanner()
    }
}

@Composable
fun PlaceholderScreen(title: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = title, fontSize = 16.sp, fontWeight = FontWeight.Medium, color = Color.Gray)
    }
}
