# Lofter-Plugin

适用于 Yunzai-Bot v3 / TRSS-Yunzai / Miao-Yunzai 的 Lofter 博文解析插件，运行于 Node.js >= 18.0.0，ES Module，唯一外部依赖 `node-fetch`。

## 主要功能

- **自动链接解析**：检测到 `*.lofter.com/post/*` 链接时自动抓取页面并解析结构化数据。
- **图文/纯文支持**：从页面 `window.__initialize_data__` 提取数据，支持图文博文和纯文本博文。
- **图片处理**：优先使用 `orign` 原图地址，回退到 `raw`；带失败重试，默认 3 并发；支持大小限制、缩略图回退、原图链接单独发送。
- **发送模式**：合并转发（`forward`）与逐条发送（`normal`）两种模式；纯文博文支持单消息、多消息、Puppeteer 长图渲染三种方式。
- **博主主页浏览**：`#lofter 博主名` 查看博主信息和最新博文列表，`#lofter下一页` 翻页。
- **标签页浏览**：`#lofter标签 标签名` 浏览标签页，支持翻页、热门排序、日榜/周榜/月榜/总榜切换。
- **列表快速解析**：浏览博主或标签列表后，`#lofter解析 序号` 直接解析指定帖子，无需复制链接。
- **每日一图订阅**：群聊中订阅标签，每天定时推送随机博文，支持每群多标签、多标签间隔推送。
- **错误分类提示**：网络异常、页面结构变更、Puppeteer 渲染失败等场景给出针对性提示。
- **配置热重载**：修改 `lofter.yaml` 后无需重启，后续解析自动使用新配置。
- **锅巴面板**：支持 Guoba 可视化配置，schema 从 `fields.js` 自动生成。
- **更新命令**：主人可通过 `#更新Lofter` 等命令在线拉取最新代码。

## 运行环境

- Node.js `>= 18.0.0`
- Yunzai-Bot v3、Miao-Yunzai 或 TRSS-Yunzai 等兼容环境
- 纯文长图模式依赖宿主 Yunzai 的 Puppeteer / Chromium 支持
- 可选：Guoba 插件，用于 Web 面板配置

## 安装

进入 Yunzai 的 `plugins` 目录克隆插件：

```bash
cd plugins
git clone https://github.com/WindDrift/Lofter-Plugin.git
```

安装依赖：

```bash
cd Lofter-Plugin
npm install
```

重启 Yunzai，或在机器人中执行 `#重启`。

## 使用方法

### 自动解析

直接发送包含 Lofter 博文链接的消息即可触发解析：

```text
https://example.lofter.com/post/123456_abcdef
```

也支持在普通消息中夹带链接：

```text
看这篇：https://example.lofter.com/post/123456_abcdef
```

插件匹配的链接格式为：

```text
https://<博客名>.lofter.com/post/<博文ID>
http://<博客名>.lofter.com/post/<博文ID>
```

### 命令示例

```text
#lofter 某博主名              # 浏览博主主页
#lofter下一页                 # 博主主页翻页
#lofter标签 某标签             # 浏览标签页
#lofter标签下一页              # 标签页翻页
#lofter标签热门                # 标签页切换热门排序
#lofter标签日榜 某标签          # 查看标签日榜
#lofter标签周榜 某标签          # 查看标签周榜
#lofter标签月榜 某标签          # 查看标签月榜
#lofter标签总榜 某标签          # 查看标签总榜
#lofter解析 3                  # 解析缓存列表中第 3 条帖子
#lofter每日一图订阅 某标签       # 订阅每日一图（默认最新排序）
#lofter每日一图订阅 某标签 hot   # 订阅每日一图（热门排序）
#lofter每日一图取消订阅 某标签    # 取消指定标签订阅
#lofter每日一图取消订阅          # 取消全部订阅
#lofter每日一图状态             # 查看当前群订阅状态
#更新Lofter                    # 更新插件（需主人权限）
```

## 配置方式

