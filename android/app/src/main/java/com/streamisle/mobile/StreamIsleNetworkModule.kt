package com.streamisle.mobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * TLS 白名单与诊断模块（M1 基座 classic module，04 §4.6 终态命名对齐）：
 * - setBypassHosts：全量覆写「豁免证书校验」的 host:port 白名单；
 * - probe：trust-all 专用 client 发一次 HEAD 诊断 → resolve "OK" / "TLS_FAIL" / "UNREACHABLE"
 *   （TLS_ERROR 唯一生产者，AuthService.connect 探测链路消费）。
 * 模块注册名固定 "StreamIsleNetwork"（JS 侧 NativeModules.StreamIsleNetwork 同名契约）。
 */
class StreamIsleNetworkModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "StreamIsleNetwork"

  /** 全量覆写白名单（04 §4.6：syncTlsBypassHosts 传去重后的 host:port 列表） */
  @ReactMethod
  fun setBypassHosts(hostList: ReadableArray) {
    val next = mutableListOf<String>()
    for (i in 0 until hostList.size()) {
      val value = hostList.getString(i)
      if (value != null) {
        next.add(value)
      }
    }
    StreamIsleNetworkState.setAll(next)
  }

  /**
   * trust-all HEAD 诊断：拿到任意 HTTP 响应（含 4xx/5xx）即服务器可达且证书层可协商 → OK；
   * SSL/证书异常 → TLS_FAIL；其余网络异常/超时 → UNREACHABLE。
   * 诊断用独立 trust-all client（不影响正常请求通道的严格校验）。
   */
  @ReactMethod
  fun probe(url: String, promise: Promise) {
    try {
      val trustAll = arrayOf<TrustManager>(TrustAllManager)
      val sslContext = SSLContext.getInstance("TLS")
      sslContext.init(null, trustAll, java.security.SecureRandom())
      val client = OkHttpClient.Builder()
        .sslSocketFactory(sslContext.socketFactory, TrustAllManager)
        .hostnameVerifier { _, _ -> true }
        .connectTimeout(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .build()
      val request = Request.Builder().url(url).head().build()
      client.newCall(request).execute().use {
        promise.resolve("OK")
      }
    } catch (error: SSLException) {
      promise.resolve("TLS_FAIL")
    } catch (error: Exception) {
      promise.resolve("UNREACHABLE")
    }
  }

  companion object {
    /** 诊断超时（秒；与 constant/api PROBE_TIMEOUT_MS 同量级） */
    private const val PROBE_TIMEOUT_SECONDS = 10L

    /** trust-all 信任管理器（仅 probe 诊断使用） */
    private val TrustAllManager = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) = Unit
      override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) = Unit
      override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
    }
  }
}
