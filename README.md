# Lofter-Plugin

适用于 Yunzai-Bot v3 / TRSS-Yunzai 的 Lofter 博文解析插件。

群聊或私聊中出现 Lofter 博文链接时，插件会自动抓取页面数据，解析博主信息、博文信息、正文、标签、互动数据和图片，并按配置发送到当前会话。

## 主要功能

- 自动识别 `*.lofter.com/post/*` 博文链接，无需命令前缀。
- 从页面 `window.__initialize_data__` 中提取结构化数据，避免只做简单网页截图。
- 支持图文博文和纯文本博文。
- 正文会清洗 HTML 标签、解码常见 HTML 实体，并可自动补全首行缩进。
- 图片优先使用 `orign` 原图地址，回退到 `raw` 地址。
- 图片下载带失败重试，默认 3 并发处理。
- 支持图片大小限制，超限时可发送缩略图或只发送原图链接。
- 支持合并转发和逐条发送两种输出方式。
- 纯文博文支持单消息、多消息、长图渲染三种发送方式。
- 支持发送博主信息、博文信息、标签链接、互动数据、正文、图片、原图链接和解析统计。
- 支持锅巴面板可视化配置。
- 支持主人命令在线更新插件。
- **博主主页浏览**：`#lofter 博主名` 查看博主信息和最新博文列表，`#lofter下一页` 翻页浏览。
- **标签页浏览**：`#lofter标签 标签名` 查看标签下最新帖子，`#lofter标签下一页` 翻页，`#lofter标签热门` 切换热门排序。
- **列表快速解析**：浏览博主或标签列表后，`#lofter解析 序号` 直接解析指定帖子，无需手动复制链接。
- **错误分类提示**：网络异常、页面结构变更、Puppeteer 渲染失败等场景给出针对性提示，而非笼统报错。
- **配置热重载**：修改 `lofter.yaml` 后无需重启，后续解析自动使用新配置。
- **开发者模式**：`dev` 分支下自动展示与 `main` 分支的差异提交记录。

## 运行环境

- Node.js `>= 18.0.0`
- Yunzai-Bot v3、Miao-Yunzai 或 TRSS-Yunzai 等兼容环境
- 纯文长图模式依赖宿主 Yunzai 的 Puppeteer / Chromium 支持
- 可选：锅巴插件，用于 Web 面板配置

项目依赖很少，运行依赖只有 `node-fetch`。

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

直接发送包含 Lofter 博文链接的消息即可触发解析。

```text
https://example.lofter.com/post/123456_abcdef
```

也可以在普通消息中夹带链接：

```text
看这篇：https://example.lofter.com/post/123456_abcdef
```

插件匹配的链接格式为：

```text
https://<博客名>.lofter.com/post/<博文ID>
http://<博客名>.lofter.com/post/<博文ID>
```

## 更新插件

主人可发送以下任一命令更新插件：

```text
#更新Lofter
#Lofter更新
#更新Lofter插件
#Lofter插件更新
```

更新逻辑会在插件目录执行 `git pull`。如果有更新，插件会尝试展示本次更新日志并重启 Bot。

## 解析结果

默认配置下，一次解析通常包含以下内容：

- 博主昵称、博客名、博主 ID。
- 博文链接、发布时间、博文 ID。
- 标签链接。
- 回复、点赞、推荐、收藏、热度。
- 博文标题。
- 清洗后的正文。
- 图片及每张图片对应的原图链接。
- 解析统计：字数、自然段、图片数、耗时、今日解析次数、本群解析次数。

这些内容都可以在配置中单独开关。

## 发送模式

`sendMode` 控制整体发送方式：

| 值 | 说明 |
| --- | --- |
| `forward` | 合并转发，默认模式。适合图文较多的博文，减少刷屏。 |
| `normal` | 逐条发送。文本和图片会依次发送到当前会话。 |

合并转发模式下可开启 `sendFirstImage`，让插件额外在聊天中发送首图预览。`imageCountPrompt` 可控制首图后是否提示剩余图片数量。

## 纯文博文发送模式

`pureTextSendMode` 只影响无图博文：