推荐使用 Guoba 插件进行可视化配置。没有 Guoba 时，可手动编辑：

```text
plugins/Lofter-Plugin/config/config/lofter.yaml
```

首次读取配置时，插件会根据默认配置自动创建用户配置文件。配置读取优先级为：

```text
用户配置（config/config/lofter.yaml） > 默认配置（config/default_config/lofter.yaml） > fields.js 内置默认值
```

配置管理带有内存缓存和文件热重载（`fs.watch` + 300ms debounce），修改 `lofter.yaml` 后通常不需要重启即可在后续解析中生效。

## 配置项

### 通用设置

| 配置项                           | 默认值    | 说明                                                            |
| -------------------------------- | --------- | --------------------------------------------------------------- |
| `autoParse`                      | `true`    | 是否自动解析检测到的 Lofter 链接。                              |
| `smartIndent`                    | `true`    | 正文段落无缩进时，自动添加两个全角空格。                        |
| `enablePureTextImageFooterStats` | `true`    | 纯文图片模式下，在页脚显示字数和段落统计。                      |
| `sendMode`                       | `forward` | 发送模式：`forward` 合并转发，`normal` 逐条发送。               |
| `pureTextSendMode`               | `single`  | 无图博文正文模式：`single`、`multi`、`image`。                  |
| `timeout`                        | `30`      | 页面请求超时时间，单位秒。                                      |
| `lofterLoginEnabled`             | `false`   | 是否启用 Lofter 登录访问（用于获取登录后可见的内容）。          |
| `lofterLoginKey`                 | `''`      | 登录 Key 名称（如 Authorization、LOFTER-PHONE-LOGIN-AUTH 等）。 |
| `lofterLoginAuth`                | `''`      | 登录 Key 对应的 Cookie 值。                                     |

### 发送内容管理

| 配置项                 | 默认值  | 说明                                               |
| ---------------------- | ------- | -------------------------------------------------- |
| `sendBloggerInfo`      | `true`  | 发送博主昵称、博客名和博主 ID。                    |
| `sendPostInfo`         | `true`  | 发送博文链接、发布时间和博文 ID。                  |
| `sendTagLinks`         | `true`  | 单独发送标签链接；关闭时标签显示在博文基础信息中。 |
| `sendInteraction`      | `true`  | 发送回复、点赞、推荐、收藏、热度。                 |
| `sendPostTitle`        | `true`  | 发送博文标题。                                     |
| `sendPostBody`         | `true`  | 发送正文文本或纯文长图。                           |
| `sendImages`           | `true`  | 发送图片本体。                                     |
| `sendImageLinks`       | `true`  | 发送每张图片对应的原图链接。                       |
| `sendImageLimitTip`    | `true`  | 图片触发大小限制时发送配置提示。                   |
| `sendParseStats`       | `true`  | 发送解析统计。                                     |
| `sendOriginal`         | `false` | 逐条发送图片时，尝试以文件形式发送原图。           |
| `sendFirstImage`       | `false` | 合并转发后额外发送首图预览。                       |
| `enableImageSizeLimit` | `true`  | 开启图片大小限制，防止超大图拖垮进程。             |
| `imageSizeLimit`       | `8`     | 图片大小限制阈值，单位 MB。                        |
| `sendThumbnail`        | `true`  | 超限图片尝试发送缩略图。                           |
| `imageCountPrompt`     | `true`  | 首图预览后提示剩余图片数量或超限信息。             |

### 纯文图片模式设置

