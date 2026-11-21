package com.otium.lab.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.otium.lab.update.UpdateInfo
import com.otium.lab.update.UpdateManager
import com.otium.lab.update.UpdateState
import kotlinx.coroutines.launch

@Composable
fun UpdateBanner(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val updateManager = remember { UpdateManager(context) }
    var updateState by remember { mutableStateOf<UpdateState>(UpdateState.Idle) }

    // Check updates once when banner enters composition
    LaunchedEffect(Unit) {
        updateManager.checkForUpdates().collect { state ->
            updateState = state
        }
    }

    AnimatedVisibility(
        visible = updateState !is UpdateState.Idle && updateState !is UpdateState.UpToDate,
        modifier = modifier
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f),
            border = ButtonDefaults.outlinedButtonBorder(),
            tonalElevation = 2.dp,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                when (val state = updateState) {
                    is UpdateState.Checking -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text("جارٍ التحقق من وجود تحديثات...", fontSize = 13.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }

                    is UpdateState.Available -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("تحديث متوفر (v${state.update.version})", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                                if (state.update.notes.isNotBlank()) {
                                    Text(state.update.notes.take(80) + "...", fontSize = 11.sp, color = Color.Gray)
                                }
                            }
                            Button(
                                onClick = {
                                    scope.launch {
                                        updateManager.downloadUpdate(state.update).collect { next ->
                                            updateState = next
                                        }
                                    }
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Rounded.Download, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("تحديث", color = MaterialTheme.colorScheme.onPrimary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    is UpdateState.Downloading -> {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("جارٍ تنزيل التحديث...", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
                                Text("${state.downloadedMb} / ${state.totalMb} MB", fontSize = 12.sp, color = Color.Gray)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            LinearProgressIndicator(
                                progress = { state.progress },
                                modifier = Modifier.fillMaxWidth().height(6.dp),
                                color = MaterialTheme.colorScheme.primary,
                                trackColor = MaterialTheme.colorScheme.primaryContainer
                            )
                        }
                    }

                    is UpdateState.ReadyToInstall -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
                            Spacer(modifier = Modifier.width(10.dp))
                            Text("اكتمل التحميل وهو جاهز للتثبيت", modifier = Modifier.weight(1f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1B5E20))
                            Button(
                                onClick = { updateManager.installApk(state.file) },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text("تثبيت الآن", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    is UpdateState.Error -> {
                        Text(state.message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                    }

                    else -> Unit
                }
            }
        }
    }
}
