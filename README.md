# Lofter-Plugin

适用于 [Yunzai-Bot](https://github.com/yoimiya-kokomi/Miao-Yunzai) v3 和 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) 的 Lofter 博文解析插件。

当群员或好友发送包含 Lofter 博文链接的消息时，机器人会自动解析该博文的内容，并提取文字信息和图片发送。

## 功能特点

- **自动解析** — 通过正则匹配消息中的 Lofter 链接，无需特定命令前缀
- **详尽信息** — 提取博主信息、博文标题、正文（已去除 HTML 标签）、发布时间、标签及各项互动数据
- **多种发送模式** — 支持合并转发（默认）或逐条发送；纯文博文额外支持多消息拆分与长图渲染模式
- **原图获取** — 自动抓取博文中的高清原图（`orign` / `raw`），每张图片附带对应原图链接，支持以图片卡片或文件形式发送
- **图片大小限制** — 超限图片自动降级为缩略图或仅发送链接，防止大图导致进程崩溃
- **智能缩进** — 自动检测段落缩进，为无缩进段落添加全角空格首行缩进
- **解析统计** — 结果末尾显示字数、自然段、图片数、解析耗时、今日解析次数和本群解析次数
- **动态状态提示** — 解析较慢时发送"准备解析"提示，解析完毕后自动撤回
- **锅巴插件支持** — 全面支持 [锅巴插件](https://gitee.com/guoba-yunzai/guoba-plugin)，可通过 Web 界面管理所有配置项
- **插件更新** — 支持 `#更新Lofter` 指令一键拉取最新代码

## 安装说明

1. 进入 Yunzai-Bot 的 `plugins` 目录，克隆本仓库：

```bash
cd plugins
git clone https://github.com/WindDrift/Lofter-Plugin.git
```

2. 进入插件目录并安装依赖：

```bash
cd Lofter-Plugin
npm install
```

3. 重启 Yunzai-Bot 或发送 `#重启`。

## 使用方法

直接在群聊或私聊中发送含有 Lofter 博文链接的消息即可，无需任何指令。

**示例：**

> 快看这篇文！ https://hoyeee.lofter.com/post/77cfa643_34d4d17d0

**更新插件：**

> #更新Lofter

## 项目结构

```
Lofter-Plugin/
├── index.js                    # 插件入口，扫描并加载 apps/ 下的模块
├── guoba.support.js            # 锅巴插件支持入口
├── apps/
│   ├── lofter.js               # 主插件：Lofter 链接解析调度器
│   └── update.js               # 更新插件：#更新Lofter 指令处理
├── lib/                        # 核心业务模块（模块化拆分）
│   ├── fetcher.js              # HTTP 请求与文件下载
│   ├── parser.js               # HTML/JSON 数据解析
│   ├── textProcessor.js        # 文本清洗与智能缩进
│   ├── imageHandler.js         # 图片下载与大小限制检查
│   ├── imageRenderer.js        # Puppeteer 长图渲染
│   ├── messageBuilder.js       # 消息组装与发送
│   └── utils.js                # 通用工具函数
├── components/
│   └── Config.js               # YAML 配置管理（默认配置 + 用户配置合并）
├── config/
│   └── default_config/
│       └── lofter.yaml         # 默认配置文件
├── guoba/                      # 锅巴插件集成
│   ├── index.js                # 锅巴支持入口
│   ├── pluginInfo.js           # 插件元信息
│   ├── configInfo.js           # 配置信息导出
│   └── schemas/
│       ├── index.js            # Schema 与配置读写
│       └── lofter.js           # Lofter 配置表单定义
└── resources/
    ├── fonts/                  # 自定义字体（图片模式使用）
    └── html/lofter/
        ├── text-post.html      # 纯文长图渲染模板
        └── text-post.css       # 渲染模板样式
```

## 配置说明

插件支持通过 [锅巴插件](https://gitee.com/guoba-yunzai/guoba-plugin) 进行可视化配置管理。

未安装锅巴插件时，可手动修改 `plugins/lofter-plugin/config/config/lofter.yaml`（首次运行后自动生成）。

### 通用设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `autoParse` | `true` | 是否自动解析 Lofter 链接 |
| `smartIndent` | `true` | 智能首行缩进（无缩进段落自动添加全角空格） |
| `sendMode` | `forward` | 消息发送方式：`forward` 合并转发 / `normal` 逐条发送 |
| `pureTextSendMode` | `single` | 纯文发送模式：`single` 单消息 / `multi` 多消息 / `image` 长图渲染 |
| `timeout` | `30` | 网络请求超时时间（秒） |

### 发送设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `tagLinks` | `true` | 是否显示独立标签链接消息；关闭时在博文基础信息中显示普通标签 |
| `sendOriginal` | `false` | 是否以文件形式发送原图（会增加流量消耗） |
| `sendFirstImage` | `false` | 合并转发时是否单独发送首图预览 |
| `imageCountPrompt` | `true` | 首图后是否附加剩余图片数量提示 |
| `enableImageSizeLimit` | `true` | 是否启用图片大小限制 |
| `imageSizeLimit` | `8` | 图片大小限制阈值（MB） |
| `sendThumbnail` | `true` | 超限图片是否发送缩略图 |

### 图片模式设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `imageFont` | `''` | 正文字体（系统字体名或 resources/fonts 目录下的字体文件） |
| `imageBgColor` | `#FFFFFF` | 背景颜色 |
| `imageFontColor` | `#333333` | 正文字体颜色 |
| `imageFontSize` | `26` | 正文字号（px） |
| `imageLineHeight` | `1.5` | 正文行高 |
| `imageTitleColor` | `#000000` | 标题颜色 |
| `imageTitleSize` | `32` | 标题字号（px） |
| `imagePadding` | `40` | 整体内边距（px） |
| `imageWidth` | `800` | 布局宽度（px） |
| `imageDeviceScale` | `2` | 渲染倍率（1=正常，2=2x 清晰） |
| `imageTextLimit` | `1000` | 单图最大字数（超出自动分页，0=不限制） |

### 合并转发设置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `forwardTitle` | `Lofter解析结果` | 合并转发外显标题 |
| `forwardNickname` | `''` | 合并转发内部昵称（留空使用 Bot 名称） |

## 注意事项

- 下载的图片暂存在 Yunzai 根目录的 `temp/lofter` 文件夹中，发送完成后会自动清理
- 解析结果顺序为：博主信息、博文基础信息、标签链接或普通标签、互动数据、正文标题、正文、图片、图片大小限制提示、统计
- 受网络波动和 Lofter 平台策略影响，部分博文的数据或图片可能获取失败，插件会进行容错处理
- 图片模式依赖云崽内置的 Puppeteer 支持，请确保已正确安装 Chromium

## 开源协议

本项目使用 [GPL-3.0 License](LICENSE) 开源。
