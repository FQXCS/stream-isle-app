package com.streamisle.mobile

import com.facebook.react.modules.network.OkHttpClientProvider
import java.security.KeyStore
import java.security.SecureRandom
import javax.net.ssl.SSLContext
import java.net.Socket
import javax.net.ssl.SSLEngine
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedTrustManager
import okhttp3.Interceptor

/**
 * OkHttp 注入点（M1 文档 §4.5.4 / 07 决策 M1-S4：`setCustomClientBuilder` 在 RN 0.88 不存在，
 * 实测采用文档备选 `setOkHttpClientFactory`；07 决策 M4-S2：白名单键 = host:port）。
 * 语义：默认严格（系统 TrustManager），仅请求 host:port 命中白名单时在 checkServerTrusted
 * 豁免证书链校验；主机名校验保持 OkHttp 默认。
 */
object StreamIsleNetworkInjection {

  /** 当前请求的 host:port（拦截器捕获；OkHttp url.port 恒为具体端口，与 JS 键一致） */
  private val currentHostPort = ThreadLocal<String>()

  /** 安装（MainApplication.onCreate 调用一次）：工厂内基于 createClientBuilder 加装 */
  fun install() {
    val trustManager = selectiveTrustManager()
    val sslContext = SSLContext.getInstance("TLS")
    sslContext.init(null, arrayOf(trustManager), SecureRandom())
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder()
        .sslSocketFactory(sslContext.socketFactory, trustManager)
        .addInterceptor(hostCaptureInterceptor)
        .build()
    }
  }

  /** host:port 捕获拦截器：请求前置 ThreadLocal，供信任管理器按 host:port 判定 */
  private val hostCaptureInterceptor = Interceptor { chain ->
    val url = chain.request().url
    currentHostPort.set("${url.host}:${url.port}")
    try {
      chain.proceed(chain.request())
    } finally {
      currentHostPort.remove()
    }
  }

  /** 选择性信任管理器：白名单命中 → 跳过服务端证书链校验；否则委托系统默认（严格基线） */
  private fun selectiveTrustManager(): X509ExtendedTrustManager {
    val delegate = defaultTrustManager()
    return object : X509ExtendedTrustManager() {
      private fun bypassed(): Boolean {
        val hostPort = currentHostPort.get()
        return hostPort != null && StreamIsleNetworkState.isBypassed(hostPort)
      }

      override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {
        delegate.checkClientTrusted(chain, authType)
      }

      override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String, socket: Socket?) {
        delegate.checkClientTrusted(chain, authType, socket)
      }

      override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String, engine: SSLEngine?) {
        delegate.checkClientTrusted(chain, authType, engine)
      }

      override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {
        if (!bypassed()) {
          delegate.checkServerTrusted(chain, authType)
        }
      }

      override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String, socket: Socket?) {
        if (!bypassed()) {
          delegate.checkServerTrusted(chain, authType, socket)
        }
      }

      override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String, engine: SSLEngine?) {
        if (!bypassed()) {
          delegate.checkServerTrusted(chain, authType, engine)
        }
      }

      override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = delegate.acceptedIssuers
    }
  }

  /** 系统默认信任管理器（严格校验基线） */
  private fun defaultTrustManager(): X509ExtendedTrustManager {
    val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    factory.init(null as KeyStore?)
    return factory.trustManagers.filterIsInstance<X509ExtendedTrustManager>().first()
  }
}
