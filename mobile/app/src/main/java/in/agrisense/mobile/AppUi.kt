package `in`.agrisense.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

fun label(value: String): String = value.replace('_', ' ').replaceFirstChar { it.uppercase() }
fun encoded(value: String): String = URLEncoder.encode(value, "UTF-8")
fun displayTime(value: String): String = runCatching {
    DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(value))
}.getOrDefault(value.ifBlank { "Not recorded" })
fun dateQuery(start: String, end: String): String =
    (if (start.isNotBlank()) "&start_date=${encoded(start)}" else "") +
    (if (end.isNotBlank()) "&end_date=${encoded(end)}" else "")
fun validDates(start: String, end: String): Boolean = runCatching {
    val from = start.takeIf { it.isNotBlank() }?.let(LocalDate::parse)
    val until = end.takeIf { it.isNotBlank() }?.let(LocalDate::parse)
    from == null || until == null || !from.isAfter(until)
}.getOrDefault(false)

@Composable
fun Page(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()
        .padding(horizontal = 22.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        content()
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
fun Heading(title: String, subtitle: String = "", action: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.headlineMedium)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        action?.invoke()
    }
}

@Composable
fun ActionRow(title: String, subtitle: String, icon: ImageVector, click: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = click).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium)
        }
        Icon(Icons.AutoMirrored.Filled.ArrowForward, null, modifier = Modifier.size(18.dp))
    }
}

@Composable
fun EmptyState(title: String, detail: String, icon: ImageVector = Icons.Default.Spa,
    actionLabel: String = "", onAction: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, Modifier.size(42.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleLarge)
        Text(detail, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.fillMaxWidth())
        if (actionLabel.isNotEmpty()) FilledTonalButton(onClick = onAction) { Text(actionLabel) }
    }
}

@Composable
fun Note(text: String, warning: Boolean = false) {
    Surface(color = if (warning) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.small) {
        Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(if (warning) Icons.Default.Info else Icons.Default.CloudQueue, null, Modifier.size(20.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun Field(value: String, changed: (String) -> Unit, title: String, keyboard: KeyboardType = KeyboardType.Text,
    secret: Boolean = false, multiline: Boolean = false, enabled: Boolean = true, limit: Int = 500) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(value, { changed(it.take(limit)) }, Modifier.fillMaxWidth(), label = { Text(title) },
        singleLine = !multiline, minLines = if (multiline) 3 else 1, enabled = enabled,
        keyboardOptions = KeyboardOptions(keyboardType = if (secret) KeyboardType.Password else keyboard),
        visualTransformation = if (secret && !visible) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = if (secret) ({ IconButton(onClick = { visible = !visible }) {
            Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                if (visible) "Hide password" else "Show password") } }) else null)
}

@Composable
fun Choice(title: String, value: String, options: List<Pair<String, String>>, select: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp)) {
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.Start) {
                Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(options.firstOrNull { it.first == value }?.second ?: "Select", color = MaterialTheme.colorScheme.onSurface)
            }
            Icon(Icons.Default.ExpandMore, "Choose $title")
        }
        DropdownMenu(expanded, { expanded = false }, Modifier.heightIn(max = 360.dp)) {
            options.forEach { (key, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { select(key); expanded = false }) }
        }
    }
}

@Composable
fun rememberRemote(model: AppViewModel, path: String): RemoteData {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(path, state.revision, state.user?.text("id")) { if (path.isNotBlank()) model.load(path) }
    return state.resources[path] ?: RemoteData(loading = path.isNotBlank())
}

@Composable
fun ResourceStatus(resource: RemoteData, retry: () -> Unit) {
    if (resource.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    if (resource.cached) Note("Saved copy · ${displayTime(resource.fetchedAt)}. May be out of date.")
    resource.error?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        TextButton(onClick = retry, enabled = !resource.loading) { Icon(Icons.Default.Refresh, null); Text(" Retry") }
    }
}

@Composable
fun FarmPicker(model: AppViewModel, state: AppState) {
    val farms = rememberRemote(model, "/farms/")
    if (farms.rows().isNotEmpty()) Choice("Farm", state.farmId,
        farms.rows().map { it.text("id") to it.text("name") }, model::selectFarm)
    ResourceStatus(farms) { model.load("/farms/") }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FormSheet(title: String, model: AppViewModel, dismiss: () -> Unit, save: () -> Unit,
    saveLabel: String = "Save", content: @Composable ColumnScope.() -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    ModalBottomSheet(onDismissRequest = { if (!state.busy) { model.clearError(); dismiss() } },
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding()
            .padding(start = 22.dp, end = 22.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(title, style = MaterialTheme.typography.headlineSmall)
            content()
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(onClick = save, enabled = !state.busy, modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text(saveLabel)
            }
        }
    }
}

@Composable
fun Confirm(title: String, detail: String, busy: Boolean, dismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(onDismissRequest = { if (!busy) dismiss() }, title = { Text(title) }, text = { Text(detail) },
        confirmButton = { TextButton(onClick = confirm, enabled = !busy) { Text("Confirm") } },
        dismissButton = { TextButton(onClick = dismiss, enabled = !busy) { Text("Cancel") } })
}

@Composable
fun Pagination(page: Int, total: Int, pageSize: Int, change: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { change(page - 1) }, enabled = page > 1) { Icon(Icons.Default.ChevronLeft, "Previous page") }
        Text("$page / ${((total + pageSize - 1) / pageSize).coerceAtLeast(1)} · $total results", style = MaterialTheme.typography.bodyMedium)
        IconButton(onClick = { change(page + 1) }, enabled = page * pageSize < total) { Icon(Icons.Default.ChevronRight, "Next page") }
    }
}

@Composable
fun DateFilters(start: String, end: String, setStart: (String) -> Unit, setEnd: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.weight(1f)) { Field(start, setStart, "From (YYYY-MM-DD)", limit = 10) }
        Box(Modifier.weight(1f)) { Field(end, setEnd, "To (YYYY-MM-DD)", limit = 10) }
    }
    if (!validDates(start, end)) Text("Use valid dates with From on or before To.", color = MaterialTheme.colorScheme.error)
}