package `in`.agrisense.mobile

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

val metricNames = listOf("soil_moisture", "temperature", "humidity", "rainfall", "ph", "nitrogen", "phosphorus", "potassium")
val soilNames = listOf("sandy", "clay", "loamy", "silty", "peaty", "chalky", "mixed")

@Composable
fun DashboardScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    val readingsPath = if (state.farmId.isBlank()) "" else "/farms/${state.farmId}/readings/latest"
    val readings = rememberRemote(model, readingsPath)
    val devicePath = if (state.farmId.isBlank()) "" else "/farms/${state.farmId}/devices"
    val devices = rememberRemote(model, devicePath)
    val farm = state.resources["/farms/"]?.rows()?.firstOrNull { it.text("id") == state.farmId }
    Page {
        Heading("Good to see you,", state.user?.text("full_name").orEmpty())
        FarmPicker(model, state)
        if (farm == null) EmptyState("Your farm starts here", "No farms are available for this account.",
            actionLabel = "Add a farm", onAction = { navigate("farms") })
        else {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium) {
                Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Spa, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.primary)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(farm.text("name"), style = MaterialTheme.typography.titleLarge)
                        Text(farm.text("location"))
                        Text(farm.text("area_hectares", "Not recorded") + " ha · " + label(farm.text("soil_type", "Soil not recorded")),
                            style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Heading("Field conditions", "Latest recorded measurements")
            ResourceStatus(readings) { model.load(readingsPath) }
            metricNames.take(4).chunked(2).forEach { pair -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { metric ->
                    val reading = readings.rows().firstOrNull { it.text("metric") == metric }
                    OutlinedCard(Modifier.weight(1f)) {
                        Column(Modifier.padding(14.dp).heightIn(min = 126.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(label(metric), style = MaterialTheme.typography.labelLarge)
                            Text(reading?.let { it.text("value") + " " + it.text("unit") } ?: "--", style = MaterialTheme.typography.headlineSmall)
                            Text(reading?.let { label(it.text("source")) } ?: "No reading", style = MaterialTheme.typography.bodySmall)
                            reading?.let { Text(displayTime(it.text("recorded_at")), style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
            } }
            TextButton(onClick = { navigate("readings") }) { Text("All measurements"); Icon(Icons.Default.ChevronRight, null) }
            ResourceStatus(devices) { model.load(devicePath) }
            ActionRow("Devices", "${devices.rows().size} registered · cloud heartbeat status", Icons.Default.Sensors) { navigate("devices") }
            HorizontalDivider()
            ActionRow("Weather outlook", farm.text("location"), Icons.Default.WbSunny) { navigate("weather") }
            HorizontalDivider()
            ActionRow("Farm analysis", "Crop suitability & data readiness", Icons.Default.Insights) { navigate("analysis") }
            HorizontalDivider()
            ActionRow("Farm assistant", "Farm report & advice", Icons.Default.AutoAwesome) { navigate("assistant") }
        }
        ActionRow("Field notebook", "Manual tests · stored on this phone", Icons.Default.EditNote) { navigate("notebook") }
    }
}

@Composable
fun FarmsScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    val data = rememberRemote(model, "/farms/")
    var add by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    Page {
        Heading("My farms", "${data.rows().size} farms", action = { FilledTonalIconButton(onClick = { model.clearError(); add = true }) {
            Icon(Icons.Default.Add, "Add farm") } })
        Field(query, { query = it }, "Search farms", limit = 100)
        ResourceStatus(data) { model.load("/farms/") }
        val farms = data.rows().filter { (it.text("name") + it.text("location")).contains(query, ignoreCase = true) }
        if (!data.loading && farms.isEmpty()) EmptyState("No farms found", "Your matching farms will appear here.",
            actionLabel = "Add farm", onAction = { add = true })
        farms.forEach { farm ->
            OutlinedCard(onClick = { model.selectFarm(farm.text("id")); navigate("farm/${farm.text("id")}") }) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Spa, null, tint = MaterialTheme.colorScheme.primary)
                        Text(farm.text("name"), Modifier.weight(1f).padding(start = 12.dp), style = MaterialTheme.typography.titleLarge)
                        Icon(Icons.Default.ChevronRight, null)
                    }
                    Text(farm.text("location"))
                    Text("${farm.text("area_hectares", "--")} ha · ${label(farm.text("soil_type", "Unspecified soil"))}",
                        style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
    if (add) FarmEditor(model, null) { add = false }
}

@Composable
fun FarmDetailScreen(model: AppViewModel, state: AppState, id: String, navigate: (String) -> Unit) {
    val path = "/farms/$id"
    val data = rememberRemote(model, path)
    val farm = data.objectValue()
    var editing by rememberSaveable { mutableStateOf(false) }
    var deleting by rememberSaveable { mutableStateOf(false) }
    Page {
        Heading(farm.text("name", "Farm details"), farm.text("location"), action = {
            IconButton(onClick = { model.clearError(); editing = true }, enabled = farm.has("id")) { Icon(Icons.Default.Edit, "Edit farm") }
        })
        ResourceStatus(data) { model.load(path) }
        if (farm.has("id")) {
            listOf("Area" to (farm.text("area_hectares", "--") + " hectares"),
                "Recorded soil" to label(farm.text("soil_type", "Not recorded")),
                "Detected soil" to label(farm.text("detected_soil_type", "Not analyzed")),
                "Latitude" to farm.text("latitude", "Not recorded"), "Longitude" to farm.text("longitude", "Not recorded")).forEach { (name, value) ->
                Text(name, style = MaterialTheme.typography.labelLarge); Text(value, style = MaterialTheme.typography.titleMedium); HorizontalDivider()
            }
            listOf(Triple("devices", "Devices", Icons.Default.Sensors), Triple("readings", "Readings", Icons.Default.ShowChart),
                Triple("weather", "Weather", Icons.Default.WbSunny), Triple("analysis", "Analysis", Icons.Default.Insights)).forEach { (route, name, icon) ->
                ActionRow(name, "", icon) { model.selectFarm(id); navigate(route) }
            }
            TextButton(onClick = { deleting = true }, enabled = !state.busy) { Icon(Icons.Default.DeleteOutline, null); Text(" Delete farm") }
        }
    }
    if (editing) FarmEditor(model, farm) { editing = false }
    if (deleting) Confirm("Delete ${farm.text("name")}?", "This permanently removes this farm and its associated cloud records.", state.busy,
        { deleting = false }) { model.mutate(path, "DELETE") { deleting = false; navigate("farms") } }
}

@Composable
private fun FarmEditor(model: AppViewModel, farm: JSONObject?, dismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(farm?.text("name").orEmpty()) }
    var location by rememberSaveable { mutableStateOf(farm?.text("location").orEmpty()) }
    var area by rememberSaveable { mutableStateOf(farm?.text("area_hectares").orEmpty()) }
    var latitude by rememberSaveable { mutableStateOf(farm?.text("latitude").orEmpty()) }
    var longitude by rememberSaveable { mutableStateOf(farm?.text("longitude").orEmpty()) }
    var soil by rememberSaveable { mutableStateOf(farm?.text("soil_type").orEmpty()) }
    var searchPath by rememberSaveable { mutableStateOf("") }
    val search = rememberRemote(model, searchPath)
    FormSheet(if (farm == null) "Add farm" else "Edit farm", model, dismiss, {
        if (name.isBlank() || location.isBlank()) model.fail("Farm name and location are required.")
        else if (latitude.isBlank() != longitude.isBlank()) model.fail("Enter both latitude and longitude.")
        else model.mutate(if (farm == null) "/farms/" else "/farms/${farm.text("id")}", if (farm == null) "POST" else "PATCH",
            json("name" to name.trim(), "location" to location.trim(), "area_hectares" to area.takeIf { it.isNotBlank() },
                "latitude" to latitude.takeIf { it.isNotBlank() }, "longitude" to longitude.takeIf { it.isNotBlank() },
                "soil_type" to soil.takeIf { it.isNotBlank() })) { dismiss() }
    }) {
        Field(name, { name = it }, "Farm name", limit = 100)
        Field(location, { location = it }, "Location", limit = 200)
        TextButton(onClick = { searchPath = "/weather/locations?query=${encoded(location.take(100))}" }, enabled = location.trim().length >= 2) {
            Icon(Icons.Default.LocationOn, null); Text(" Find coordinates")
        }
        ResourceStatus(search) { model.load(searchPath) }
        search.rows().forEach { result -> TextButton(onClick = {
            location = result.text("display_name").take(200); latitude = result.text("latitude"); longitude = result.text("longitude"); searchPath = ""
        }) { Text(result.text("display_name")) } }
        Field(latitude, { latitude = it }, "Latitude", KeyboardType.Decimal, limit = 12)
        Field(longitude, { longitude = it }, "Longitude", KeyboardType.Decimal, limit = 12)
        Field(area, { area = it }, "Area (hectares)", KeyboardType.Decimal, limit = 12)
        Choice("Recorded soil", soil, listOf("" to "Not recorded") + soilNames.map { it to label(it) }) { soil = it }
    }
}

@Composable
fun DevicesScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    val path = if (state.farmId.isBlank()) "" else "/farms/${state.farmId}/devices"
    val data = rememberRemote(model, path)
    var add by rememberSaveable { mutableStateOf(false) }
    var deviceKey by remember { mutableStateOf("") }
    Page {
        Heading("Devices", "Cloud registry", action = { IconButton(onClick = { model.clearError(); add = true }, enabled = state.farmId.isNotBlank()) {
            Icon(Icons.Default.Add, "Register device") } })
        FarmPicker(model, state)
        ActionRow("Local connection", "Wi-Fi & pairing status", Icons.Default.Wifi) { navigate("connection") }
        ResourceStatus(data) { model.load(path) }
        if (!data.loading && data.rows().isEmpty()) EmptyState("No registered devices", "Select a farm and register its sensor or camera.", Icons.Default.Sensors)
        data.rows().forEach { device -> OutlinedCard {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(device.text("name"), style = MaterialTheme.typography.titleLarge)
                Text(device.text("serial_number"))
                Text("Cloud: ${label(device.text("connection_status"))}", color = MaterialTheme.colorScheme.primary)
                Text("Last seen: ${displayTime(device.text("last_seen_at"))}", style = MaterialTheme.typography.bodySmall)
                Text(device.optJSONArray("capabilities")?.let { array -> (0 until array.length()).joinToString(", ") { label(array.getString(it)) } }.orEmpty())
            }
        } }
    }
    if (add) DeviceEditor(model, state.farmId, { add = false }) { deviceKey = it; add = false }
    if (deviceKey.isNotEmpty()) AlertDialog(onDismissRequest = {}, title = { Text("Device key") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Shown once. Keep this key private and configure it on your device.")
            SelectionContainer { Text(deviceKey) }
        }
    }, confirmButton = { TextButton(onClick = { deviceKey = "" }) { Text("I have saved it") } })
}

