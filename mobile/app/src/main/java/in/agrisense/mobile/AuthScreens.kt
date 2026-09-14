package `in`.agrisense.mobile

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@Composable
fun AuthScreen(model: AppViewModel, state: AppState) {
    var register by rememberSaveable { mutableStateOf(false) }
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var connection by rememberSaveable { mutableStateOf(false) }
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Page {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Image(painterResource(R.drawable.ic_agrisense), null, Modifier.size(42.dp))
                    Text("AgriSense", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    IconButton(onClick = { connection = true }, enabled = !state.busy) {
                        Icon(Icons.Default.Dns, "API server settings")
                    }
                }
                Spacer(Modifier.height(28.dp))
                Text(if (register) "A fresh start\nfor your farm." else "Your farm.\nIn focus.", style = MaterialTheme.typography.headlineLarge)
                Text(if (register) "Create your account" else "Welcome back", style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                if (register) Field(name, { name = it }, "Full name", enabled = !state.busy, limit = 100)
                Field(email, { email = it }, "Email address", KeyboardType.Email, enabled = !state.busy, limit = 254)
                Field(password, { password = it }, if (register) "Password (12+ characters)" else "Password",
                    secret = true, enabled = !state.busy, limit = 128)
                if (register) Field(confirm, { confirm = it }, "Confirm password", secret = true, enabled = !state.busy, limit = 128)
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (state.endpoint.isEmpty()) TextButton(onClick = { connection = true }, enabled = !state.busy) {
                    Icon(Icons.Default.Link, null); Text(" Connect API server")
                }
                Button(onClick = { model.authenticate(register, name, email, password, confirm) }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp)) {
                    if (state.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Text(if (register) "Create account" else "Sign in", fontWeight = FontWeight.SemiBold)
                }
                TextButton(onClick = { register = !register; password = ""; confirm = ""; model.clearError() },
                    enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                    Text(if (register) "Already have an account? Sign in" else "New to AgriSense? Create account")
                }
                HorizontalDivider()
                OutlinedButton(onClick = { model.guest(true) }, enabled = !state.busy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp)) {
                    Icon(Icons.Default.EditNote, null); Spacer(Modifier.width(10.dp)); Text("Open offline notebook")
                }
            }
        }
    }
    if (connection) ServerSheet(model, state) { connection = false }
}

@Composable
fun ServerSheet(model: AppViewModel, state: AppState, dismiss: () -> Unit) {
    var endpoint by rememberSaveable { mutableStateOf(state.endpoint) }
    FormSheet("API connection", model, dismiss, { model.setEndpoint(endpoint, dismiss) }, "Save connection") {
        Field(endpoint, { endpoint = it }, "API base URL", KeyboardType.Uri, limit = 300)
        if (BuildConfig.DEBUG) Note("Debug build: HTTP connections are unencrypted. Use a trusted local network only.", warning = true)
        if (state.user != null) Note("Changing servers signs out this account and clears its saved cloud data.", warning = true)
    }
}