/**
 * 服务器配置服务（免登录体系）：
 * 添加服务器（探测 → 登录 → 保存）、编辑服务器资料（换地址需探测确认同一台）、
 * 刷新详情数据（按服务器自身账号统计电影/剧集数量并缓存）。
 * 服务层不直接发请求，一律经 adapter（设计文档 §4）。
 */
import { createAdapter } from '@/adapter';
import type { ServerFlavor, ServerInfo } from '@/adapter/model';
import { MIN_EMBY_VERSION, MIN_JELLYFIN_VERSION } from '@/constant/server';
import {
  deletePassword as deleteStoredPassword,
  savePassword as saveStoredPassword,
} from '@/infra/credentialVault';
import { AppError } from '@/infra/error';
import { deleteToken, getTokenFromMemory, saveToken, warmupToken } from '@/infra/tokenVault';
import { connect, login, saveAccount } from '@/service/AuthService';
import { useAccountStore, upstreamServerIdOf } from '@/store/accountStore';
import { composeServerUrl, type ServerAddressParts } from '@/util/serverUrl';
import { compareVersion } from '@/util/semver';

/** 添加服务器表单输入 */
export interface AddServerInput extends ServerAddressParts {
  /** 入口选择的服务器类型（以此为准，探测结果只用于地址/版本校验） */
  flavor: ServerFlavor;
  /** 服务器显示名称（留空用探测到的服务器名） */
  name: string;
  username: string;
  password: string;
}

/** 编辑服务器表单输入（不改 Token 时地址仅做探测校验；密码非空则重登并替换账号） */
export interface UpdateServerInput {
  serverId: string;
  name: string;
  address: ServerAddressParts;
  /** 账号用户名（密码非空时生效） */
  username: string;
  /** 新密码；留空表示不修改账号（单账号模型：一个服务器一组账号密码） */
  password: string;
}

/**
 * 添加服务器：地址探测（校验可用性 + 版本）→ 账号密码登录 → 保存账号并激活；
 * 服务器类型以入口选择为准（探测出的类型不再覆盖），名称/同步开关保存后写回记录。
 */
export async function addServer(input: AddServerInput): Promise<ServerInfo> {
  const rawUrl = composeServerUrl(input);
  if (rawUrl === null) {
    throw new AppError('INVALID_ADDRESS');
  }
  const probed = await connect(rawUrl);
  // 入口选择为准：覆盖探测到的 flavor，版本过低判定按所选类型的最低版本重算
  const minVersion = input.flavor === 'JELLYFIN' ? MIN_JELLYFIN_VERSION : MIN_EMBY_VERSION;
  const info: ServerInfo = {
    ...probed,
    flavor: input.flavor,
    versionTooLow:
      probed.version !== '' && compareVersion(probed.version, minVersion) < 0,
  };
  const auth = await login(info, input.username, input.password);
  // saveAccount 会为「同一台服务器重复添加」分配新的本地记录 id（不自动合并）
  const localId = await saveAccount(info, auth);
  // 密码加密留存（SecureStore），供后续自动重登使用；不写明文到业务库
  await saveStoredPassword(localId, auth.userId, input.password);
  useAccountStore.getState().actions.updateServerProfile(localId, {
    serverName: input.name.trim() !== '' ? input.name.trim() : info.serverName,
  });
  return info;
}

/**
 * 编辑服务器：探测新地址，serverId 必须与原记录一致（防止把 A 服务器改成 B 的地址后 Token 错配），
 * 通过后更新名称/地址/同步开关；填写了密码则用新账号重新登录并替换该服务器唯一的账号
 * （单账号模型：一个服务器对应一组账号密码，不做一对多）。
 */
export async function updateServer(input: UpdateServerInput): Promise<void> {
  const server = useAccountStore.getState().servers.find((item) => item.serverId === input.serverId);
  if (server === undefined) {
    throw new Error('时序错误：编辑的服务器记录不存在');
  }
  const rawUrl = composeServerUrl(input.address);
  if (rawUrl === null) {
    throw new AppError('INVALID_ADDRESS');
  }
  const info = await connect(rawUrl);
  if (info.serverId !== upstreamServerIdOf(server)) {
    // 探测成功但不是同一台服务器（上游 serverId 不同）→ 拒绝覆盖
    throw new AppError('NOT_MEDIA_SERVER');
  }
  // 先完成登录校验，成功后再落库，避免改一半
  const newAuth =
    input.password !== ''
      ? await login(
          {
            flavor: server.flavor,
            baseUrl: info.baseUrl,
            serverId: upstreamServerIdOf(server),
            serverName: server.serverName,
            version: info.version,
            versionTooLow: false,
          },
          input.username.trim(),
          input.password
        )
      : null;
  const actions = useAccountStore.getState().actions;
  actions.updateServerProfile(input.serverId, {
    serverName: input.name.trim() !== '' ? input.name.trim() : server.serverName,
    baseUrl: info.baseUrl,
  });
  if (newAuth !== null) {
    // 单账号模型：清掉旧账号 token 与密码，写入新账号并替换
    await Promise.all(
      server.users
        .filter((user) => user.userId !== newAuth.userId)
        .map(async (user) => {
          await deleteToken(input.serverId, user.userId);
          await deleteStoredPassword(input.serverId, user.userId);
        })
    );
    await saveToken(input.serverId, newAuth.userId, newAuth.token);
    await saveStoredPassword(input.serverId, newAuth.userId, input.password);
    actions.replaceServerUser(input.serverId, newAuth);
    await actions.switchActiveUser(input.serverId, newAuth.userId);
  }
}

/** 数量统计汇总：按 collectionType 匹配库并累加条目数（单库失败按 0 计） */
async function sumLibraryCount(
  adapter: ReturnType<typeof createAdapter>,
  userId: string,
  collectionType: string
): Promise<number> {
  const viewList = await adapter.getUserViews(userId);
  const targetList = viewList.filter((library) => library.collectionType === collectionType);
  const countList = await Promise.all(
    targetList.map((library) =>
      adapter.getLibraryItemCount(userId, library.id, library.collectionType).catch(() => 0)
    )
  );
  return countList.reduce((total, count) => total + count, 0);
}

/**
 * 刷新详情数据：用该服务器自己的账号（活跃用户优先）构造 adapter，统计电影/剧集，
 * 结果写入 accountStore 缓存供卡片展示（进入页面不重复请求）。
 */
export async function refreshServerStats(serverId: string): Promise<void> {
  const server = useAccountStore.getState().servers.find((item) => item.serverId === serverId);
  const userId = server?.activeUserId ?? server?.users[0]?.userId;
  if (server === undefined || userId === undefined) {
    return;
  }
  await warmupToken(serverId, userId);
  const token = getTokenFromMemory(serverId, userId);
  const adapter = createAdapter({ baseUrl: server.baseUrl, flavor: server.flavor, token });
  const [movieCount, seriesCount] = await Promise.all([
    sumLibraryCount(adapter, userId, 'movies'),
    sumLibraryCount(adapter, userId, 'tvshows'),
  ]);
  useAccountStore.getState().actions.setServerStats(serverId, {
    movieCount,
    seriesCount,
    refreshedAt: Date.now(),
  });
}
