package `in`.agrisense.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    var name by rememberSaveable(state.user?.text("full_name")) { mutableStateOf(state.user?.text("full_name").orEmpty()) }
    var server by rememberSaveable { mutableStateOf(false) }
    var logout by rememberSaveable { mutableStateOf(false) }
    var localLogout by rememberSaveable { mutableStateOf(false) }
    Page {
        Heading("Account & settings", state.user?.text("email").orEmpty())
        Icon(Icons.Default.AccountCircle, null, Modifier.size(60.dp), tint = MaterialTheme.colorScheme.primary)
        Field(name, { name = it }, "Full name", limit = 100, enabled = !state.busy)
        Button(onClick = { model.saveProfile(name) }, enabled = !state.busy && name.isNotBlank() && name.trim() != state.user?.text("full_name"),
            modifier = Modifier.fillMaxWidth()) { Text("Save profile") }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        HorizontalDivider()
        ActionRow("Password", "Change account password", Icons.Default.Lock) { navigate("security") }
        ActionRow("Active sessions", "Manage signed-in devices", Icons.Default.Devices) { navigate("sessions") }
        ActionRow("Security activity", "Your account events", Icons.Default.History) { navigate("activity") }
        HorizontalDivider()
        ActionRow("API connection", state.endpoint, Icons.Default.Dns) { model.clearError(); server = true }
        ActionRow("Offline notebook", "Shared on this phone · not account-linked", Icons.Default.EditNote) { navigate("notebook") }
        Note("Cloud copies are encrypted and cleared at sign-out. Notebook records stay on this phone and are available without sign-in.")
        OutlinedButton(onClick = { model.clearError(); logout = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.Logout, null); Text(" Sign out")
        }
        TextButton(onClick = { localLogout = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Remove account from this phone") }
        Text("AgriSense 0.2 · Android\nCloud session lifetime: up to 15 days", style = MaterialTheme.typography.bodySmall)
    }
    if (server) ServerSheet(model, state) { server = false }
    if (logout) Confirm("Sign out?", "This revokes the current cloud session. An internet connection is required.", state.busy,
        { logout = false }) { logout = false; model.logout() }
    if (localLogout) Confirm("Remove local sign-in?", "Saved cloud data and this phone's token will be removed. The server session remains active until revoked or expired. Local notebook records remain.",
        state.busy, { localLogout = false }) { model.forget() }
}

@Composable
fun SecurityScreen(model: AppViewModel, state: AppState) {
    var current by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var confirming by rememberSaveable { mutableStateOf(false) }
    Page {
        Heading("Change password", "Account security")
        Icon(Icons.Default.Lock, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
        Field(current, { current = it }, "Current password", secret = true, limit = 128, enabled = !state.busy)
        Field(password, { password = it }, "New password (12+ characters)", secret = true, limit = 128, enabled = !state.busy)
        Field(confirm, { confirm = it }, "Confirm new password", secret = true, limit = 128, enabled = !state.busy)
        Note("Changing your password signs out every session, including this phone.", warning = true)
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = {
            if (password.length !in 12..128 || password != confirm || current.isBlank() || current == password)
                model.fail("Enter your current password and matching new passwords of 12 to 128 characters. Choose a different password.")
            else confirming = true
        }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Update password") }
    }
    if (confirming) Confirm("Change password?", "All sessions will be signed out after the update.", state.busy, { confirming = false }) {
        model.mutate("/auth/password", "POST", json("current_password" to current, "new_password" to password)) {
            current = ""; password = ""; confirm = ""; confirming = false; model.forget("Password changed. Sign in with your new password.")
        }
    }
}

@Composable
fun SessionsScreen(model: AppViewModel, state: AppState) {
    val data = rememberRemote(model, "/auth/sessions")
    var revoke by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var others by rememberSaveable { mutableStateOf(false) }
    Page {
        Heading("Active sessions", "Signed-in devices")
        ResourceStatus(data) { model.load("/auth/sessions") }
        data.rows().forEach { session -> OutlinedCard {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.Devices, null, tint = MaterialTheme.colorScheme.primary)
                Text(if (session.optBoolean("is_current")) "This session" else "Other session", style = MaterialTheme.typography.titleMedium)
                Text(session.text("user_agent"))
                Text("Signed in ${displayTime(session.text("created_at"))}", style = MaterialTheme.typography.bodySmall)
                Text("Expires ${displayTime(session.text("expires_at"))}", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { revoke = session.text("id") to session.optBoolean("is_current") }, enabled = !state.busy) { Text("Revoke session") }
            }
        } }
        if (!data.loading && data.rows().isEmpty()) EmptyState("No sessions available", "Refresh to retrieve the active sessions.", Icons.Default.Devices)
        OutlinedButton(onClick = { others = true }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("Revoke all other sessions") }
    }
    revoke?.let { (id, current) -> Confirm("Revoke session?", if (current) "This will sign you out of this phone." else "The selected session will lose access.",
        state.busy, { revoke = null }) { model.mutate("/auth/sessions/$id", "DELETE") { revoke = null; if (current) model.forget() } } }
    if (others) Confirm("Revoke other sessions?", "Only this session will remain active.", state.busy, { others = false }) {
        model.mutate("/auth/sessions/revoke-others", "POST") { others = false }
    }
}

@Composable
fun AuditScreen(model: AppViewModel) {
    var start by rememberSaveable { mutableStateOf("") }
    var end by rememberSaveable { mutableStateOf("") }
    var action by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    LaunchedEffect(start, end, action) { page = 1 }
    val path = if (!validDates(start, end)) "" else "/auth/audit?page=$page&page_size=20" + dateQuery(start, end) +
        if (action.isEmpty()) "" else "&action=${encoded(action)}"
    val data = rememberRemote(model, path)
    val result = data.objectValue()
    Page {
        Heading("Security activity", "Account events · UTC date filter")
        DateFilters(start, end, { start = it }, { end = it })
        Choice("Event", action, listOf("" to "All events") + listOf("login.succeeded", "login.failed", "logout.succeeded", "profile.updated",
            "password.changed", "password.failed", "session.revoked", "sessions.others_revoked").map { it to label(it.replace('.', ' ')) }) { action = it }
        ResourceStatus(data) { model.load(path) }
        result.objects("items").forEach { event ->
            Text(label(event.text("action").replace('.', ' ')), style = MaterialTheme.typography.titleMedium)
            Text(displayTime(event.text("created_at")))
            Text(event.text("user_agent"), style = MaterialTheme.typography.bodySmall)
            HorizontalDivider()
        }
        if (!data.loading && result.objects("items").isEmpty()) EmptyState("No matching events", "No account security events match these dates and filters.", Icons.Default.History)
        Pagination(page, result.optInt("total"), 20) { page = it }
    }
}