package `in`.agrisense.mobile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant

data class RemoteData(val body: String = "", val loading: Boolean = false, val cached: Boolean = false,
    val fetchedAt: String = "", val error: String? = null) {
    fun objectValue(): JSONObject = runCatching { JSONObject(body) }.getOrDefault(JSONObject())
    fun rows(): List<JSONObject> = runCatching { JSONArray(body).objects() }.getOrDefault(emptyList())
}
data class AppState(val endpoint: String = "", val user: JSONObject? = null, val guest: Boolean = false,
    val busy: Boolean = false, val error: String? = null, val revision: Int = 0, val farmId: String = "",
    val resources: Map<String, RemoteData> = emptyMap(), val ready: Boolean = false)

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val vault = SecureStore(application)
    private val api = ApiClient(application)
    private var token = ""
    private var expiresAt = 0L
    private var generation = 0
    private val mutableState = MutableStateFlow(AppState())
    val state = mutableState.asStateFlow()
    val network = observeNetworks(application).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), NetworkStatus())

    init {
        try {
            val endpoint = vault.read("endpoint").orEmpty()
            val saved = vault.read("session")?.let(::JSONObject)
            if (saved != null && saved.optLong("expires_at") > System.currentTimeMillis()) {
                token = saved.getString("token")
                expiresAt = saved.getLong("expires_at")
                mutableState.value = AppState(endpoint = endpoint, user = saved.getJSONObject("user"), ready = true)
            } else {
                vault.clearAccount()
                mutableState.value = AppState(endpoint = endpoint, ready = true)
            }
        } catch (_: Exception) {
            mutableState.value = AppState(ready = true, error = "Saved sign-in could not be opened. Please sign in again.")
        }
    }

    fun clearError() { mutableState.value = state.value.copy(error = null) }
    fun fail(message: String) { mutableState.value = state.value.copy(error = message) }
    fun selectFarm(id: String) { mutableState.value = state.value.copy(farmId = id) }
    fun refresh() { mutableState.value = state.value.copy(revision = state.value.revision + 1) }
    fun guest(enabled: Boolean) { mutableState.value = state.value.copy(guest = enabled, error = null) }

    fun setEndpoint(value: String, success: () -> Unit) {
        try {
            val endpoint = normalizeEndpoint(value, BuildConfig.DEBUG)
            if (endpoint != state.value.endpoint) {
                vault.clearAccount()
                vault.write("endpoint", endpoint)
                generation++
                token = ""
                mutableState.value = AppState(endpoint = endpoint, ready = true)
            }
            clearError()
            success()
        } catch (error: Exception) { fail(error.message ?: "Could not save the server address.") }
    }

    fun authenticate(register: Boolean, name: String, email: String, password: String, confirm: String) {
        if (state.value.busy) return
        if (state.value.endpoint.isBlank()) return fail("Set your API server address first.")
        if (email.isBlank() || password.isBlank()) return fail("Enter your email and password.")
        if (register && (name.isBlank() || password.length !in 12..128 || password != confirm))
            return fail("Enter your name and matching passwords of 12 to 128 characters.")
        val epoch = generation
        mutableState.value = state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            var created = false
            try {
                val credentials = json("email" to email.trim(), "password" to password)
                if (register) {
                    api.request(state.value.endpoint, "", "/auth/register", "POST",
                        json("full_name" to name.trim(), "email" to email.trim(), "password" to password))
                    created = true
                }
                val response = JSONObject(api.request(state.value.endpoint, "", "/auth/login", "POST", credentials))
                val newToken = response.getString("access_token")
                val user = JSONObject(api.request(state.value.endpoint, newToken, "/auth/me"))
                if (epoch != generation) return@launch
                vault.clearAccount()
                expiresAt = System.currentTimeMillis() + response.getLong("expires_in") * 1000
                vault.write("session", json("token" to newToken, "user" to user, "expires_at" to expiresAt).toString())
                token = newToken
                mutableState.value = AppState(endpoint = state.value.endpoint, user = user, ready = true)
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (error: Exception) {
                if (epoch == generation) mutableState.value = state.value.copy(busy = false,
                    error = (if (created) "Account created. Sign in to continue. " else "") + errorMessage(error))
            }
        }
    }

    private fun cacheKey(path: String): String {
        val scope = state.value.endpoint + "|" + state.value.user?.text("id") + "|" + path
        return "cache-" + MessageDigest.getInstance("SHA-256").digest(scope.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    private fun put(path: String, resource: RemoteData) {
        mutableState.value = state.value.copy(resources = state.value.resources + (path to resource))
    }
    fun load(path: String) {
        if (state.value.user == null || path.isBlank() || state.value.resources[path]?.loading == true) return
        if (expiresAt <= System.currentTimeMillis()) { forget("Your session expired. Sign in again."); return }
        val epoch = generation
        val key = cacheKey(path)
        var previous = state.value.resources[path] ?: RemoteData()
        if (previous.body.isBlank()) {
            runCatching { vault.read(key)?.let(::JSONObject) }.getOrNull()?.let {
                previous = RemoteData(body = it.text("body"), fetchedAt = it.text("time"), cached = true)
            }
        }
        if (path == "/farms/" && previous.body.isNotBlank()) {
            val farms = previous.rows()
            if (farms.none { it.text("id") == state.value.farmId }) selectFarm(farms.firstOrNull()?.text("id").orEmpty())
        }
        put(path, previous.copy(loading = true, error = null))
        viewModelScope.launch {
            try {
                val result = api.request(state.value.endpoint, token, path)
                if (epoch != generation) return@launch
                val time = Instant.now().toString()
                runCatching { vault.write(key, json("body" to result, "time" to time).toString()) }
                put(path, RemoteData(body = result, fetchedAt = time))
                if (path == "/farms/") {
                    val farms = JSONArray(result).objects()
                    if (farms.none { it.text("id") == state.value.farmId }) selectFarm(farms.firstOrNull()?.text("id").orEmpty())
                }
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (error: Exception) {
                if (epoch != generation) return@launch
                if (error is ApiFailure && error.code == 401) forget("Please sign in again.")
                else if (error is ApiFailure && error.code in listOf(403, 404)) {
                    runCatching { vault.remove(key) }
                    put(path, RemoteData(error = errorMessage(error)))
                }
                else put(path, previous.copy(loading = false, cached = previous.body.isNotBlank(), error = errorMessage(error)))
            }
        }
    }

    fun mutate(path: String, method: String, body: JSONObject? = null, success: (String) -> Unit = {}) {
        if (state.value.busy) return
        if (token.isBlank() || expiresAt <= System.currentTimeMillis()) { forget("Please sign in again."); return }
        if (!network.value.internetValidated) return fail("Internet is unavailable. No changes were sent.")
        val epoch = generation
        mutableState.value = state.value.copy(busy = true, error = null)
        viewModelScope.launch {
            try {
                val result = api.request(state.value.endpoint, token, path, method, body)
                if (epoch != generation) return@launch
                mutableState.value = state.value.copy(busy = false)
                success(result)
                refresh()
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (error: Exception) {
                if (epoch != generation) return@launch
                if (error is ApiFailure && error.code == 401) forget("Please sign in again.")
                else mutableState.value = state.value.copy(busy = false, error = errorMessage(error) +
                    if (error !is ApiFailure) " Check current records before retrying; the request may have reached the server." else "")
            }
        }
    }
    fun saveProfile(name: String) = mutate("/auth/profile", "PUT", json("full_name" to name.trim())) { result ->
        val user = JSONObject(result)
        vault.write("session", json("token" to token, "user" to user, "expires_at" to expiresAt).toString())
        mutableState.value = state.value.copy(user = user)
    }
    fun logout() = mutate("/auth/logout", "POST") { forget() }
    fun forget(message: String? = null) {
        generation++
        token = ""
        expiresAt = 0
        val cleared = runCatching { vault.clearAccount() }.isSuccess
        mutableState.value = AppState(endpoint = state.value.endpoint, ready = true,
            error = if (cleared) message else "Local account removal could not be confirmed. Clear this app's storage in Android settings before sharing the phone.")
    }
    private fun errorMessage(error: Exception): String = if (error is ApiFailure) error.message.orEmpty()
        else "Unable to reach the API. Check the server address and network connection."
}