package com.otium.lab.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

enum class AppDestination(val labelAr: String, val icon: ImageVector) {
    LIBRARY("المكتبة", Icons.Rounded.FolderOpen),
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
        Row(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
        ) {
            NavigationRail(
                containerColor = MaterialTheme.colorScheme.surface,
                header = { Spacer(modifier = Modifier.height(8.dp)) }
            ) {
                AppDestination.entries.forEach { destination ->
                    val isSelected = currentDestination == destination
                    NavigationRailItem(
                        selected = isSelected,
                        onClick = { onSelectDestination(destination) },
                        icon = {
                            Icon(
                                imageVector = destination.icon,
                                contentDescription = destination.labelAr,
                                modifier = Modifier.size(22.dp)
                            )
                        },
                        label = {
                            Text(
                                text = destination.labelAr,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
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
            VerticalDivider(thickness = 1.dp, color = MaterialTheme.colorScheme.outlineVariant)
            Box(modifier = Modifier.weight(1f).fillMaxHeight()) { content() }
        }
    } else {
        // Portrait uses top-bar navigation instead of a wasteful 2-tab bottom bar
        Box(modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