| 配置项             | 默认值    | 说明                                                             |
| ------------------ | --------- | ---------------------------------------------------------------- |
| `imageFont`        | `''`      | 正文字体。可填系统字体名，也可将字体文件放入 `resources/fonts`。 |
| `imageBgColor`     | `#FFFFFF` | 背景颜色（HEX 色值）。                                           |
| `imageFontColor`   | `#333333` | 正文字体颜色（HEX 色值）。                                       |
| `imageFontSize`    | `26`      | 正文字号，单位 px。                                              |
| `imageLineHeight`  | `1.5`     | 正文行高（倍数）。                                               |
| `imageTitleColor`  | `#000000` | 标题颜色（HEX 色值）。                                           |
| `imageTitleSize`   | `32`      | 标题字号，单位 px。                                              |
| `imagePadding`     | `40`      | 图片整体内边距，单位 px。                                        |
| `imageWidth`       | `800`     | 图片布局宽度，单位 px。                                          |
| `imageDeviceScale` | `2`       | 渲染倍率，`2` 表示 2x 清晰度。                                   |
| `imageTextLimit`   | `1000`    | 单张图最大字数，超出后分页；`0` 表示不限制。                     |

### 合并转发设置

| 配置项            | 默认值           | 说明                                  |
| ----------------- | ---------------- | ------------------------------------- |
| `forwardTitle`    | `Lofter解析结果` | 合并转发外显标题。                    |
| `forwardNickname` | `''`             | 合并转发内部昵称，留空使用 Bot 名称。 |

### 列表浏览设置

| 配置项             | 默认值 | 说明                                         |
| ------------------ | ------ | -------------------------------------------- |
| `blogListPageSize` | `10`   | 博主主页列表每次显示的帖子数量。             |
| `tagListPageSize`  | `20`   | 标签页列表每次显示的帖子数量。               |
| `listCacheTTL`     | `600`  | 列表缓存有效期，单位秒，用于 `#lofter解析`。 |
| `sendBlogInfo`     | `true` | 是否发送博主主页的博主信息。                 |
| `sendTagInfo`      | `true` | 是否发送标签页的标签信息。                   |
| `tagDefaultSort`   | `new`  | 标签页默认排序：`new` 最新，`hot` 热门。     |

### 每日一图设置

| 配置项                       | 默认值  | 说明                           |
| ---------------------------- | ------- | ------------------------------ |
| `dailyImageEnabled`          | `false` | 是否开启每日一图功能。         |
| `dailyImagePushTime`         | `08:00` | 每日推送时间，格式 `HH:mm`。   |
| `dailyImageMaxSubscriptions` | `50`    | 全局最大订阅数量限制。         |
| `dailyImagePushInterval`     | `3`     | 同群多标签推送间隔，单位分钟。 |

## 图片处理策略

插件会将图片临时下载到：

```text
<Yunzai根目录>/temp/lofter
```

图片文件名由博客名、发布日期和图片序号组成，发送结束后会清理临时文件。

当 `enableImageSizeLimit` 开启时，插件会检查下载后的图片大小：

- **未超过 `imageSizeLimit`**：正常发送图片。
- **超过限制且 `sendThumbnail` 为 `true`**：发送缩略图，并附带原图链接。
- **超过限制且 `sendThumbnail` 为 `false`**：不发送图片本体，只发送原图链接和超限提示。

关闭 `sendImages` 但保留 `sendImageLinks` 时，插件只发送原图链接，不下载和发送图片本体。

若博主开启了作品保护（`imageProtected`），插件不会下载原图，改发缩略图。

## 项目结构

