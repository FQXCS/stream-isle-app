package com.streamisle.mobile

import java.util.concurrent.ConcurrentHashMap

/**
 * 白名单共享状态（模块实例与 OkHttp 注入点之间共享；进程级单例）。
 * 键 = host:port（JS 侧 normalizeUrl.toHostPort 解析：显式端口保留、缺省按协议补齐、子路径只取 host）。
 */
object StreamIsleNetworkState {
  /** host:port 白名单（全量覆写语义；JS 线程写、OkHttp 线程读） */
  private val bypassHosts: MutableSet<String> = ConcurrentHashMap.newKeySet()

  /** 全量覆写 */
  fun setAll(hostList: List<String>) {
    bypassHosts.clear()
    bypassHosts.addAll(hostList)
  }

  /** 判定（白名单为空时恒 false = 全局严格校验默认态） */
  fun isBypassed(hostPort: String): Boolean = hostPort.isNotEmpty() && bypassHosts.contains(hostPort)
}
