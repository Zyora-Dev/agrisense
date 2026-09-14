package `in`.agrisense.mobile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
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
import java.util.UUID

val categories = listOf("seeds", "fertilizers", "soil_care", "irrigation", "crop_care")
private val orderStatuses = listOf("placed", "confirmed", "shipped", "delivered", "cancelled")

@Composable
fun MarketScreen(model: AppViewModel, state: AppState, navigate: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var applied by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf("") }
    var demo by rememberSaveable { mutableStateOf(true) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var matches by remember { mutableStateOf<JSONObject?>(null) }
    LaunchedEffect(state.farmId) { matches = null }
    val path = "/marketplace/vendors?query=${encoded(applied)}&page=$page&page_size=12&include_demo=$demo" +
        if (category.isBlank()) "" else "&category=$category"
    val data = rememberRemote(model, path)
    val catalog = data.objectValue()
    Page {
        Heading("Farm marketplace", "Supplies & local vendors", action = {
            IconButton(onClick = { navigate("orders") }) { Icon(Icons.Default.ReceiptLong, "My orders") }
        })
        Field(query, { query = it }, "Product, vendor or location", limit = 100)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.weight(1f)) { Choice("Category", category, listOf("" to "All categories") + categories.map { it to label(it) }) { category = it; page = 1 } }
            FilledTonalIconButton(onClick = { applied = query.trim(); page = 1 }, Modifier.size(52.dp)) { Icon(Icons.Default.Search, "Search marketplace") }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(demo, { demo = it; page = 1 }); Text("Show fictional demo listings", Modifier.padding(start = 12.dp))
        }
        ResourceStatus(data) { model.load(path) }
        catalog.objects("items").forEach { vendor -> OutlinedCard(onClick = { navigate("vendor/${vendor.text("id")}") }) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.Storefront, null, tint = MaterialTheme.colorScheme.primary)
                Text(vendor.text("name"), style = MaterialTheme.typography.titleLarge)
                Text(vendor.text("location"))
                if (vendor.optBoolean("is_demo")) Text("Fictional demo · not purchasable", color = MaterialTheme.colorScheme.error)
                Text(vendor.text("description"), style = MaterialTheme.typography.bodyMedium)
                Text("${vendor.objects("products").size} products", style = MaterialTheme.typography.labelLarge)
            }
        } }
        if (!data.loading && catalog.objects("items").isEmpty()) EmptyState("No vendors found", "No listings match the current filters.", Icons.Default.Storefront)
        Pagination(page, catalog.optInt("total"), 12) { page = it }
        HorizontalDivider()
        Heading("Matches for your farm", "Based on the selected farm report")
        FarmPicker(model, state)
        OutlinedButton(onClick = {
            model.mutate("/marketplace/farms/${state.farmId}/recommendations", "POST", JSONObject()) { matches = JSONObject(it) }
        }, enabled = state.farmId.isNotBlank() && !state.busy, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Default.AutoAwesome, null); Text(" Find farm matches")
        }
        matches?.let { result ->
            if (result.optBoolean("uses_simulated_data")) Note("Matches depend on simulated inputs.", warning = true)
            Text(result.text("summary"))
            result.objects("matches").forEach { match ->
                val product = match.optJSONObject("product") ?: JSONObject()
                val vendor = match.optJSONObject("vendor") ?: JSONObject()
                OutlinedCard(onClick = { navigate("vendor/${vendor.text("id")}") }) {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(product.text("name"), style = MaterialTheme.typography.titleMedium)
                        Text(vendor.text("name"))
                        if (vendor.optBoolean("is_demo")) Text("Fictional demo", color = MaterialTheme.colorScheme.error)
                        Text(match.text("reason")); Text(match.text("precaution"), color = MaterialTheme.colorScheme.secondary)
                    }
                }
            }
            Text(result.text("disclaimer"), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
fun VendorScreen(model: AppViewModel, state: AppState, id: String, navigate: (String) -> Unit) {
    val path = "/marketplace/vendors/$id"
    val data = rememberRemote(model, path)
    val own = rememberRemote(model, "/marketplace/vendors/me").objectValue()
    val vendor = data.objectValue()
    var checkout by remember { mutableStateOf<JSONObject?>(null) }
    val context = LocalContext.current
    Page {
        Heading(vendor.text("name", "Vendor"), vendor.text("location"))
        ResourceStatus(data) { model.load(path) }
        if (vendor.has("id")) {
            if (vendor.optBoolean("is_demo")) Note("Fictional demo vendor. These listings cannot be ordered.", warning = true)
            Text(vendor.text("description"))
            if (vendor.text("phone").isNotBlank()) TextButton(onClick = {
                runCatching { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Uri.encode(vendor.text("phone"))}"))) }
                    .onFailure { model.fail("No phone application is available.") }
            }) { Icon(Icons.Default.Call, null); Text(" ${vendor.text("phone")}") }
            if (vendor.text("contact_email").isNotBlank()) TextButton(onClick = {
                runCatching { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${Uri.encode(vendor.text("contact_email"))}"))) }
                    .onFailure { model.fail("No email application is available.") }
            }) { Icon(Icons.Default.Email, null); Text(" ${vendor.text("contact_email")}") }
            HorizontalDivider()
            Text("Products", style = MaterialTheme.typography.headlineSmall)
            vendor.objects("products").forEach { product -> ProductCard(product) {
                Button(onClick = { model.clearError(); checkout = product }, enabled = !vendor.optBoolean("is_demo") && product.optBoolean("in_stock") &&
                    own.text("id") != id && !state.busy, modifier = Modifier.fillMaxWidth()) {
                    Text(if (own.text("id") == id) "Your listing" else if (product.optBoolean("in_stock")) "Order · Cash on delivery" else "Out of stock")
                }
            } }
            if (vendor.objects("products").isEmpty()) EmptyState("No products listed", "This vendor has no products available yet.", Icons.Default.Inventory2)
        }
    }
    checkout?.let { product -> CheckoutSheet(model, product, { checkout = null }) { checkout = null; navigate("orders") } }
}

@Composable
private fun ProductCard(product: JSONObject, actions: @Composable ColumnScope.() -> Unit) {
    OutlinedCard {
        Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(when (product.text("category")) {
                "irrigation" -> Icons.Default.WaterDrop
                "crop_care" -> Icons.Default.HealthAndSafety
                "soil_care" -> Icons.Default.Science
                else -> Icons.Default.Spa
            }, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.primary)
            Text(label(product.text("category")), style = MaterialTheme.typography.labelLarge)
            Text(product.text("name"), style = MaterialTheme.typography.titleLarge)
            Text(product.text("description"))
            Text("INR ${product.text("price_inr")} / ${product.text("unit")}", style = MaterialTheme.typography.titleMedium)
            val crops = product.optJSONArray("crops")
            if (crops != null && crops.length() > 0) Text("Crops: ${(0 until crops.length()).joinToString { crops.getString(it) }}")
            val soils = product.optJSONArray("soil_types")
            if (soils != null && soils.length() > 0) Text("Soils: ${(0 until soils.length()).joinToString { label(soils.getString(it)) }}")
            actions()
        }
    }
}

@Composable
private fun CheckoutSheet(model: AppViewModel, product: JSONObject, dismiss: () -> Unit, placed: () -> Unit) {
    var quantity by rememberSaveable { mutableStateOf("1") }
    var name by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var address by rememberSaveable { mutableStateOf("") }
    var city by rememberSaveable { mutableStateOf("") }
    var postal by rememberSaveable { mutableStateOf("") }
    val fingerprint = listOf(product.text("id"), product.text("price_inr"), quantity, name, phone, address, city, postal).joinToString("|")
    val requestId = rememberSaveable(fingerprint) { UUID.randomUUID().toString() }
    FormSheet("Cash on delivery", model, dismiss, {
        val count = quantity.toIntOrNull()
        if (count == null || count !in 1..100) model.fail("Quantity must be between 1 and 100.")
        else model.mutate("/marketplace/orders", "POST", json("request_id" to requestId, "product_id" to product.text("id"),
            "quantity" to count, "expected_price_inr" to product.text("price_inr"), "recipient_name" to name.trim(),
            "phone" to phone.trim(), "address" to address.trim(), "city" to city.trim(), "postal_code" to postal.trim(), "payment_method" to "cod")) { placed() }
    }, "Place COD order") {
        Text(product.text("name"), style = MaterialTheme.typography.titleMedium)
        Field(quantity, { quantity = it }, "Quantity", KeyboardType.Number, limit = 3)
        val count = quantity.toIntOrNull()
        val price = product.text("price_inr").toBigDecimalOrNull()
        if (count != null && price != null) Text("Total: INR ${price.multiply(count.toBigDecimal()).toPlainString()}", style = MaterialTheme.typography.titleLarge)
        Field(name, { name = it }, "Recipient name", limit = 100)
        Field(phone, { phone = it }, "Phone", KeyboardType.Phone, limit = 30)
        Field(address, { address = it }, "Delivery address", multiline = true, limit = 500)
        Field(city, { city = it }, "City", limit = 100)
        Field(postal, { postal = it }, "Postal code", KeyboardType.Number, limit = 6)
        Note("Payment is collected by the seller on delivery. Availability and order changes are confirmed by the server.")
    }
}

@Composable
fun OrdersScreen(model: AppViewModel, state: AppState) {
    var role by rememberSaveable { mutableStateOf("buyer") }
    var status by rememberSaveable { mutableStateOf("") }
    var start by rememberSaveable { mutableStateOf("") }
    var end by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var detail by remember { mutableStateOf<JSONObject?>(null) }
    var transition by remember { mutableStateOf<Pair<String, String>?>(null) }
    LaunchedEffect(role, status, start, end) { page = 1 }
    val path = if (!validDates(start, end)) "" else "/marketplace/orders?role=$role&page=$page&page_size=10" +
        (if (status.isBlank()) "" else "&status=$status") + dateQuery(start, end)
    val data = rememberRemote(model, path)
    val results = data.objectValue()
    Page {
        Heading("Orders", "Cash on delivery")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            listOf("buyer" to "Purchases", "vendor" to "Sales").forEachIndexed { index, option ->
                SegmentedButton(selected = role == option.first, onClick = { role = option.first; detail = null },
                    shape = SegmentedButtonDefaults.itemShape(index, 2)) { Text(option.second) }
            }
        }
        Choice("Status", status, listOf("" to "All statuses") + orderStatuses.map { it to label(it) }) { status = it }
        DateFilters(start, end, { start = it }, { end = it })
        Text("Dates use UTC", style = MaterialTheme.typography.bodySmall)
        ResourceStatus(data) { model.load(path) }
        results.objects("items").forEach { order -> OutlinedCard(onClick = { detail = order }) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(label(order.text("status")), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                Text(order.text("product_name"), style = MaterialTheme.typography.titleLarge)
                Text("${order.text("quantity")} × INR ${order.text("unit_price_inr")} · INR ${order.text("total_inr")}")
                Text(if (role == "buyer") order.text("vendor_name") else order.text("recipient_name"))
                Text(displayTime(order.text("created_at")), style = MaterialTheme.typography.bodySmall)
            }
        } }
        if (!data.loading && results.objects("items").isEmpty()) EmptyState("No orders found", "No orders match the current filters.", Icons.Default.ReceiptLong)
        Pagination(page, results.optInt("total"), 10) { page = it }
    }
    detail?.let { selected ->
        val order = results.objects("items").firstOrNull { it.text("id") == selected.text("id") } ?: selected
        val actions = if (role == "buyer") { if (order.text("status") == "placed") listOf("cancelled") else emptyList() }
        else when (order.text("status")) { "placed" -> listOf("confirmed", "cancelled"); "confirmed" -> listOf("shipped", "cancelled");
            "shipped" -> listOf("delivered"); else -> emptyList() }
        FormSheet("Order details", model, { detail = null }, { detail = null }, "Close") {
            Text(order.text("product_name"), style = MaterialTheme.typography.titleLarge)
            Text("Order ${order.text("id")}", style = MaterialTheme.typography.bodySmall)
            Text("${label(order.text("status"))} · INR ${order.text("total_inr")}")
            Text("${order.text("quantity")} × INR ${order.text("unit_price_inr")} / ${order.text("unit")}")
            Text("${order.text("recipient_name")}\n${order.text("phone")}\n${order.text("address")}\n${order.text("city")} ${order.text("postal_code")}")
            Text("Seller: ${order.text("vendor_name")}\n${order.text("vendor_phone")}\n${order.text("vendor_email")}")
            Text("COD: ${label(order.text("payment_status"))}${if (order.text("payment_status") == "collected") " (seller-reported)" else ""}")
            Text("Updated ${displayTime(order.text("updated_at"))}", style = MaterialTheme.typography.bodySmall)
            actions.forEach { next -> OutlinedButton(onClick = { transition = order.text("id") to next }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) {
                Text(when (next) { "cancelled" -> "Cancel order"; "confirmed" -> "Confirm order"; "shipped" -> "Mark shipped"; else -> "Mark delivered & cash collected" })
            } }
        }
    }
    transition?.let { (id, next) -> Confirm("Update order?", if (next == "delivered") "Confirm delivery and cash collection. This records the seller's confirmation."
        else "Change order status to ${label(next)}?", state.busy, { transition = null }) {
        model.mutate("/marketplace/orders/$id", "PUT", json("status" to next)) { detail = JSONObject(it); transition = null }
    } }
}

