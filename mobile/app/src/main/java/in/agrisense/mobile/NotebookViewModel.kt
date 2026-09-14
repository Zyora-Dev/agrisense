package `in`.agrisense.mobile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class NotebookState(
    val readings: List<SoilReading> = emptyList(),
    val loading: Boolean = true,
    val saving: Boolean = false,
    val error: String? = null,
)

class NotebookViewModel(application: Application) : AndroidViewModel(application) {
    private val store = ReadingStore(application)
    private val mutableState = MutableStateFlow(NotebookState())
    val state = mutableState.asStateFlow()
    val connectivity = observeNetworks(application).stateIn(
        viewModelScope, SharingStarted.WhileSubscribed(5_000), NetworkStatus(),
    )

    init { reload() }

    fun reload() {
        if (state.value.saving) return
        mutableState.value = state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val readings = withContext(Dispatchers.IO) { store.latest() }
                mutableState.value = state.value.copy(readings = readings, loading = false)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                mutableState.value = state.value.copy(loading = false, error = "Could not read local records.")
            }
        }
    }

    fun save(field: String, metric: SoilMetric, value: String, onSaved: () -> Unit) {
        if (state.value.saving || state.value.loading) return
        val reading = try {
            newSoilReading(field, metric, value)
        } catch (invalid: IllegalArgumentException) {
            mutableState.value = state.value.copy(error = invalid.message)
            return
        }
        mutableState.value = state.value.copy(saving = true, error = null)
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) { store.save(reading) }
                mutableState.value = state.value.copy(
                    readings = (listOf(reading) + state.value.readings).take(100), saving = false,
                )
                onSaved()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                mutableState.value = state.value.copy(saving = false, error = "Could not save. Your entry has been kept.")
            }
        }
    }

    fun clearError() { mutableState.value = state.value.copy(error = null) }

    override fun onCleared() { store.close() }
}