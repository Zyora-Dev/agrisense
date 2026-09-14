package `in`.agrisense.mobile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@Composable
fun ReadingsScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    var metric by rememberSaveable { mutableStateOf("soil_moisture") }
    var start by rememberSaveable { mutableStateOf("") }
    var end by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var add by rememberSaveable { mutableStateOf(false) }
    val path = if (state.farmId.isBlank()) "" else "/farms/${state.farmId}/readings?metric=$metric&limit=500"
    val data = rememberRemote(model, path)
    val rows = if (!validDates(start, end)) emptyList() else data.rows().filter { row ->
        val date = runCatching { Instant.parse(row.text("recorded_at")).atZone(ZoneOffset.UTC).toLocalDate() }.getOrNull()
        date != null && (start.isBlank() || date >= LocalDate.parse(start)) && (end.isBlank() || date <= LocalDate.parse(end))
    }
    LaunchedEffect(state.farmId, metric, start, end) { page = 1 }
    Page {
        Heading("Field readings", "Latest 500 per metric · dates in UTC", action = {
            IconButton(onClick = { model.clearError(); add = true }, enabled = state.farmId.isNotBlank()) { Icon(Icons.Default.Add, "Add cloud soil test") }
        })
        FarmPicker(model, state)
        Choice("Metric", metric, metricNames.map { it to label(it) }) { metric = it }
        DateFilters(start, end, { start = it }, { end = it })
        ResourceStatus(data) { model.load(path) }
        if (rows.isNotEmpty()) TrendChart(rows)
        if (!data.loading && rows.isEmpty()) EmptyState("No matching readings", "No recorded measurements match this farm, metric and date range.", Icons.Default.ShowChart)
        rows.drop((page - 1) * 20).take(20).forEach { reading ->
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${reading.text("value")} ${reading.text("unit")}", style = MaterialTheme.typography.titleLarge)
                    Text(displayTime(reading.text("recorded_at")), style = MaterialTheme.typography.bodySmall)
                }
                Text(label(reading.text("source")), style = MaterialTheme.typography.labelLarge,
                    color = if (reading.text("source") == "simulated") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
            HorizontalDivider()
        }
        if (rows.isNotEmpty()) Pagination(page, rows.size, 20) { page = it }
        ActionRow("Offline notebook", "Local manual tests · not uploaded", Icons.Default.EditNote) { navigate("notebook") }
    }
    if (add) CloudReadingEditor(model, state.farmId) { add = false }
}

@Composable
private fun TrendChart(rows: List<JSONObject>) {
    val readings = rows.mapNotNull { row ->
        val time = runCatching { Instant.parse(row.text("recorded_at")).toEpochMilli() }.getOrNull()
        val value = row.text("value").toFloatOrNull()
        if (time != null && value != null && value.isFinite()) time to value else null
    }.sortedBy { it.first }
    if (readings.isEmpty()) return
    val low = readings.minOf { it.second }
    val high = readings.maxOf { it.second }
    val color = MaterialTheme.colorScheme.primary
    val grid = MaterialTheme.colorScheme.outlineVariant
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Range: $low to $high", style = MaterialTheme.typography.labelLarge)
        Canvas(Modifier.fillMaxWidth().height(140.dp).semantics {
            contentDescription = "Reading trend with ${readings.size} measurements. Minimum $low, maximum $high. Exact values follow below."
        }) {
            listOf(0.1f, 0.5f, 0.9f).forEach { fraction -> drawLine(grid, Offset(0f, size.height * fraction), Offset(size.width, size.height * fraction)) }
            val duration = (readings.last().first - readings.first().first).coerceAtLeast(1L)
            val points = readings.map { (time, value) -> Offset(
                6f + ((time - readings.first().first).toDouble() / duration * (size.width - 12f)).toFloat(),
                if (high == low) size.height / 2 else size.height * (0.9f - (value - low) / (high - low) * 0.8f)) }
            points.zipWithNext().forEach { (from, to) -> drawLine(color, from, to, strokeWidth = 3.dp.toPx()) }
            points.forEach { drawCircle(color, 3.dp.toPx(), it) }
        }
    }
}

