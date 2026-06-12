# AGENT.md — Lofter-Plugin AI 代理指南

> 本文件为 AI 编码代理提供项目上下文，确保修改符合项目架构与约定。

## 项目概述

Yunzai-Bot v3 插件，解析 Lofter 博文链接并发送图文到 QQ。ES Module，唯一运行时依赖 `node-fetch@^2.7.0`。

## 技术栈

| 项目 | 值 |
|------|-----|
| 运行时 | Node.js >= 18.0.0 |
| 模块系统 | ESM (`"type": "module"`) |
| 框架 | Yunzai-Bot v3 / TRSS-Yunzai |
| 外部依赖 | `node-fetch@^2.7.0`（仅此一个） |
| 代码风格 | 无分号、单引号、2 空格缩进、行宽 120、LF 换行 |

## 目录结构

```
Lofter-Plugin/
├── index.js                    # 入口：扫描 apps/ 动态注册插件类
├── package.json
├── guoba.support.js            # Guoba 面板入口 re-export
│
├── apps/                       # 命令处理层（每个文件导出 extends plugin 的类）
│   ├── lofter.js               # 博文链接解析 + 快速解析（2 个 rule）
│   ├── blogBrowser.js          # 博主主页浏览 + 翻页（2 个 rule）
│   ├── tagBrowser.js           # 标签页浏览 + 翻页 + 热门（3 个 rule）
│   └── update.js               # 插件更新（1 个 rule，master 权限）
│
├── lib/                        # 业务逻辑层（按职责分子目录）
│   ├── core/                   # 基础设施：类型、错误、配置、工具
│   │   ├── types.js            # 所有 JSDoc typedef 集中定义
│   │   ├── errors.js           # categorizeError + 自定义错误类
│   │   ├── configLoader.js     # 统一配置加载 + normalizeConfig
│   │   └── utils.js            # 通用工具函数（日期格式化、并发控制等）
│   │
│   ├── fetch/                  # 网络请求与缓存
│   │   ├── cache.js            # 通用 TtlCache 类（Map + expireAt）
│   │   ├── fetcher.js          # HTTP 请求 + HTML 缓存 + 图片下载 + 临时文件清理
│   │   └── listCache.js        # 列表缓存（基于 TtlCache，按群/私聊维度）
│   │
│   ├── parse/                  # 数据解析（纯函数，无副作用）
│   │   ├── parser.js           # 博文数据解析（HTML → PostExtracted）
│   │   ├── blogParser.js       # 博主主页解析（→ BlogPageExtracted）
│   │   └── tagParser.js        # 标签页解析（→ TagPageExtracted）
│   │
│   ├── render/                 # 渲染处理
│   │   ├── textProcessor.js    # HTML 清洗 + 智能缩进 + 段落分割
│   │   ├── imageHandler.js     # 图片下载/大小限制/缩略图处理
│   │   └── imageRenderer.js    # Puppeteer 长图渲染
│   │
│   └── message/                # 消息构建与发送
│       ├── messageBuilder.js   # 纯文本消息格式化（无发送逻辑）
│       ├── sender.js           # 合并转发/图片发送/撤回/列表发送
│       └── pipeline.js         # 博文解析流水线（Step 2-10 编排）
│
├── components/
│   └── Config.js               # 配置管理（单例 + 缓存 + fs.watch 热重载）
│
├── config/
│   ├── fields.js               # 配置字段注册表（单一事实源，30 个字段）
│   └── default_config/
│       └── lofter.yaml         # 默认配置（YAML，带中文注释）
│
├── guoba/                      # Guoba 面板集成
│   ├── index.js                # supportGuoba 入口
│   ├── pluginInfo.js           # 插件元信息
│   ├── configInfo.js           # 配置读写接口
│   └── schemas/
│       ├── index.js            # Schema 生成 + getConfigData + setConfigData
│       └── lofter.js           # 从 LOFTER_FIELDS 自动生成表单 schema
│
└── resources/
    ├── fonts/                  # 默认字体文件
    └── html/lofter/            # Puppeteer 渲染 HTML 模板
        └── text-post.html
```

