/**
 * 服务器/Onboarding/设置二级页领域文案（zh 真源）。
 * 维护范围：page/tabs（Libraries/Search/MediaServer）、page/settings、page/server、page/onboarding。
 */
import type { Message } from '@/i18n/types';

export const zhServer = {
  // —— 通用（服务器域内复用） ——
  'server.done': '完成',
  'server.edit': '编辑',
  'server.add': '添加',
  'server.addServer': '添加服务器',
  'server.moreActions': '更多操作',
  'server.unnamedServer': '未命名服务器',
  'server.defaultRoute': '默认线路',

  // —— 影视服务器页：卡片统计与操作菜单 ——
  'server.cardStats': '电影: {movies} 剧集: {series}',
  'server.menuRoutes': '线路管理',
  'server.menuRefreshStats': '刷新详情数据',
  'server.menuSetPrivate': '设为隐私服务器',
  'server.menuUnsetPrivate': '取消隐私服务器',
  'server.menuIgnoreTls': '忽略证书校验',
  'server.menuUnignoreTls': '取消忽略证书校验',
  'server.statsRefreshed': '详情数据已刷新',
  'server.statsRefreshFailed': '刷新失败，请检查服务器连接',
  'server.refreshAllDone': '全部服务器详情已刷新',
  'server.refreshAllPartial': ({ failed }) => `刷新完成，${failed} 台失败`,

  // —— 影视服务器页：删除 / 编辑模式 ——
  'server.deleteTitle': '删除服务器',
  'server.deleteConfirm': '确定删除「{name}」及其全部账号吗？',
  'server.deleteSelectedConfirm': '确定删除选中的 {count} 台服务器及其账号吗？',
  'server.deleteSelected': '删除所选服务器',
  'server.selectAll': '全选',
  'server.deselectAll': '取消全选',
  'server.selectedCount': '已选择 {count} 项',
  'server.sortTitle': '排序',
  'server.menuRefreshAll': '刷新全部',
  'server.emptyTitle': '还没有添加服务器',
  'server.emptyHint': '点右上角「+」添加 Emby / Jellyfin 服务器',

  // —— 媒体库首页 ——
  'server.viewAll': '查看全部',
  'server.viewAllOf': '查看全部 {title}',
  'server.sectionResume': '继续观看',
  'server.sectionNextUp': '下一集',
  'server.sectionLatest': '最近添加',
  'server.sectionMyMedia': '我的媒体',
  'server.refreshHome': '刷新首页',
  'server.mediaManage': '媒体管理',
  'server.mediaManageHint': '服务器不支持时，设置仅在本机生效',
  'server.mediaManageLocalOnly': '服务器不支持或同步失败，已在本机生效',
  'server.noAccountForServer': '该服务器还没有账号，请先在影视服务器页登录',
  'server.guestTitle': '媒体库是空的',
  'server.guestHint': '添加 Emby / Jellyfin 服务器后，继续观看与最近添加会出现在这里',
  'server.libraryEmptyTitle': '媒体库暂无内容',
  'server.libraryEmptySubtitle': '添加服务器后，继续观看与最近添加会出现在这里',
  'server.switchServer': '切换媒体库服务器',
  'server.openLibrary': '打开库 {name}',
  'server.continueWatchingOf': '继续观看 {name}',
  'server.itemCount': ({ count }) => `${count} 项`,

  // —— 搜索页 ——
  'server.searchPlaceholder': '搜索电影、剧集、人物',
  'server.searchEmptyTitle': '输入关键词搜索电影、剧集、人物',
  'server.searchNoResult': '没有找到与「{keyword}」相关的内容',
  'server.clearSearch': '清除搜索',

  // —— 添加 / 编辑服务器表单 ——
  'server.editServerTitle': '编辑服务器',
  'server.addFlavorTitle': '添加 {flavor}',
  'server.formName': '名称',
  'server.formProtocol': '协议',
  'server.formAddress': '服务器地址',
  'server.formPath': '路径',
  'server.formPort': '端口号',
  'server.formAccount': '账号（用户名）',
  'server.formUsername': '用户名',
  'server.formPassword': '密码',
  'server.placeholderName': '选填（自动获取）',
  'server.placeholderHost': '必填（127.0.0.1/sample）',
  'server.placeholderPath': '选填（/path）',
  'server.placeholderRequired': '必填',
  'server.placeholderPasswordKeep': '留空则不修改账号',
  'server.placeholderPasswordStored': '已加密保存，可修改',
  'server.placeholderPasswordOptional': '选填',
  'server.showPassword': '显示密码',
  'server.hidePassword': '隐藏密码',
  'server.saving': '处理中…',
  'server.verifyingAddress': '正在校验地址…',
  'server.connectingServer': '正在连接服务器…',
  'server.editNeedsPassword': '修改账号需要填写密码',
  'server.usernameRequired': '请填写用户名',
  'server.operationFailed': '操作失败，请重试',
  'server.ignoreTlsRetry': '忽略该服务器证书校验并重试',
  'server.addHint':
    '类型以入口选择为准；添加后自动登录并切换到该服务器，不登录也可进入 App，媒体库保持为空。',
  'server.editHint':
    '密码已加密保存并自动回显；修改账号/密码才需要重新登录，只改名称或地址不会动账号。',

  // —— 线路管理 ——
  'server.routesTitle': '线路管理',
  'server.addBackupRoute': '添加备用线路',
  'server.editRouteTitle': '编辑线路',
  'server.serverMissing': '服务器不存在',
  'server.routeDeleteTitle': '删除线路',
  'server.routeDeleteConfirm': '删除后该地址将不再参与故障转移，确定删除吗？',
  'server.routeSwitched': '已切换到「{name}」',
  'server.routesHint': '当前线路请求失败时会自动切换到下一条线路；也可以点击线路手动切换。',
  'server.routeEditHint':
    '备用线路与服务器共用账号，无需重新登录；切换后立即生效，请求失败会自动切到下一条线路。',

  // —— 设置二级页：库页配置 / Tab 分类 / 排序项 ——
  'server.libraryTypes': '库类型',
  'server.tabCategoriesDesc': '库页顶部展示哪些分类（每种最多 5 个，可拖动排序）',
  'server.sortOptionsDesc': '按库类型和 Tab 配置排序字段（可拖动排序）',
  'server.defaultDisplay': '默认显示',
  'server.defaultTabLabel': '进入媒体库时打开',
  'server.enabledTabsHint': '已启用（{count}/{max}）· 长按',
  'server.enabledSortsHint': '已启用（{count} 项）· 长按',
  'server.dragToReorder': '拖动排序',
  'server.keepOne': '至少保留 1 个',
  'server.maxTabs': '最多 {max} 个',
  'server.disabledSection': '未启用',
  'server.resetDefault': '恢复默认',
  'server.sortNotSupported': '不支持排序',
  'server.sortableTabsCount': ({ count }) => `${count} 个可排序 Tab`,
  'server.sortableTabsCustomized': ({ count }) => `${count} 个可排序 Tab · 已自定义`,
  'server.followPrimaryTab': '跟随「{tab}」',
  'server.sortSelectedCount': '已选 {count} 项',
  'server.categoryMissing': '分类不存在',
  'server.categoryNotSortable': '该分类不支持排序',

  // —— 后台播放引导浮层 ——
  'server.batteryTitle': '后台播放设置建议',
  'server.batteryMessage':
    '为避免后台播放被系统省电中断，建议允许忽略电池优化；小米/华为等机型还需在设置中允许自启动/后台运行。',
  'server.batteryLater': '暂不',
  'server.batteryGoSettings': '去设置',

  // —— Onboarding：连接服务器 ——
  'server.connectTitle': '连接服务器',
  'server.connectHint': '输入 Jellyfin / Emby 服务器地址，如 http://192.168.1.5:8096',
  'server.probing': '探测中…',
  'server.connect': '连接',
  'server.next': '下一步',
  'server.version': '版本 {version}',
  'server.versionTooLow':
    '版本过低（低于 Jellyfin 10.8 / Emby 4.7），部分功能可能不可用，可继续尝试',

  // —— Onboarding：登录 ——
  'server.loginTitle': '登录',
  'server.loginServerLabel': '{name}（{flavor}）',
  'server.savedAccounts': '已保存账号',
  'server.tapToEnter': '点击直接进入',
  'server.useOtherAccount': '使用其他账号登录',
  'server.signingIn': '登录中…',
  'server.quickConnect': 'Quick Connect 免密登录',
  'server.quickConnectGuide': '打开已登录设备：网页端 设置 → Quick Connect，输入此码确认',
  'server.waitingApproval': '等待授权确认…',
} as const satisfies Record<string, Message>;

export type ServerMessageKey = keyof typeof zhServer;