| 值 | 说明 |
| --- | --- |
| `single` | 将正文合并为一条消息，段落之间空一行。 |
| `multi` | 将自然段拆成多条消息，仅在合并转发中有明显意义。 |
| `image` | 使用 Puppeteer 将正文渲染为长图。 |

纯文长图模式支持自定义字体、背景色、字号、行高、宽度、渲染倍率和分页字数限制。若渲染失败，插件会回退为普通文本发送。

## 配置方式

推荐使用锅巴插件进行可视化配置。

没有锅巴时，可手动编辑：

```text
plugins/Lofter-Plugin/config/config/lofter.yaml
```

首次读取配置时，插件会根据默认配置自动创建用户配置文件。配置读取优先级为：

```text
用户配置 > 默认配置 > config/fields.js 内置默认值
```

配置管理带有内存缓存和文件热重载，修改 `lofter.yaml` 后通常不需要重启即可在后续解析中生效。

## 配置项

### 通用设置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `autoParse` | `true` | 是否自动解析检测到的 Lofter 链接。 |
| `smartIndent` | `true` | 正文段落无缩进时，自动添加两个全角空格。 |
| `enablePureTextImageFooterStats` | `true` | 纯文图片模式下，在页脚显示字数和段落统计。 |
| `sendMode` | `forward` | 发送模式：`forward` 合并转发，`normal` 逐条发送。 |
| `pureTextSendMode` | `single` | 无图博文正文模式：`single`、`multi`、`image`。 |
| `timeout` | `30` | 页面请求超时时间，单位秒。 |

### 发送内容管理

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `sendBloggerInfo` | `true` | 发送博主昵称、博客名和博主 ID。 |
| `sendPostInfo` | `true` | 发送博文链接、发布时间和博文 ID。 |
| `sendTagLinks` | `true` | 单独发送标签链接；关闭时标签显示在博文基础信息中。 |
| `sendInteraction` | `true` | 发送回复、点赞、推荐、收藏、热度。 |
| `sendPostTitle` | `true` | 发送博文标题。 |
| `sendPostBody` | `true` | 发送正文文本或纯文长图。 |
| `sendImages` | `true` | 发送图片本体。 |
| `sendImageLinks` | `true` | 发送每张图片对应的原图链接。 |
| `sendImageLimitTip` | `true` | 图片触发大小限制时发送配置提示。 |
| `sendParseStats` | `true` | 发送解析统计。 |
| `sendOriginal` | `false` | 逐条发送图片时，尝试以文件形式发送原图。 |
| `sendFirstImage` | `false` | 合并转发后额外发送首图预览。 |
| `enableImageSizeLimit` | `true` | 开启图片大小限制，防止超大图拖垮进程。 |
| `imageSizeLimit` | `8` | 图片大小限制阈值，单位 MB。 |
| `sendThumbnail` | `true` | 超限图片尝试发送缩略图。 |
| `imageCountPrompt` | `true` | 首图预览后提示剩余图片数量或超限信息。 |

### 纯文图片模式设置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `imageFont` | `''` | 正文字体。可填系统字体名，也可将字体文件放入 `resources/fonts`。 |
| `imageBgColor` | `#FFFFFF` | 背景颜色。 |
| `imageFontColor` | `#333333` | 正文字体颜色。 |
| `imageFontSize` | `26` | 正文字号，单位 px。 |
| `imageLineHeight` | `1.5` | 正文行高。 |
| `imageTitleColor` | `#000000` | 标题颜色。 |
| `imageTitleSize` | `32` | 标题字号，单位 px。 |
| `imagePadding` | `40` | 图片整体内边距，单位 px。 |
| `imageWidth` | `800` | 图片布局宽度，单位 px。 |
| `imageDeviceScale` | `2` | 渲染倍率，`2` 表示 2x 清晰度。 |
| `imageTextLimit` | `1000` | 单张图最大字数，超出后分页；`0` 表示不限制。 |

### 合并转发设置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `forwardTitle` | `Lofter解析结果` | 合并转发外显标题。 |
| `forwardNickname` | `''` | 合并转发内部昵称，留空使用 Bot 名称。 |

## 图片处理策略

插件会将图片临时下载到：

```text
<Yunzai根目录>/temp/lofter
```

图片文件名由博客名、发布日期和图片序号组成，发送结束后会清理临时文件。