@Composable
private fun DeviceEditor(model: AppViewModel, farmId: String, dismiss: () -> Unit, created: (String) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var serial by rememberSaveable { mutableStateOf("") }
    var selected by rememberSaveable { mutableStateOf(listOf<String>()) }
    FormSheet("Register device", model, dismiss, {
        if (name.isBlank() || serial.trim().length < 3 || selected.isEmpty()) model.fail("Enter a name, serial number, and at least one capability.")
        else model.mutate("/farms/$farmId/devices", "POST", json("name" to name.trim(), "serial_number" to serial.trim(),
            "capabilities" to JSONArray(selected))) { created(JSONObject(it).text("device_key")) }
    }, "Register") {
        Field(name, { name = it }, "Device name", limit = 100)
        Field(serial, { serial = it }, "Serial number", limit = 100)
        Text("Capabilities", style = MaterialTheme.typography.titleMedium)
        (listOf("camera") + metricNames).forEach { capability ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(capability in selected, { selected = if (it) selected + capability else selected - capability })
                Text(label(capability))
            }
        }
    }
}

@Composable
fun ConnectionScreen(network: NetworkStatus) {
    val context = LocalContext.current
    Page {
        Heading("Field connection", "Local network")
        Icon(Icons.Default.Wifi, null, Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
        Text("Wi-Fi: ${if (network.wifiAvailable) "Available" else "Not connected"}", style = MaterialTheme.typography.titleLarge)
        Text("Internet: ${if (network.internetValidated) "Available" else "Offline"}")
        HorizontalDivider()
        Text("IoT pairing: Not available", style = MaterialTheme.typography.titleMedium)
        Note("Firmware pairing and local sensor communication are not integrated yet. A Wi-Fi connection does not confirm an IoT device.")
        Button(onClick = { context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS)) }, Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Settings, null); Text(" Wi-Fi settings")
        }
    }
}