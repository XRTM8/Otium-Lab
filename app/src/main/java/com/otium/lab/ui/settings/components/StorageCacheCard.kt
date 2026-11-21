package com.otium.lab.ui.settings.components

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CleaningServices
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.library.DocumentStore

@Composable
fun StorageCacheCard(
    documentStore: DocumentStore,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var storageBytes by remember { mutableLongStateOf(documentStore.getStorageUsageBytes()) }

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        modifier = modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Rounded.Storage,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "التخزين والذاكرة المؤقتة",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("البيانات والذاكرة المخزنة", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val formattedSize = if (storageBytes > 1024 * 1024) {
                        String.format("%.1f ميغابايت", storageBytes / (1024.0 * 1024.0))
                    } else {
                        String.format("%.1f كيلوبايت", storageBytes / 1024.0)
                    }
                    Text(formattedSize, fontSize = 15.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }

                OutlinedButton(
                    onClick = {
                        documentStore.clearTemporaryCache()
                        storageBytes = documentStore.getStorageUsageBytes()
                        Toast.makeText(context, "تم تفريغ الذاكرة المؤقتة بنجاح", Toast.LENGTH_SHORT).show()
                    },
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Rounded.CleaningServices, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("تفريغ المؤقت", fontSize = 12.sp)
                }
            }
        }
    }
}
