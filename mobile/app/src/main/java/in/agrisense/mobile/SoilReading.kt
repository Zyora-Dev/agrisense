package `in`.agrisense.mobile

import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

enum class SoilMetric(val title: String, val unit: String, val maximum: BigDecimal) {
    PH("Soil pH", "pH", BigDecimal("14")),
    NITROGEN("Nitrogen", "mg/kg", BigDecimal("10000")),
    PHOSPHORUS("Phosphorus", "mg/kg", BigDecimal("10000")),
    POTASSIUM("Potassium", "mg/kg", BigDecimal("10000"));
}

data class SoilReading(
    val id: String,
    val fieldLabel: String,
    val metric: SoilMetric,
    val value: String,
    val recordedAt: String,
)

fun newSoilReading(fieldLabel: String, metric: SoilMetric, input: String): SoilReading {
    val label = fieldLabel.trim()
    require(label.isNotEmpty() && label.length <= 100) { "Enter a field name of 1 to 100 characters." }
    val text = input.trim()
    require(Regex("[0-9]+(?:\\.[0-9]{1,4})?").matches(text)) {
        "Enter a non-negative number with up to four decimal places."
    }
    val number = text.toBigDecimal()
    require(number <= metric.maximum) { "${metric.title} must be between 0 and ${metric.maximum}." }
    return SoilReading(UUID.randomUUID().toString(), label, metric, number.toPlainString(), Instant.now().toString())
}

data class NetworkStatus(val wifiAvailable: Boolean = false, val internetValidated: Boolean = false)

fun networkStatus(networks: Collection<NetworkStatus>) = NetworkStatus(
    wifiAvailable = networks.any { it.wifiAvailable },
    internetValidated = networks.any { it.internetValidated },
)