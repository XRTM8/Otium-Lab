package com.otium.lab.library.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.SwapVert
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun DocumentFilterChips(
    selectedFilterIndex: Int,
    totalCount: Int,
    sortByName: Boolean,
    showSortChip: Boolean,
    onSelectFilter: (Int) -> Unit,
    onToggleSort: () -> Unit,
    modifier: Modifier = Modifier
) {
    val tabs = listOf("الكل ($totalCount)", "ممسوحة", "PDF")

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        LazyRow(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            itemsIndexed(tabs) { index, title ->
                val isSelected = selectedFilterIndex == index
                FilterChip(
                    selected = isSelected,
                    onClick = { onSelectFilter(index) },
                    shape = RoundedCornerShape(10.dp),
                    label = {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 1,
                            softWrap = false
                        )
                    },
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = isSelected,
                        borderWidth = 0.5.dp,
                        selectedBorderWidth = 0.8.dp,
                        borderColor = MaterialTheme.colorScheme.outlineVariant,
                        selectedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.55f)
                    ),
                    colors = FilterChipDefaults.filterChipColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.16f),
                        selectedLabelColor = MaterialTheme.colorScheme.onSurface
                    )
                )
            }
        }

        if (showSortChip) {
            Surface(
                onClick = onToggleSort,
                shape = RoundedCornerShape(10.dp),
                color = if (sortByName) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                border = BorderStroke(
                    1.dp,
                    if (sortByName) MaterialTheme.colorScheme.primary.copy(alpha = 0.45f)
                    else MaterialTheme.colorScheme.outlineVariant
                )
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SwapVert,
                        contentDescription = "الفرز",
                        tint = if (sortByName) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = if (sortByName) "أبجدي" else "الأحدث",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = if (sortByName) FontWeight.Bold else FontWeight.Medium,
                        color = if (sortByName) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        softWrap = false
                    )
                }
            }
        }
    }
}