@Composable
private fun CloudReadingEditor(model: AppViewModel, farmId: String, dismiss: () -> Unit) {
    var metric by rememberSaveable { mutableStateOf(SoilMetric.PH.name) }
    var value by rememberSaveable { mutableStateOf("") }
    FormSheet("Record manual soil test", model, dismiss, {
        try {
            val reading = newSoilReading("Cloud test", SoilMetric.valueOf(metric), value)
            model.mutate("/farms/$farmId/readings", "POST", json("readings" to JSONArray().put(
                json("metric" to metric.lowercase(), "value" to reading.value)))) { dismiss() }
        } catch (invalid: IllegalArgumentException) { model.fail(invalid.message ?: "Enter a valid reading.") }
    }, "Save to farm") {
        Choice("Metric", metric, SoilMetric.entries.map { it.name to it.title }) { metric = it }
        Field(value, { value = it }, "Value (${SoilMetric.valueOf(metric).unit})", KeyboardType.Decimal, limit = 20)
        Note("Manual pH/NPK input, not a validated sensor measurement. No automatic upload retry is enabled.")
    }
}

@Composable
fun WeatherScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    val path = if (state.farmId.isBlank()) "" else "/weather/farms/${state.farmId}"
    val data = rememberRemote(model, path)
    val weather = data.objectValue()
    val current = weather.optJSONObject("current")
    Page {
        Heading("Weather outlook", "Seven-day forecast")
        FarmPicker(model, state)
        ResourceStatus(data) { model.load(path) }
        if (current != null) {
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
                Column(Modifier.fillMaxWidth().padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(Icons.Default.WbSunny, null, Modifier.size(38.dp))
                    Text("${current.text("temperature_c")} °C", style = MaterialTheme.typography.headlineLarge)
                    Text(weather.text("location"), style = MaterialTheme.typography.titleMedium)
                    Text("Humidity ${current.text("relative_humidity_percent")}% · Rain ${current.text("precipitation_mm")} mm")
                    Text("Observed ${current.text("observed_at")} · ${weather.text("timezone")}", style = MaterialTheme.typography.bodySmall)
                }
            }
            weather.objects("days").forEach { day ->
                Text(day.text("date"), style = MaterialTheme.typography.titleMedium)
                Text("${day.text("temperature_min_c")}–${day.text("temperature_max_c")} °C · ${day.text("precipitation_probability_percent")}% rain")
                Text("Rainfall ${day.text("precipitation_mm")} mm · ET₀ ${day.text("reference_evapotranspiration_mm")} mm", style = MaterialTheme.typography.bodySmall)
                Text(day.text("weather_outlook"), color = MaterialTheme.colorScheme.secondary)
                HorizontalDivider()
            }
            Text("${weather.text("source")} · Updated ${displayTime(weather.text("retrieved_at"))}", style = MaterialTheme.typography.bodySmall)
        } else if (!data.loading) EmptyState("Forecast unavailable", "An exact farm location and a reachable weather service are required.",
            Icons.Default.CloudQueue, "Manage farms", { navigate("farms") })
    }
}

@Composable
fun AnalysisScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    val path = if (state.farmId.isBlank()) "" else "/farms/${state.farmId}/analysis"
    val data = rememberRemote(model, path)
    val report = data.objectValue()
    val prediction = report.optJSONObject("model")
    Page {
        Heading("Farm analysis", "Readiness & crop suitability")
        FarmPicker(model, state)
        ResourceStatus(data) { model.load(path) }
        if (report.has("input_status")) {
            Text("Inputs: ${label(report.text("input_status"))}", style = MaterialTheme.typography.titleLarge)
            if (report.optBoolean("contains_simulated_data")) Note("This report includes simulated inputs. Predictions are not field-validated.", warning = true)
            report.objects("inputs").forEach { input ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(label(input.text("metric")), style = MaterialTheme.typography.titleMedium)
                        Text("${label(input.text("source"))} · ${if (input.optBoolean("is_stale")) "Stale" else "Within freshness window"}", style = MaterialTheme.typography.bodySmall)
                    }
                    Text("${input.text("value")} ${input.text("unit")}")
                }
                Text(displayTime(input.text("recorded_at")), style = MaterialTheme.typography.bodySmall)
                HorizontalDivider()
            }
            Text("Crop suitability", style = MaterialTheme.typography.headlineSmall)
            prediction?.objects("predictions")?.forEach { crop ->
                Text("${crop.text("rank")}. ${label(crop.text("crop"))}", style = MaterialTheme.typography.titleMedium)
                Text("Model score: ${"%.1f".format(crop.optDouble("confidence") * 100)}%")
            }
            if (prediction?.text("reason").orEmpty().isNotBlank()) Note(prediction!!.text("reason"))
            Text("${prediction?.text("model_version").orEmpty()} · ${prediction?.text("scope").orEmpty()}", style = MaterialTheme.typography.bodySmall)
            Note("Model scores are not field accuracy or planting guarantees. Verify local conditions and input measurements.")
            ActionRow("Ask about this farm", "Farm assistant", Icons.Default.AutoAwesome) { navigate("assistant") }
        } else if (!data.loading) EmptyState("No farm report", "Select a farm to view its analysis.")
    }
}

