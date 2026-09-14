package `in`.agrisense.mobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

fun JSONObject.text(key: String, fallback: String = ""): String =
    if (isNull(key)) fallback else optString(key, fallback)
fun JSONObject.objects(key: String): List<JSONObject> = optJSONArray(key).objects()
fun JSONArray?.objects(): List<JSONObject> = if (this == null) emptyList() else
    (0 until length()).mapNotNull { optJSONObject(it) }
fun json(vararg values: Pair<String, Any?>): JSONObject = JSONObject().apply {
    values.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
}
fun normalizeEndpoint(value: String, debug: Boolean): String {
    val endpoint = value.trim().trimEnd('/')
    val uri = runCatching { URI(endpoint) }.getOrNull()
    require(uri != null && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null &&
        uri.fragment == null && (uri.scheme == "https" || (debug && uri.scheme == "http"))) {
        if (debug) "Enter a valid HTTPS API address (HTTP is allowed for local debug only)."
        else "Enter a valid HTTPS API address."
    }
    return endpoint
}

class SecureStore(context: Context) {
    private val preferences = context.getSharedPreferences("secure-account", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("agrisense-session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("agrisense-session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun read(name: String): String? {
        val encoded = preferences.getString(name, null) ?: return null
        val parts = encoded.split(":")
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
        return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }
    fun write(name: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        check(preferences.edit().putString(name, encrypted).commit()) { "Unable to save secure data." }
    }
    fun remove(name: String) {
        check(preferences.edit().remove(name).commit()) { "Unable to remove saved data." }
    }
    fun clearAccount() {
        val editor = preferences.edit()
        preferences.all.keys.filter { it != "endpoint" }.forEach { editor.remove(it) }
        check(editor.commit()) { "Unable to clear local account data." }
    }
}

class ApiFailure(val code: Int, message: String) : Exception(message)

class ApiClient(private val context: Context) {
    private val client = OkHttpClient.Builder().connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(70, TimeUnit.SECONDS).callTimeout(80, TimeUnit.SECONDS)
        .retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build()

    suspend fun request(endpoint: String, token: String, path: String, method: String = "GET", body: JSONObject? = null): String =
        withContext(Dispatchers.IO) {
            val manager = context.getSystemService(ConnectivityManager::class.java)
            val network = manager.allNetworks.firstOrNull { candidate ->
                manager.getNetworkCapabilities(candidate)?.let {
                    it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                } == true
            }
            val transport = if (network == null) client else client.newBuilder()
                .socketFactory(network.socketFactory).dns(object : Dns {
                    override fun lookup(hostname: String) = network.getAllByName(hostname).toList()
                }).build()
            val builder = Request.Builder().url(endpoint + path).header("Accept", "application/json")
                .header("User-Agent", "AgriSense Android/0.2")
            if (token.isNotBlank()) builder.header("Authorization", "Bearer $token")
            val payload = if (method in listOf("GET", "DELETE")) null else
                (body ?: JSONObject()).toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            transport.newCall(builder.method(method, payload).build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val detail = runCatching { JSONObject(text).opt("detail") }.getOrNull()
                    val message = when (detail) {
                        is String -> detail
                        is JSONArray -> detail.objects().joinToString("\n") {
                            val location = it.optJSONArray("loc")
                            "${location?.optString((location.length() - 1).coerceAtLeast(0)).orEmpty()}: ${it.text("msg")}" }
                        else -> "Request failed (${response.code}). Try again when the service is available."
                    }
                    throw ApiFailure(response.code, message)
                }
                text
            }
        }
}