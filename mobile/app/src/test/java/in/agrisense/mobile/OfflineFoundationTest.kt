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

    @Test fun endpointRequiresSafeOrigin() {
        assertEquals("https://example.test/api", normalizeEndpoint(" https://example.test/api/ ", false))
        assertEquals("http://192.168.4.1:8000", normalizeEndpoint("http://192.168.4.1:8000/", true))
        listOf("http://example.test", "https://user:secret@example.test", "https://example.test?token=x",
            "https://example.test#secret", "file:///tmp/data", "not a url").forEach { endpoint ->
            assertThrows(IllegalArgumentException::class.java) { normalizeEndpoint(endpoint, false) }
        }
    }

    @Test fun dateFiltersRejectInvalidAndReversedDates() {
        assertTrue(validDates("", ""))
        assertTrue(validDates("2026-09-01", "2026-09-14"))
        assertFalse(validDates("2026-09-15", "2026-09-14"))
        assertFalse(validDates("2026-02-30", ""))
        assertEquals("&start_date=2026-09-01&end_date=2026-09-14", dateQuery("2026-09-01", "2026-09-14"))
    }

    @Test fun absentJsonAndNullFieldsDoNotInventValues() {
        val record = json("value" to "0", "source" to "manual", "missing" to null)
        assertEquals("0", record.text("value"))
        assertEquals("Not recorded", record.text("missing", "Not recorded"))
        assertEquals("Not recorded", record.text("absent", "Not recorded"))
        assertTrue(RemoteData().rows().isEmpty())
        assertEquals(0, RemoteData().objectValue().length())
    }
}