## 命令触发器（8 个 rule）

| # | 触发正则 | 处理类 | 方法 | 说明 |
|---|----------|--------|------|------|
| 1 | `https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+` | LofterPlugin | parseLofter | 博文链接自动解析 |
| 2 | `^#lofter解析\s*(\d+)$` | LofterPlugin | parseCachedListItem | 按序号解析缓存列表项 |
| 3 | `^#lofter\s+(.+)$` | BlogBrowser | browseBlog | 浏览博主主页 |
| 4 | `^#lofter下一页$` | BlogBrowser | browseBlogNextPage | 博主主页翻页 |
| 5 | `^#lofter标签\s+(.+)$` | TagBrowser | browseTag | 浏览标签页 |
| 6 | `^#lofter标签下一页$` | TagBrowser | browseTagNextPage | 标签页翻页 |
| 7 | `^#lofter标签热门$` | TagBrowser | browseTagHot | 标签页切换热门 |
| 8 | `/^#?(更新lofter|lofter更新|...)$/i` | LofterUpdate | updatePlugin | 插件更新（master） |

## 模块依赖图

```
apps/lofter.js ──→ lib/core/{configLoader, errors, utils}
                ──→ lib/fetch/listCache
                ──→ lib/message/pipeline

apps/blogBrowser.js ──→ lib/fetch/{fetcher, listCache}
                     ──→ lib/parse/{parser, blogParser}
                     ──→ lib/message/{messageBuilder, sender}
                     ──→ lib/core/{errors, configLoader}

apps/tagBrowser.js ──→ lib/fetch/{fetcher, listCache}
                    ──→ lib/parse/{parser, tagParser}
                    ──→ lib/message/{messageBuilder, sender}
                    ──→ lib/core/{errors, configLoader}

lib/message/pipeline.js ──→ lib/fetch/fetcher
                         ──→ lib/parse/parser
                         ──→ lib/render/{textProcessor, imageHandler, imageRenderer}
                         ──→ lib/message/{messageBuilder, sender}
                         ──→ lib/core/{utils, errors}

lib/message/sender.js ──→ lib/message/messageBuilder

lib/fetch/fetcher.js ──→ lib/fetch/cache, lib/core/utils
lib/fetch/listCache.js ──→ lib/fetch/cache

lib/render/imageHandler.js ──→ lib/fetch/fetcher, lib/parse/parser, lib/core/utils
lib/render/imageRenderer.js ──→ lib/render/textProcessor, lib/core/utils
lib/render/textProcessor.js ──→ lib/core/utils

lib/message/messageBuilder.js ──→ lib/core/utils

lib/core/configLoader.js ──→ components/Config, config/fields

components/Config.js ──→ config/fields

叶子节点（无本地依赖）: lib/core/{types, errors, utils}, lib/fetch/cache,
                        lib/parse/{parser, blogParser, tagParser}, config/fields
```

**无循环依赖**。依赖方向严格：apps → lib/message → lib/render → lib/parse → lib/fetch → lib/core。

## 关键 API 参考

### lib/core/configLoader.js
```javascript
loadConfig()              // 防御性加载配置，返回 normalized 对象或 null
normalizeConfig(rawConfig) // 以 fields.js 默认值为底合并用户配置
```

### lib/core/errors.js
```javascript
categorizeError(err)  // → { category: 'network'|'parse'|'render'|'unknown', hint: string }
class LofterError extends Error { category }
class NetworkError extends LofterError
class ParseError extends LofterError
class ConfigError extends LofterError
```

### lib/core/utils.js
```javascript
THUMBNAIL_TRANSFORM           // Lofter 缩略图 URL 后缀
MOBILE_USER_AGENT             // 移动端 UA 字符串
HTML_ENTITY_MAP               // 33 个 HTML 实体映射
runWithConcurrency(limit, tasks)  // 轻量级并发控制（p-limit 替代）
sleep(ms)                     // Promise 延时
formatDate(timestamp)         // → 'YYYY-MM-DD'
formatDateTime(timestamp)     // → 'YYYY-MM-DD HH:mm:ss'
sanitizeFileName(name)        // 文件名安全化
```