@Composable
fun BusinessScreen(model: AppViewModel, state: AppState) {
    val data = rememberRemote(model, "/marketplace/vendors/me")
    val vendor = data.objectValue().takeIf { it.has("id") }
    var profile by rememberSaveable { mutableStateOf(false) }
    var product by remember { mutableStateOf<JSONObject?>(null) }
    var add by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<JSONObject?>(null) }
    Page {
        Heading("My business", vendor?.text("name") ?: "Vendor profile")
        ResourceStatus(data) { model.load("/marketplace/vendors/me") }
        if (vendor == null && !data.loading) EmptyState("Set up your business", "No vendor profile is linked to this account.", Icons.Default.Storefront,
            "Create vendor profile", { model.clearError(); profile = true })
        if (vendor != null) {
            Text(vendor.text("location"), style = MaterialTheme.typography.titleMedium)
            Text(if (vendor.optBoolean("is_active")) "Published" else "Hidden from marketplace", color = MaterialTheme.colorScheme.primary)
            Text(vendor.text("description"))
            OutlinedButton(onClick = { model.clearError(); profile = true }) { Icon(Icons.Default.Edit, null); Text(" Edit business") }
            HorizontalDivider()
            Heading("Your products", "${vendor.objects("products").size} / 30 listings", action = {
                IconButton(onClick = { model.clearError(); add = true }, enabled = vendor.objects("products").size < 30) { Icon(Icons.Default.Add, "Add product") }
            })
            vendor.objects("products").forEach { item -> ProductCard(item) {
                Text(if (item.optBoolean("in_stock")) "In stock" else "Out of stock")
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { model.clearError(); product = item }) { Icon(Icons.Default.Edit, null); Text(" Edit") }
                    IconButton(onClick = { deleting = item }) { Icon(Icons.Default.DeleteOutline, "Delete ${item.text("name")}") }
                }
            } }
        }
    }
    if (profile) VendorEditor(model, vendor) { profile = false }
    if (add || product != null) ProductEditor(model, product) { add = false; product = null }
    deleting?.let { item -> Confirm("Delete product?", "Remove ${item.text("name")} from the catalog? Existing orders retain their details.",
        state.busy, { deleting = null }) { model.mutate("/marketplace/products/${item.text("id")}", "DELETE") { deleting = null } } }
}