@Composable
fun AssistantScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    Page {
        Heading("Farm assistant", "Farm-specific advice")
        FarmPicker(model, state)
        if (state.farmId.isBlank()) EmptyState("Choose your farm", "Farm context is required for advice.", actionLabel = "My farms", onAction = { navigate("farms") })
        else key(state.farmId) { AssistantConversation(model, state) }
    }
}

@Composable
private fun ColumnScope.AssistantConversation(model: AppViewModel, state: AppState) {
    var messages by remember { mutableStateOf(listOf<JSONObject>()) }
    var draft by rememberSaveable { mutableStateOf("") }
    var recommendations by remember { mutableStateOf<JSONObject?>(null) }
    var disclaimer by remember { mutableStateOf("") }
    OutlinedButton(onClick = {
        model.mutate("/farms/${state.farmId}/recommendations", "POST", JSONObject()) { recommendations = JSONObject(it) }
    }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.AutoAwesome, null); Text(" Generate farm advice") }
    recommendations?.let { advice ->
        if (advice.optBoolean("uses_simulated_data")) Note("Advice depends on simulated farm inputs.", warning = true)
        Text(advice.text("summary"), style = MaterialTheme.typography.titleMedium)
        advice.objects("recommendations").forEach { item -> OutlinedCard {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${label(item.text("priority"))} priority", style = MaterialTheme.typography.labelLarge)
                Text(item.text("title"), style = MaterialTheme.typography.titleMedium)
                Text(item.text("action")); Text(item.text("reason")); Text(item.text("precaution"), color = MaterialTheme.colorScheme.secondary)
            }
        } }
        Text(advice.text("disclaimer"), style = MaterialTheme.typography.bodySmall)
    }
    HorizontalDivider()
    Row {
        Text("Conversation", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
        IconButton(onClick = { messages = emptyList(); disclaimer = "" }, enabled = !state.busy) { Icon(Icons.Default.DeleteOutline, "Clear conversation") }
    }
    if (messages.isEmpty()) Text("No messages yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    messages.forEach { message ->
        Surface(color = if (message.text("role") == "user") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
            shape = MaterialTheme.shapes.medium) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(if (message.text("role") == "user") "You" else "AgriSense", style = MaterialTheme.typography.labelLarge)
                SelectionContainer { Text(message.text("text")) }
            }
        }
    }
    if (disclaimer.isNotBlank()) Text(disclaimer, style = MaterialTheme.typography.bodySmall)
    Field(draft, { draft = it }, "Your question", multiline = true, limit = 1500, enabled = !state.busy)
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    Button(onClick = {
        val question = draft.trim()
        val history = JSONArray(messages.takeLast(12).map { json("role" to it.text("role"), "text" to it.text("text").take(1500)) })
        model.mutate("/farms/${state.farmId}/chat", "POST", json("message" to question, "history" to history)) {
            val response = JSONObject(it)
            messages = messages + json("role" to "user", "text" to question) + json("role" to "assistant", "text" to response.text("answer"))
            disclaimer = (if (response.optBoolean("uses_simulated_data")) "Includes simulated inputs. " else "") + response.text("disclaimer")
            draft = ""
        }
    }, enabled = draft.isNotBlank() && !state.busy, modifier = Modifier.fillMaxWidth()) {
        if (state.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        else { Icon(Icons.Default.Send, null); Text(" Send question") }
    }
}