### lib/fetch/cache.js
```javascript
class TtlCache {
  constructor({ maxSize = 200, defaultTtl = 300 })
  get(key)           // 命中且未过期返回值，否则 null
  set(key, value, ttlSeconds?)  // 写入，超阈值自动清理
  delete(key)        // 删除
  clear()            // 清空
  cleanup()          // 清理所有过期项，返回清理数
  get size           // 当前条目数
}
```

### lib/fetch/fetcher.js
```javascript
fetchPage(url, timeout = 30)                    // 抓取页面（重试2次 + HTML缓存）
downloadImage(imgUrl, referer, {tempDir, fileName})  // 下载图片
cleanupTempFiles(tempDir, prefix)               // 清理临时文件（按前缀匹配）
cleanupFile(filePath)                           // 清理单个文件
```

### lib/fetch/listCache.js
```javascript
getListCacheKey(e)              // → 'group:xxx' | 'private:xxx'
setListCache(e, value, ttl = 600)
getListCache(e)                 // → ListCacheValue | null
clearExpiredListCache()         // → number
```

### lib/parse/parser.js
```javascript
parsePageData(html)             // 从 HTML 提取 __initialize_data__ JSON
extractPostInfo(dataObj, url)   // → PostExtracted
extractImageUrl(link)           // → string | null
extractImageExt(imgUrl)         // → string
```

### lib/parse/blogParser.js
```javascript
extractBlogPageInfo(dataObj, sourceUrl)  // → BlogPageExtracted
```

### lib/parse/tagParser.js
```javascript
extractTagPageInfo(dataObj, sourceUrl, sort?)  // → TagPageExtracted
```

### lib/render/textProcessor.js
```javascript
cleanHtml(html)                 // HTML → 纯文本
splitParagraphs(text)           // 按换行分段
countTextUnits(text)            // 统计字数
applySmartIndent(paragraphs, enabled?)  // 智能首行缩进
processText(html, options?)     // 顶层编排：清洗 → 分段 → 缩进
```

### lib/render/imageHandler.js
```javascript
buildImageFileName(blogName, publishTime, index, totalCount, imgUrl)
resolveImageTarget(photoLink, index, totalCount, context)
classifyBySize(imgUrl, index, fileSizeMB, config)
processImage(photoLink, index, totalCount, context)  // → {success, ...}
getTempDir()                    // → 'process.cwd()/temp/lofter'
```

### lib/render/imageRenderer.js
```javascript
setPuppeteerImporter(importer)  // 注入 Puppeteer 导入器
resolveFontConfig(customFontName?)
resolveAvatarDataUri(avatarUrl, refererUrl?)
splitParagraphsByLimit(paragraphs, textLimit)
renderTextAsImages(params)      // → string[] 图片路径数组
```

### lib/message/messageBuilder.js
```javascript
applyForwardTitle(msgNode, title)       // 替换合并转发 XML 标题
buildBloggerMessage(blogger)            // 博主信息文本
buildPostInfoMessage(post)              // 博文基础信息文本
buildTagLinksMessage(tagList)           // 标签链接文本
buildInteractionMessage(interaction)    // 互动数据文本
buildImageLinksMessage(photoLinks)      // 原图链接列表文本
buildImageOriginMessage(index, imgUrl)  // 单张原图链接文本
buildParseStatsMessage(stats)           // 解析统计文本
buildBlogListMessages(blogPage, config) // 博主列表消息数组
buildTagListMessages(tagPage, config)   // 标签列表消息数组
```

### lib/message/sender.js
```javascript
makeForwardMsg(e, msgList, title?, nickname?)  // 构造合并转发消息节点
sendImageNormal(e, filePath, fileName, config) // 逐条发送图片
recallMessage(e, prepMsg)                      // 撤回消息（含回退策略）
sendListResult(e, messages, config)            // 统一列表消息发送
```