@Composable
private fun VendorEditor(model: AppViewModel, vendor: JSONObject?, dismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(vendor?.text("name").orEmpty()) }
    var location by rememberSaveable { mutableStateOf(vendor?.text("location").orEmpty()) }
    var description by rememberSaveable { mutableStateOf(vendor?.text("description").orEmpty()) }
    var email by rememberSaveable { mutableStateOf(vendor?.text("contact_email").orEmpty()) }
    var phone by rememberSaveable { mutableStateOf(vendor?.text("phone").orEmpty()) }
    var active by rememberSaveable { mutableStateOf(vendor?.optBoolean("is_active") ?: true) }
    FormSheet(if (vendor == null) "Create vendor profile" else "Edit vendor profile", model, dismiss, {
        model.mutate(if (vendor == null) "/marketplace/vendors" else "/marketplace/vendors/me", if (vendor == null) "POST" else "PUT",
            json("name" to name.trim(), "location" to location.trim(), "description" to description.trim(), "contact_email" to email.trim(),
                "phone" to phone.trim(), "is_active" to active)) { dismiss() }
    }) {
        Field(name, { name = it }, "Business name", limit = 100)
        Field(location, { location = it }, "Location", limit = 200)
        Field(description, { description = it }, "Description (10+ characters)", multiline = true, limit = 1000)
        Field(email, { email = it }, "Public contact email", KeyboardType.Email, limit = 254)
        Field(phone, { phone = it }, "Public phone", KeyboardType.Phone, limit = 30)
        Row(verticalAlignment = Alignment.CenterVertically) { Switch(active, { active = it }); Text(" Published", Modifier.padding(start = 10.dp)) }
    }
}

