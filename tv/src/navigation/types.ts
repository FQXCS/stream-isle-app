/**
 * TV 导航参数类型（TV-m1 §4.1，TV-m1-S2）：TV 精简副本。
 * mobile 的 types.ts 住在 @/page/navigation/（TV 禁入），移动它破坏手机零改动；
 * 副本只声明 TV 路由子集，参数形状对齐 mobile，模型类型一律 @/adapter/model 共享。
 * m2 追加（TV-m2 §2.1）：Item / Library / LibraryFolder / ItemList / Person 五条
 * stack push 路由（Search 为壳内 tab 切换不进栈，TV-m2-S1 壳内内容区直渲）；
 * Player 于 tv-m3 追加。
 */
import type {
  ItemFilterEnum,
  LibraryTypeEnum,
  MediaLibrary,
  MediaItemTypeEnum,
  ServerInfo,
  SortByEnum,
} from '@/adapter/model';
import { ROUTES } from '@/constant/navigation';

import { TV_ROUTES } from '@tv/constant/navigation';

/** 通用条目列表路由参数（合集子项等；形状对齐手机 ItemListParams） */
export interface TvItemListParams {
  title: string;
  parentId?: string;
  kinds?: MediaItemTypeEnum[];
  filters?: ItemFilterEnum[];
}

export type TvStackParamList = {
  [TV_ROUTES.SHELL]: undefined;
  /** Connect 正常流程带 serverInfo；401 重登路径带 serverId（形状与手机对齐） */
  [ROUTES.ONBOARDING_CONNECT]: undefined;
  [ROUTES.ONBOARDING_LOGIN]: { serverInfo?: ServerInfo; serverId?: string } | undefined;
  /** 库浏览：Tab 分类 + 海报墙分页 + 文件夹下钻（TV-m2 §4.1） */
  [ROUTES.LIBRARY]: { library: MediaLibrary };
  /** 详情：电影/剧集（TV-m2 §4.3；播放按钮为 resolve 冒烟切片 TV-m2-S2） */
  [ROUTES.ITEM]: { itemId: string };
  /** 库内文件夹下钻（逐级 push，BACK 逐级回退；TV-m2 §4.2） */
  [ROUTES.LIBRARY_FOLDER]: {
    libraryId: string;
    libraryType: LibraryTypeEnum;
    folderId: string;
    folderName: string;
    tabId: string;
    sortBy: SortByEnum;
    sortOrder: 'ASC' | 'DESC';
    kind: 'folder' | 'album';
  };
  /** 通用条目列表（合集子项；SORT_NAME ASC 分页，页面局部 state，TV-m2 §4.2） */
  [ROUTES.ITEM_LIST]: TvItemListParams;
  /** 人物页：头像/简介/出演作品网格（TV-m2 §4.3 演员行落地） */
  [ROUTES.PERSON]: { personId: string };
};