### lib/message/pipeline.js
```javascript
executeParsePipeline(e, {
  url,                           // 博文链接
  config,                        // 已规范化的配置对象
  recordParse,                   // (e) => { today, group } 计数回调
  onDeveloperMode                // (e) => Promise<void> 开发者模式回调
})  // → Promise<boolean>
```

## 配置系统

### 单一事实源

`config/fields.js` 是配置项的唯一注册表。每个字段包含 `key/type/default/label/group/order`。

**默认值三源已消除**：`fields.js` 为唯一默认值来源，`normalizeConfig()` 负责合并。

### 配置合并优先级

```
fields.js 注册表默认值 → default YAML → 用户 YAML（覆盖）
```

### 配置加载流程

1. `configLoader.loadConfig()` 防御性获取 Config 单例
2. `Config.getInstance().getDefSet('lofter')` 读取配置
3. `normalizeConfig(rawConfig)` 以 `buildDefaultLofterConfig()` 为底合并
4. 返回规范化后的配置对象

### 配置热重载

`Config.js` 使用 `fs.watch` 监听用户 YAML，debounce 300ms 后自动失效内存缓存。

## 缓存策略

| 缓存 | 实例 | 容量 | 默认 TTL | 键 | 用途 |
|------|------|------|----------|-----|------|
| HTML 页面 | `TtlCache` | 200 | 300s | URL 原文 | 避免重复抓取 |
| 列表数据 | `TtlCache` | 100 | 600s | `group:xxx` / `private:xxx` | 支持翻页和序号解析 |
| 配置对象 | `Map` | 无上限 | 手动失效 | 配置名 | 避免重复读盘 |

所有缓存均为纯内存，进程重启即清空。`TtlCache` 在 `get` 时惰性删除过期项，`set` 时超阈值触发全量清理。

## 错误处理

### 分类体系

```javascript
categorizeError(err) → {
  category: 'network' | 'parse' | 'render' | 'unknown',
  hint: string  // 用户友好的错误提示
}
```

| category | 匹配条件 | 用户提示 |
|----------|----------|----------|
| network | ENOTFOUND/ETIMEDOUT/ECONNRESET/超时/5xx | 网络请求失败，请稍后重试 |
| parse | JSON解析失败/数据未找到 | 页面结构已变更，请前往 github 提 issue |
| render | Puppeteer/Chromium | Puppeteer 渲染失败，请确认 Chromium 已正确安装 |
| unknown | 其他 | Lofter 解析时发生未知错误 |

### 重试策略

| 操作 | 最大重试 | 退避策略 |
|------|----------|----------|
| fetchPage | 2 | 指数退避 800ms × 2^attempt |
| downloadImage | 1 | 固定 500ms |
| Puppeteer 首页渲染 | 1 | 固定 500ms |

### 容错模式

- 合并转发失败 → 回退逐条发送
- 图片发送失败 → 回退 Buffer 发送
- 消息撤回失败 → 发送"解析完成"占位消息再撤回
- 配置加载失败 → 使用空配置继续

## 博文解析流水线

`pipeline.js` 的 `executeParsePipeline` 编排以下步骤：

```
Step 2: 抓取并解析（fetchPage → parsePageData → extractPostInfo）
Step 3: 发送准备提示（"收到图文/纯文 Lofter 链接..."）
Step 4: 文本处理（HTML 清洗 + 智能缩进 + 统计）
Step 5: 组装文本消息（博主信息/博文信息/标签/互动/正文）
Step 6: 纯文图片模式渲染（Puppeteer 长图，仅纯文+image模式时）
Step 8: 图片下载与处理（runWithConcurrency(3) 并发）
Step 9: 大小限制提示
Step 10: 发送结果（forward/normal 分支）
finally: 撤回准备消息
```

两个入口共享此流水线：
- `LofterPlugin.parseLofter` — URL 自动检测触发
- `LofterPlugin.parseCachedListItem` — `#lofter解析 N` 序号触发

## 列表浏览模式

5 个列表浏览方法共享统一流程：

