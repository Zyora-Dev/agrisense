package `in`.agrisense.mobile

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.*

private data class Tab(val route: String, val title: String, val icon: ImageVector)
private val tabs = listOf(Tab("home", "Home", Icons.Default.GridView), Tab("farms", "Farms", Icons.Default.Spa),
    Tab("readings", "Readings", Icons.Default.ShowChart), Tab("market", "Market", Icons.Default.Storefront),
    Tab("more", "More", Icons.Default.MoreHoriz))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MobileApp(model: AppViewModel = viewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    val network by model.network.collectAsStateWithLifecycle()
    if (!state.ready) { Box(Modifier.fillMaxSize()) { CircularProgressIndicator() }; return }
    if (state.guest) {
        BackHandler { model.guest(false) }
        Scaffold(topBar = { TopAppBar(title = { Text("Offline workspace") }, navigationIcon = {
            IconButton(onClick = { model.guest(false) }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back to sign in") }
        }) }) { inset -> Box(Modifier.padding(inset)) { NotebookScreen() } }
        return
    }
    if (state.user == null) { AuthScreen(model, state); return }
    key(state.user?.text("id"), state.endpoint) {
        val nav = rememberNavController()
        val entry by nav.currentBackStackEntryAsState()
        val route = entry?.destination?.route ?: "home"
        val root = tabs.any { it.route == route }
        val navigate: (String) -> Unit = { destination -> model.clearError(); nav.navigate(destination) { launchSingleTop = true } }
        val snack = remember { SnackbarHostState() }
        LaunchedEffect(state.error) { state.error?.let { snack.showSnackbar(it) } }
        Scaffold(containerColor = MaterialTheme.colorScheme.background,
            snackbarHost = { SnackbarHost(snack) },
            topBar = { TopAppBar(title = { Text(if (root) "AgriSense" else when {
                route.startsWith("farm/") -> "Farm details"
                route.startsWith("vendor/") -> "Vendor & products"
                else -> label(route)
            }, style = MaterialTheme.typography.titleLarge) }, navigationIcon = {
                if (!root) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
            }, actions = {
                IconButton(onClick = model::refresh, enabled = !state.busy) { Icon(Icons.Default.Refresh, "Refresh data") }
                IconButton(onClick = { navigate("settings") }) { Icon(Icons.Default.AccountCircle, "Account settings") }
            }) },
            bottomBar = {
                if (root) NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                    tabs.forEach { tab -> NavigationBarItem(selected = route == tab.route,
                        onClick = { model.clearError(); nav.navigate(tab.route) {
                            popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true
                        } }, icon = { Icon(tab.icon, null) }, label = { Text(tab.title) }) }
                }
            },
        ) { insets ->
            Column(Modifier.fillMaxSize().padding(insets)) {
                if (!network.internetValidated) Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
                    Text("Offline · saved cloud data may be out of date", Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelMedium)
                }
                NavHost(nav, startDestination = "home", modifier = Modifier.weight(1f)) {
                    composable("home") { DashboardScreen(model, state, navigate) }
                    composable("farms") { FarmsScreen(model, state, navigate) }
                    composable("farm/{id}") { FarmDetailScreen(model, state, it.arguments?.getString("id").orEmpty(), navigate) }
                    composable("devices") { DevicesScreen(model, state, navigate) }
                    composable("connection") { ConnectionScreen(network) }
                    composable("readings") { ReadingsScreen(model, state, navigate) }
                    composable("notebook") { NotebookScreen() }
                    composable("weather") { WeatherScreen(model, state, navigate) }
                    composable("analysis") { AnalysisScreen(model, state, navigate) }
                    composable("assistant") { AssistantScreen(model, state, navigate) }
                    composable("market") { MarketScreen(model, state, navigate) }
                    composable("vendor/{id}") { VendorScreen(model, state, it.arguments?.getString("id").orEmpty(), navigate) }
                    composable("orders") { OrdersScreen(model, state) }
                    composable("business") { BusinessScreen(model, state) }
                    composable("settings") { SettingsScreen(model, state, navigate) }
                    composable("security") { SecurityScreen(model, state) }
                    composable("sessions") { SessionsScreen(model, state) }
                    composable("activity") { AuditScreen(model) }
                    composable("more") { MoreScreen(state, navigate) }
                }
            }
        }
    }
}

@Composable
private fun MoreScreen(state: AppState, navigate: (String) -> Unit) {
    Page {
        Heading("Your workspace", state.user?.text("full_name").orEmpty())
        listOf(
            Triple("weather", "Weather & forecast", Icons.Default.WbSunny),
            Triple("analysis", "Farm analysis", Icons.Default.Insights),
            Triple("assistant", "Farm assistant", Icons.Default.AutoAwesome),
            Triple("devices", "Devices", Icons.Default.Sensors),
            Triple("connection", "Local Wi-Fi connection", Icons.Default.Wifi),
            Triple("notebook", "Offline notebook", Icons.Default.EditNote),
            Triple("orders", "Orders", Icons.Default.LocalShipping),
            Triple("business", "My business", Icons.Default.Storefront),
            Triple("settings", "Settings & security", Icons.Default.Settings),
        ).forEach { (destination, title, icon) ->
            ActionRow(title, "", icon) { navigate(destination) }; HorizontalDivider()
        }
        Text("AgriSense · Android 0.2", style = MaterialTheme.typography.bodySmall)
    }
}