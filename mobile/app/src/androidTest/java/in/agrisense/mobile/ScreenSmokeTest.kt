package `in`.agrisense.mobile

import android.app.Application
import android.content.ContentValues
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ApplicationProvider
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class ScreenSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val server = MockWebServer()
    private lateinit var application: Application
    private lateinit var model: AppViewModel
    private val farm = """{"id":"farm-test","name":"Test Orchard","location":"Nagercoil","area_hectares":"2.5","soil_type":"loamy","latitude":"8.17899","longitude":"77.43227"}"""
    private val product = """{"id":"product-test","name":"Test Seed Pack","category":"seeds","description":"Fixture listing for screen testing only.","price_inr":"120.25","unit":"pack","in_stock":true,"crops":["rice"],"soil_types":["loamy"]}"""
    private val vendor get() = """{"id":"vendor-test","name":"Test Vendor","location":"Nagercoil","description":"A test fixture, not a real vendor.","is_demo":true,"products":[$product]}"""

    @Before fun prepare() {
        application = ApplicationProvider.getApplicationContext()
        SecureStore(application).clearAccount()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.requestUrl!!.encodedPath
                val body = when (path) {
                    "/auth/login" -> """{"access_token":"test-only-token","expires_in":1296000}"""
                    "/auth/me" -> """{"id":"user-test","full_name":"Test Farmer","email":"farmer@example.test"}"""
                    "/auth/sessions" -> """[{"id":"session-test","user_agent":"Test Android","is_current":true,"created_at":"2026-09-14T10:00:00Z","expires_at":"2026-09-29T10:00:00Z"}]"""
                    "/auth/audit" -> """{"items":[{"id":"event-test","action":"login.succeeded","user_agent":"Test Android","created_at":"2026-09-14T10:00:00Z"}],"total":1}"""
                    "/farms/" -> "[$farm]"
                    "/farms/farm-test" -> farm
                    "/farms/farm-test/devices" -> """[{"id":"device-test","name":"Test Sensor","serial_number":"TEST-001","capabilities":["soil_moisture"],"connection_status":"never_connected"}]"""
                    "/farms/farm-test/readings", "/farms/farm-test/readings/latest" -> """[{"id":"reading-test","metric":"soil_moisture","value":"42.5","unit":"%","source":"simulated","recorded_at":"2026-09-14T10:00:00Z"}]"""
                    "/farms/farm-test/analysis" -> """{"input_status":"incomplete","contains_simulated_data":true,"inputs":[],"model":{"status":"not_ready","reason":"Test fixture has incomplete inputs.","predictions":[]}}"""
                    "/weather/farms/farm-test" -> """{"location":"Nagercoil","timezone":"Asia/Kolkata","current":{"temperature_c":28,"relative_humidity_percent":75,"precipitation_mm":1,"observed_at":"2026-09-14T10:00"},"days":[],"source":"Test fixture","retrieved_at":"2026-09-14T10:00:00Z"}"""
                    "/marketplace/vendors" -> """{"items":[$vendor],"total":1}"""
                    "/marketplace/vendors/vendor-test" -> vendor
                    "/marketplace/vendors/me" -> "null"
                    "/marketplace/orders" -> """{"items":[],"total":0}"""
                    else -> return MockResponse().setResponseCode(404).setBody("""{"detail":"Unknown test route"}""")
                }
                return MockResponse().setHeader("Content-Type", "application/json").setBody(body)
            }
        }
        server.start()
        model = AppViewModel(application)
        model.setEndpoint(server.url("/").toString()) {}
        compose.setContent { AgriSenseTheme { MobileApp(model) } }
    }

    @After fun close() { server.shutdown() }

    private fun waitFor(text: String, matcher: SemanticsMatcher = hasText(text)) {
        try {
            compose.waitUntil(15_000) { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        } catch (failure: ComposeTimeoutException) {
            screenshot("failure")
            val notebookState = compose.runOnIdle {
                if (model.state.value.guest) ViewModelProvider(compose.activity)[NotebookViewModel::class.java].state.value else null
            }
            throw AssertionError("Waiting for '$text', notebook=$notebookState: ${compose.onRoot().printToString()}", failure)
        }
        compose.waitForIdle()
    }

    private fun tap(text: String) {
        compose.onNodeWithText(text).performScrollTo().performClick()
    }

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "$name.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            if (Build.VERSION.SDK_INT >= 29) put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/AgriSense")
        }
        val uri = checkNotNull(application.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values))
        checkNotNull(application.contentResolver.openOutputStream(uri)).use {
            check(compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it))
        }
    }

    @Test fun authenticatedScreenTour() {
        waitFor("Welcome back")
        screenshot("01-login")
        tap("New to AgriSense? Create account")
        waitFor("Create your account")
        screenshot("02-register")
        tap("Already have an account? Sign in")
        compose.onNodeWithText("Email address").performTextInput("farmer@example.test")
        compose.onNodeWithText("Password").performTextInput("test-password-123")
        tap("Sign in")
        waitFor("Test Orchard")
        screenshot("03-dashboard")
        compose.onNodeWithText("Farms").performClick()
        waitFor("My farms")
        screenshot("04-farms")
        tap("Test Orchard")
        waitFor("Recorded soil")
        screenshot("05-farm-detail")
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithText("Readings").performClick()
        waitFor("Field readings")
        screenshot("06-readings")
        compose.onNodeWithText("Market").performClick()
        waitFor("Test Vendor")
        screenshot("07-market")
        tap("Test Vendor")
        waitFor("Test Seed Pack")
        screenshot("08-vendor")
        compose.onNodeWithText("Order · Cash on delivery").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Back").performClick()
        compose.onNodeWithText("More").performClick()
        val screens = listOf(
            Triple("Weather & forecast", "Weather outlook", "09-weather"),
            Triple("Farm analysis", "Readiness & crop suitability", "10-analysis"),
            Triple("Farm assistant", "Farm-specific advice", "11-assistant"),
            Triple("Devices", "Cloud registry", "12-devices"),
            Triple("Local Wi-Fi connection", "Field connection", "13-connection"),
            Triple("Offline notebook", "Field notebook", "14-notebook"),
            Triple("Orders", "Cash on delivery", "15-orders"),
            Triple("My business", "Set up your business", "16-business"),
            Triple("Settings & security", "Account & settings", "17-settings"),
        )
        screens.forEach { (link, title, name) ->
            tap(link)
            waitFor(title)
            screenshot(name)
            compose.onNodeWithContentDescription("Back").performClick()
        }
        tap("Settings & security")
        listOf(Triple("Password", "Change password", "18-password"),
            Triple("Active sessions", "Signed-in devices", "19-sessions"),
            Triple("Security activity", "Account events · UTC date filter", "20-activity")).forEach { (link, title, name) ->
            tap(link)
            waitFor(title)
            screenshot(name)
            compose.onNodeWithContentDescription("Back").performClick()
        }
    }

    @Test fun offlineNotebookPreservesZero() {
        waitFor("Welcome back")
        tap("Open offline notebook")
        compose.runOnIdle { assertTrue("Offline entry did not activate", model.state.value.guest) }
        waitFor("Field notebook")
        waitFor("Add soil test", hasContentDescription("Add soil test"))
        compose.onNodeWithContentDescription("Add soil test").assertIsDisplayed().performClick()
        compose.onNodeWithText("Field name").performTextInput("Offline test field")
        compose.onNodeWithText("Value (pH)").performTextInput("0")
        compose.onNodeWithText("Save locally").performClick()
        compose.waitUntil(5_000) {
            ReadingStore(application).use { store -> store.latest().any { it.fieldLabel == "Offline test field" && it.value == "0" } }
        }
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Add soil test").fetchSemanticsNodes().isEmpty() }
        compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText("Offline test field"))
        compose.onNodeWithText("Soil pH: 0 pH").assertIsDisplayed()
        assertTrue("The local notebook must not call the cloud API", server.requestCount == 0)
        screenshot("21-offline-zero")
    }
}