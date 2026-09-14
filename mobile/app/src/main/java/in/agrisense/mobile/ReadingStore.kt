package `in`.agrisense.mobile

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class ReadingStore(context: Context) : SQLiteOpenHelper(context, "field-notebook.db", null, 1) {
    override fun onCreate(database: SQLiteDatabase) {
        database.execSQL("""
            CREATE TABLE soil_readings (
                id TEXT PRIMARY KEY,
                field_label TEXT NOT NULL,
                metric TEXT NOT NULL,
                value TEXT NOT NULL,
                recorded_at TEXT NOT NULL
            )
        """.trimIndent())
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error("A non-destructive migration is required from $oldVersion to $newVersion.")
    }

    @Synchronized
    fun save(reading: SoilReading) {
        writableDatabase.insertOrThrow("soil_readings", null, ContentValues().apply {
            put("id", reading.id)
            put("field_label", reading.fieldLabel)
            put("metric", reading.metric.name)
            put("value", reading.value)
            put("recorded_at", reading.recordedAt)
        })
    }

    @Synchronized
    fun latest(): List<SoilReading> = readableDatabase.query(
        "soil_readings", arrayOf("id", "field_label", "metric", "value", "recorded_at"),
        null, null, null, null, "rowid DESC", "100",
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(SoilReading(cursor.getString(0), cursor.getString(1),
                    SoilMetric.valueOf(cursor.getString(2)), cursor.getString(3), cursor.getString(4)))
            }
        }
    }

    @Synchronized
    override fun close() = super.close()
}