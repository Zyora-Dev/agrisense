package `in`.agrisense.mobile

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow

fun observeNetworks(context: Context) = callbackFlow {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val networks = mutableMapOf<Network, NetworkStatus>()
    val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            networks[network] = NetworkStatus(
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
            )
            trySend(networkStatus(networks.values))
        }

        override fun onLost(network: Network) {
            networks.remove(network)
            trySend(networkStatus(networks.values))
        }
    }
    manager.registerNetworkCallback(
        NetworkRequest.Builder().clearCapabilities().build(), callback, Handler(Looper.getMainLooper()),
    )
    awaitClose { manager.unregisterNetworkCallback(callback) }
}