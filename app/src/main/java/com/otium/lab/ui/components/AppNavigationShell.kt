package com.otium.lab.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
    SCANNER("الماسح", Icons.Rounded.CameraAlt),
    SETTINGS("الإعدادات", Icons.Rounded.Settings)
}

@Composable
fun AppNavigationShell(
    currentDestination: AppDestination,
    isLandscape: Boolean,
    onSelectDestination: (AppDestination) -> Unit,
    content: @Composable () -> Unit
) {
    if (isLandscape) {
        Row(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            NavigationRail(
                containerColor = MaterialTheme.colorScheme.surface,
                header = { Spacer(modifier = Modifier.height(6.dp)) }
            ) {
                AppDestination.entries.forEach { destination ->
                    val isSelected = currentDestination == destination
                    NavigationRailItem(
                        selected = isSelected,
                        onClick = { onSelectDestination(destination) },
                        icon = {
                            Icon(destination.icon, contentDescription = destination.labelAr, modifier = Modifier.size(22.dp))
                        },
                        label = {
                            Text(
                                destination.labelAr,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                fontSize = 11.sp
                            )
                        },
                        colors = NavigationRailItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    )
                }
            }
            Box(modifier = Modifier.weight(1f).fillMaxHeight()) { content() }
        }
    } else {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp
                ) {
                    AppDestination.entries.forEach { destination ->
                        val isSelected = currentDestination == destination
                        NavigationBarItem(
                            selected = isSelected,
                            onClick = { onSelectDestination(destination) },
                            icon = {
                                Icon(destination.icon, contentDescription = destination.labelAr, modifier = Modifier.size(24.dp))
                            },
                            label = {
                                Text(
                                    destination.labelAr,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 12.sp
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }
        ) { paddingValues ->
            Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) { content() }
        }
    }
}
