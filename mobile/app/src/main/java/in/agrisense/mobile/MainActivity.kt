package `in`.agrisense.mobile

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(
                primary = Color(0xFF087443), onPrimary = Color.White,
                secondary = Color(0xFF006C78), background = Color(0xFFF4F7F4),
                surface = Color(0xFFF4F7F4), onSurface = Color(0xFF18251D),
                onSurfaceVariant = Color(0xFF3D4940),
            )) { NotebookScreen() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotebookScreen(model: NotebookViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val network by model.connectivity.collectAsStateWithLifecycle()
    var adding by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    Scaffold(
        topBar = { TopAppBar(title = { Text("AgriSense", fontWeight = FontWeight.SemiBold) }, actions = {
            IconButton(onClick = { context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS)) }) {
                Icon(Icons.Default.Settings, contentDescription = "Wi-Fi settings")
            }
        }) },
        floatingActionButton = {
            if (!state.loading) ExtendedFloatingActionButton(
                onClick = { model.clearError(); adding = true },
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Soil test") },
            )
        },
    ) { insets ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(insets),
            contentPadding = PaddingValues(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 100.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                Text("Field notebook", style = MaterialTheme.typography.headlineLarge, fontFamily = FontFamily.Serif)
                Text("On this phone", color = MaterialTheme.colorScheme.secondary)
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ConnectionRow(Icons.Default.Wifi, "Wi-Fi", if (network.wifiAvailable) "Available" else "Not connected")
                    ConnectionRow(Icons.Default.Cloud, "Internet", if (network.internetValidated) "Available" else "Offline")
                    Text("IoT: Not paired", style = MaterialTheme.typography.bodyMedium)
                    Text("Backend: Not linked", style = MaterialTheme.typography.bodyMedium)
                    HorizontalDivider()
                }
            }
            item {
                Text("Soil tests", style = MaterialTheme.typography.titleLarge)
                Text("Latest 100 local records", style = MaterialTheme.typography.bodySmall)
            }
            if (state.loading) item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
            if (state.error != null && !adding) item {
                Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = model::reload, enabled = !state.loading) { Text("Retry") }
            }
            if (!state.loading && state.readings.isEmpty() && state.error == null) item {
                Icon(Icons.Default.Science, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                Text("No soil tests yet", style = MaterialTheme.typography.titleMedium)
            }
            items(state.readings, key = { it.id }) { reading ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(reading.fieldLabel, style = MaterialTheme.typography.titleMedium)
                    Text("${reading.metric.title}: ${reading.value} ${reading.metric.unit}",
                        style = MaterialTheme.typography.titleLarge)
                    Text("Manual test / Local only", color = MaterialTheme.colorScheme.secondary)
                    Text(DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM)
                        .withZone(ZoneId.systemDefault()).format(Instant.parse(reading.recordedAt)),
                        style = MaterialTheme.typography.bodySmall)
                    HorizontalDivider(modifier = Modifier.padding(top = 12.dp))
                }
            }
        }
    }
    if (adding) SoilDialog(state, onDismiss = { adding = false; model.clearError() }, onSave = { field, metric, value ->
        model.save(field, metric, value) { adding = false }
    })
}

@Composable
private fun ConnectionRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
        Text(label, modifier = Modifier.weight(1f))
        Text(value, modifier = Modifier.weight(1f), fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SoilDialog(state: NotebookState, onDismiss: () -> Unit, onSave: (String, SoilMetric, String) -> Unit) {
    var field by rememberSaveable { mutableStateOf("") }
    var value by rememberSaveable { mutableStateOf("") }
    var metricName by rememberSaveable { mutableStateOf(SoilMetric.PH.name) }
    val metric = SoilMetric.valueOf(metricName)
    AlertDialog(
        onDismissRequest = { if (!state.saving) onDismiss() },
        title = { Text("Add soil test") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(field, { field = it.take(100) }, label = { Text("Field name") },
                    singleLine = true, enabled = !state.saving, modifier = Modifier.fillMaxWidth())
                SoilMetric.entries.forEach { option ->
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        RadioButton(selected = metric == option, onClick = { metricName = option.name }, enabled = !state.saving)
                        Text(option.title)
                    }
                }
                OutlinedTextField(value, { value = it.take(20) }, label = { Text("Value (${metric.unit})") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    enabled = !state.saving, singleLine = true, modifier = Modifier.fillMaxWidth())
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !state.saving && !state.loading, onClick = { onSave(field, metric, value) }) {
                Text(if (state.saving) "Saving..." else "Save locally")
            }
        },
        dismissButton = { TextButton(enabled = !state.saving, onClick = onDismiss) { Text("Cancel") } },
    )
}