```text
Lofter-Plugin/
├── index.js                          # 插件入口，扫描 apps/ 动态注册插件类
├── package.json
├── guoba.support.js                  # Guoba 面板入口
│
├── apps/                             # 命令处理层（每个文件导出 extends plugin 的类）
│   ├── lofter.js                     # 博文链接解析 + 快速解析（2 个 rule）
│   ├── blogBrowser.js                # 博主主页浏览 + 翻页（2 个 rule）
│   ├── tagBrowser.js                 # 标签页浏览 + 翻页 + 热门 + 榜单（7 个 rule）
│   ├── dailyImage.js                 # 每日一图订阅管理（3 个 rule）
│   └── update.js                     # 插件更新（1 个 rule，需主人权限）
│
├── components/
│   └── Config.js                     # 配置管理（单例 + 内存缓存 + fs.watch 热重载）
│
├── config/
│   ├── fields.js                     # 配置字段注册表（单一事实源，30 个字段）
│   └── default_config/
│       └── lofter.yaml               # 默认配置文件（带中文注释）
│
├── guoba/                            # Guoba 面板集成
│   ├── index.js                      # supportGuoba 入口
│   ├── pluginInfo.js                 # 插件元信息
│   ├── configInfo.js                 # 配置读写接口
│   └── schemas/
│       ├── index.js                  # Schema 生成 + getConfigData + setConfigData
│       └── lofter.js                 # 从 LOFTER_FIELDS 自动生成表单 schema
│
├── lib/                              # 业务逻辑层（按职责分子目录）
│   ├── core/                         # 基础设施
│   │   ├── types.js                  # JSDoc typedef 集中定义
│   │   ├── errors.js                 # categorizeError + 自定义错误类
│   │   ├── configLoader.js           # 统一配置加载 + normalizeConfig
│   │   └── utils.js                  # 通用工具（日期格式化、并发控制等）
│   │
│   ├── fetch/                        # 网络请求与缓存
│   │   ├── cache.js                  # 通用 TtlCache 类（Map + expireAt）
│   │   ├── fetcher.js                # HTTP 请求 + HTML 缓存（re-export 图片下载/清理）
│   │   ├── imageDownloader.js        # 图片下载到本地临时目录
│   │   ├── tempFileManager.js        # 临时文件清理
│   │   └── listCache.js              # 列表缓存（按群/私聊维度）
│   │
│   ├── parse/                        # 数据解析（纯函数，无副作用）
│   │   ├── parserBase.js             # 解析器共享工具（类型映射、摘要提取等）
│   │   ├── parser.js                 # 博文数据解析（HTML → PostExtracted）
│   │   ├── blogParser.js             # 博主主页解析（→ BlogPageExtracted）
│   │   └── tagParser.js              # 标签页解析（→ TagPageExtracted）
│   │
│   ├── render/                       # 渲染处理
│   │   ├── textProcessor.js          # HTML 清洗 + 智能缩进 + 段落分割
│   │   ├── imageHandler.js           # 图片下载/大小限制/缩略图处理
│   │   └── imageRenderer.js          # Puppeteer 长图渲染
│   │
│   ├── message/                      # 消息构建与发送
│   │   ├── messageBuilder.js         # 消息文本格式化（无发送逻辑）
│   │   ├── sender.js                 # 合并转发/图片发送/撤回/列表发送
│   │   └── pipeline.js               # 博文解析流水线（Step 2-10 编排）
│   │
│   └── dailyImage/                   # 每日一图功能
│       ├── subscription.js           # 订阅数据管理（增删查改 + JSON 持久化）
│       └── scheduler.js              # 基于 setTimeout 的定时推送调度器
│
└── resources/
    ├── fonts/                        # 默认字体文件
    └── html/lofter/
        └── text-post.html            # Puppeteer 渲染 HTML 模板
```

## 可用指令

