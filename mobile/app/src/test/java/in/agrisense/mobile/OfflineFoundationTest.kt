package `in`.agrisense.mobile

import org.junit.Assert.*
import org.junit.Test

class OfflineFoundationTest {
    @Test fun zeroIsAReading() {
        val reading = newSoilReading("  South field  ", SoilMetric.PH, "0")
        assertEquals("0", reading.value)
        assertEquals("South field", reading.fieldLabel)
    }

    @Test fun invalidReadingsAreRejected() {
        listOf("", "NaN", "Infinity", "-1", "14.0001", "1.23456", "1e1").forEach { value ->
            assertThrows(IllegalArgumentException::class.java) { newSoilReading("Field", SoilMetric.PH, value) }
        }
        assertThrows(IllegalArgumentException::class.java) { newSoilReading(" ", SoilMetric.PH, "7") }
        assertThrows(IllegalArgumentException::class.java) { newSoilReading("Field", SoilMetric.NITROGEN, "10001") }
    }

    @Test fun valuesKeepFourDecimalPlacesAndUniqueIds() {
        val first = newSoilReading("Field", SoilMetric.PH, "6.1234")
        val second = newSoilReading("Field", SoilMetric.NITROGEN, "10000")
        assertEquals("6.1234", first.value)
        assertNotEquals(first.id, second.id)
    }

    @Test fun localWifiDoesNotMeanInternet() {
        val status = networkStatus(listOf(NetworkStatus(wifiAvailable = true)))
        assertTrue(status.wifiAvailable)
        assertFalse(status.internetValidated)
    }

    @Test fun wifiAndCellularCanCoexist() {
        val status = networkStatus(listOf(NetworkStatus(wifiAvailable = true), NetworkStatus(internetValidated = true)))
        assertTrue(status.wifiAvailable)
        assertTrue(status.internetValidated)
        assertEquals(NetworkStatus(), networkStatus(emptyList()))
    }
}