当 `enableImageSizeLimit` 开启时，插件会检查下载后的图片大小：

- 未超过 `imageSizeLimit`：正常发送图片。
- 超过限制且 `sendThumbnail` 为 `true`：发送缩略图，并附带原图链接。
- 超过限制且 `sendThumbnail` 为 `false`：不发送图片本体，只发送原图链接和超限提示。

关闭 `sendImages` 但保留 `sendImageLinks` 时，插件只发送原图链接，不下载和发送图片本体。

## 项目结构

```text
Lofter-Plugin/
├── index.js                         # 插件入口，加载 apps 下的插件类
├── apps/
│   ├── lofter.js                    # 博文链接解析 + 快速解析
│   ├── blogBrowser.js               # 博主主页浏览 + 翻页
│   ├── tagBrowser.js                # 标签页浏览 + 翻页 + 热门
│   └── update.js                    # 插件更新命令
├── components/
│   └── Config.js                    # YAML 配置读取、合并、缓存和热重载
├── config/
│   ├── fields.js                    # 配置字段注册表，锅巴 schema 与默认值的来源
│   └── default_config/lofter.yaml   # 默认配置文件
├── guoba/                           # 锅巴面板接入
├── lib/
│   ├── core/                        # 基础设施
│   │   ├── types.js                 # 集中类型定义
│   │   ├── errors.js                # 错误分类 + 自定义错误类
│   │   ├── configLoader.js          # 统一配置加载 + normalizeConfig
│   │   └── utils.js                 # 通用工具和常量
│   ├── fetch/                       # 网络请求与缓存
│   │   ├── cache.js                 # 通用 TtlCache 类
│   │   ├── fetcher.js               # 页面抓取、图片下载、临时文件清理
│   │   └── listCache.js             # 列表缓存（按群/私聊维度）
│   ├── parse/                       # 数据解析
│   │   ├── parser.js                # 博文数据解析
│   │   ├── blogParser.js            # 博主主页解析
│   │   └── tagParser.js             # 标签页解析
│   ├── render/                      # 渲染处理
│   │   ├── textProcessor.js         # HTML 清洗、段落拆分、智能缩进
│   │   ├── imageHandler.js          # 图片下载重试、大小限制、缩略图
│   │   └── imageRenderer.js         # 纯文长图渲染
│   └── message/                     # 消息构建与发送
│       ├── messageBuilder.js        # 消息文本格式化
│       ├── sender.js                # 合并转发、图片发送、撤回
│       └── pipeline.js              # 博文解析流水线（Step 2-10）
├── resources/
│   ├── fonts/                       # 纯文图片模式字体目录
│   └── html/lofter/text-post.html   # 纯文长图模板
├── guoba.support.js                 # 锅巴支持入口
└── package.json
```

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

### 配置文件路径容易写错

插件目录名是 `Lofter-Plugin`，用户配置文件路径是：

```text
plugins/Lofter-Plugin/config/config/lofter.yaml
```

## 注意事项

- Lofter 页面结构和 CDN 策略可能变化，解析和图片下载依赖当时可访问的数据。
- 图片和头像请求会携带移动端 User-Agent，图片下载还会使用博文链接作为 Referer。
- 解析计数只保存在当前进程内，Bot 重启后会重置。
- `sendOriginal` 仅在逐条发送图片时用于尝试发送文件；合并转发中仍按图片消息组织。
- 插件更新命令需要主人权限。

## 免责声明

- 本插件仅供学习交流使用，请勿用于任何商业或非法用途。
- 插件解析的内容（包括但不限于博文文本、图片、博主信息）版权归原博主及 Lofter 平台所有，使用者应遵守 Lofter 用户协议及相关法律法规。
- 插件通过抓取 Lofter 页面公开数据实现功能，不涉及账号登录、数据篡改或越权访问。若 Lofter 平台调整页面结构或接口策略导致插件失效，作者不承担任何责任。
- 使用本插件下载的图片仅供个人查看，请勿未经授权转载、二次分发或用于其他侵权行为。
- 因使用本插件产生的任何直接或间接损失，作者不承担任何责任。

## 许可证

本项目基于 [GPL-3.0 License](LICENSE) 开源。