| #   | 触发方式                                                              | 处理类       | 方法                | 说明                       |
| --- | --------------------------------------------------------------------- | ------------ | ------------------- | -------------------------- |
| 1   | `https://<博客名>.lofter.com/post/<博文ID>`                           | LofterPlugin | parseLofter         | 自动解析博文链接           |
| 2   | `#lofter解析 <序号>`                                                  | LofterPlugin | parseCachedListItem | 解析缓存列表中指定序号     |
| 3   | `#lofter <博主名>`                                                    | BlogBrowser  | browseBlog          | 浏览博主主页               |
| 4   | `#lofter下一页`                                                       | BlogBrowser  | browseBlogNextPage  | 博主主页翻页               |
| 5   | `#lofter标签 <标签名>`                                                | TagBrowser   | browseTag           | 浏览标签页                 |
| 6   | `#lofter标签下一页`                                                   | TagBrowser   | browseTagNextPage   | 标签页翻页                 |
| 7   | `#lofter标签热门`                                                     | TagBrowser   | browseTagHot        | 标签页切换热门排序         |
| 8   | `#lofter标签月榜 <标签名>`                                            | TagBrowser   | browseTagMonth      | 查看标签月榜               |
| 9   | `#lofter标签周榜 <标签名>`                                            | TagBrowser   | browseTagWeek       | 查看标签周榜               |
| 10  | `#lofter标签日榜 <标签名>`                                            | TagBrowser   | browseTagDate       | 查看标签日榜               |
| 11  | `#lofter标签总榜 <标签名>`                                            | TagBrowser   | browseTagTotal      | 查看标签总榜               |
| 12  | `#lofter每日一图订阅 <标签名> [排序]`                                 | DailyImage   | subscribe           | 订阅每日一图               |
| 13  | `#lofter每日一图取消订阅 [标签名]`                                    | DailyImage   | unsubscribe         | 取消订阅（不传则取消全部） |
| 14  | `#lofter每日一图状态`                                                 | DailyImage   | status              | 查看当前订阅状态           |
| 15  | `#更新Lofter` / `#Lofter更新` / `#更新Lofter插件` / `#Lofter插件更新` | LofterUpdate | updatePlugin        | 插件更新（需主人权限）     |

## 常见问题

### 没有触发解析

确认消息中包含的链接形如 `https://xxx.lofter.com/post/xxx`，并检查 `autoParse` 是否为 `true`。

### 提示网络请求失败

插件抓取页面时会自动重试 2 次。仍失败通常是网络波动、DNS、Lofter 访问限制或目标页面不可访问导致。

### 提示页面结构变更

插件依赖 Lofter 页面中的 `window.__initialize_data__`。如果 Lofter 改版导致字段变化，可能需要更新解析逻辑。

### 纯文图片模式失败

检查宿主 Yunzai 的 Puppeteer / Chromium 是否可用。渲染失败时插件会尝试回退为文本发送。

### 大图没有按原图发送

检查 `enableImageSizeLimit`、`imageSizeLimit`、`sendThumbnail` 和 `sendImageLinks`。默认情况下，超过 8 MB 的图片会触发限制。

### 配置文件路径写错

插件目录名是 `Lofter-Plugin`，用户配置文件路径是：

```text
plugins/Lofter-Plugin/config/config/lofter.yaml
```

### 每日一图不推送

检查 `dailyImageEnabled` 是否为 `true`，`dailyImagePushTime` 格式是否为 `HH:mm`，以及当前群是否已订阅（`#lofter每日一图状态`）。调度器在 Bot 启动时自动启动，进程重启后会重新计时。

## 注意事项

- Lofter 页面结构和 CDN 策略可能变化，解析和图片下载依赖当时可访问的数据。
- 图片和头像请求会携带移动端 User-Agent，图片下载还会使用博文链接作为 Referer。
- 解析计数只保存在当前进程内，Bot 重启后会重置。
- `sendOriginal` 仅在逐条发送图片时用于尝试发送文件；合并转发中仍按图片消息组织。
- 插件更新命令需要主人权限。
- 每日一图订阅数据持久化在 `plugins/Lofter-Plugin/data/daily_image_subscriptions.json`。

## 免责声明

- 本插件仅供学习交流使用，请勿用于任何商业或非法用途。
- 插件解析的内容（包括但不限于博文文本、图片、博主信息）版权归原博主及 Lofter 平台所有，使用者应遵守 Lofter 用户协议及相关法律法规。
- 插件通过抓取 Lofter 页面公开数据实现功能，不涉及账号登录、数据篡改或越权访问。若 Lofter 平台调整页面结构或接口策略导致插件失效，作者不承担任何责任。
- 使用本插件下载的图片仅供个人查看，请勿未经授权转载、二次分发或用于其他侵权行为。
- 因使用本插件产生的任何直接或间接损失，作者不承担任何责任。

## 许可证

本项目基于 [GPL-3.0 License](LICENSE) 开源。