@Composable
private fun ProductEditor(model: AppViewModel, product: JSONObject?, dismiss: () -> Unit) {
    var name by rememberSaveable { mutableStateOf(product?.text("name").orEmpty()) }
    var category by rememberSaveable { mutableStateOf(product?.text("category") ?: "seeds") }
    var description by rememberSaveable { mutableStateOf(product?.text("description").orEmpty()) }
    var price by rememberSaveable { mutableStateOf(product?.text("price_inr").orEmpty()) }
    var unit by rememberSaveable { mutableStateOf(product?.text("unit").orEmpty()) }
    var crops by rememberSaveable { mutableStateOf(product?.optJSONArray("crops")?.let { values -> (0 until values.length()).joinToString(", ") { values.getString(it) } }.orEmpty()) }
    var soils by rememberSaveable { mutableStateOf<List<String>>(product?.optJSONArray("soil_types")?.let { values -> (0 until values.length()).map { values.getString(it) } } ?: emptyList()) }
    var stock by rememberSaveable { mutableStateOf(product?.optBoolean("in_stock") ?: true) }
    FormSheet(if (product == null) "Add product" else "Edit product", model, dismiss, {
        model.mutate(if (product == null) "/marketplace/products" else "/marketplace/products/${product.text("id")}", if (product == null) "POST" else "PUT",
            json("name" to name.trim(), "category" to category, "description" to description.trim(), "price_inr" to price,
                "unit" to unit.trim(), "crops" to JSONArray(crops.split(',').map { it.trim() }.filter { it.isNotBlank() }),
                "soil_types" to JSONArray(soils), "in_stock" to stock)) { dismiss() }
    }) {
        Field(name, { name = it }, "Product name", limit = 100)
        Choice("Category", category, categories.map { it to label(it) }) { category = it }
        Field(description, { description = it }, "Description (10+ characters)", multiline = true, limit = 1000)
        Field(price, { price = it }, "Price (INR)", KeyboardType.Decimal, limit = 12)
        Field(unit, { unit = it }, "Unit, e.g. 1 kg bag", limit = 60)
        Field(crops, { crops = it }, "Crops (comma-separated)", limit = 750)
        Text("Suitable soil types", style = MaterialTheme.typography.titleMedium)
        soilNames.forEach { soil -> Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(soil in soils, { soils = if (it) soils + soil else soils - soil }); Text(label(soil))
        } }
        Row(verticalAlignment = Alignment.CenterVertically) { Switch(stock, { stock = it }); Text(" In stock", Modifier.padding(start = 10.dp)) }
    }
}