```
loadConfig() → 提取参数/读取缓存 → 构造URL → fetchPage → parsePageData
→ extractXxxPageInfo → slice分页 → buildXxxListMessages
→ setListCache → sendListResult（统一发送）
```

`sendListResult` 统一处理 forward/normal 分支，消除重复代码。

## 临时文件管理

- 下载目录：`process.cwd()/temp/lofter/`
- 文件名格式：`{blogName}-{YYYYMMDD}-{index}.{ext}`
- 清理时机：合并转发发送后 / 逐条发送每张图片后
- 作品保护：`blogger.imageProtected` 时不下载原图，改发缩略图

## 日志约定

- 统一前缀：`[Lofter解析]`
- debug 级别使用可选链：`logger.debug?.()`
- 错误分类日志：`logger.error(\`[Lofter解析] [${category}] ${err.message}\`)`

## Yunzai 插件契约

- `apps/` 下每个 `.js` 文件导出一个继承自 `plugin` 的类
- `index.js` 自动扫描 `apps/` 目录并注册，新增文件无需修改入口
- 类构造函数中 `super({ name, dsc, event, priority, rule })` 定义路由
- 每个 rule 的 `reg` 为字符串正则，`fnc` 为方法名
- handler 方法签名为 `async method(e)`，返回 `boolean`
- `e.reply(msg)` 发送消息，`e.isGroup` 判断群聊，`e.group_id` 获取群号

## Guoba 面板集成

- 入口：`guoba.support.js` → `guoba/index.js` → `supportGuoba()`
- Schema 自动生成：`guoba/schemas/lofter.js` 从 `LOFTER_FIELDS` 生成表单
- 字段类型映射：`switch→Switch`, `input→Input`, `number→InputNumber`, `select→Select`
- 写入安全：`setConfigData` 白名单过滤，兼容嵌套/扁平/直接三种数据形态

## 修改指南

### 新增配置项

1. 在 `config/fields.js` 的 `LOFTER_FIELDS` 数组中添加字段定义
2. 在 `config/default_config/lofter.yaml` 中添加默认值和注释
3. 在 `lib/core/types.js` 的 `LofterConfig` typedef 中添加属性
4. Guoba schema 自动生成，无需手动修改

### 新增命令

1. 在 `apps/` 下创建新文件，导出 `extends plugin` 的类
2. 在构造函数中定义 `rule`（reg + fnc）
3. 实现 handler 方法，使用 `loadConfig()` 加载配置
4. `index.js` 自动发现，无需修改

### 新增解析类型

1. 在 `lib/parse/` 下创建解析模块，导出纯函数
2. 在 `lib/core/types.js` 中添加对应 typedef
3. 在 `lib/message/messageBuilder.js` 中添加消息格式化函数
4. 在对应 apps handler 中调用

### 修改流水线

- 流水线步骤在 `lib/message/pipeline.js` 中定义
- 修改步骤时需确保 `parseLofter` 和 `parseCachedListItem` 两个入口的行为一致
- 新增步骤应在现有步骤编号之后插入（如 Step 7），不重新编号

### 修改缓存

- 所有 TTL 缓存统一使用 `lib/fetch/cache.js` 的 `TtlCache` 类
- 新增缓存实例时指定 `maxSize` 和 `defaultTtl`
- 缓存键设计需考虑群/私聊隔离

## 禁止事项

- **不引入新依赖**：项目唯一外部依赖为 `node-fetch`
- **不修改 Guoba 接口**：`guoba/` 目录的公共 API 保持不变
- **不改变命令正则**：8 个 rule 的触发正则必须保持向后兼容
- **不使用 CommonJS**：全部使用 ES Module（import/export）
- **不创建循环依赖**：依赖方向严格 apps → message → render → parse → fetch → core
- **不在 messageBuilder.js 中添加发送逻辑**：发送相关函数归入 sender.js
- **不在 apps/ 外直接使用 Yunzai API**：Yunzai API（e.reply/segment/Bot）仅在 apps/ 和 sender.js 中使用
