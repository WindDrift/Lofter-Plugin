# Lofter-Plugin

适用于 [Yunzai-Bot](https://github.com/yoimiya-kokomi/Miao-Yunzai) v3 和 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) 的 Lofter 博文解析插件。

当群员或好友发送包含 Lofter 博文链接的消息时，机器人会自动解析该博文的内容，并提取文字信息和图片发送。

## 🌟 功能特点

- **自动解析**：通过正则匹配消息中的 Lofter 链接，无需特定命令前缀。
- **详尽信息**：提取并展示博主信息、博文标题、正文（已去除HTML标签）、发布时间、标签以及各项互动数据（回复、点赞、推荐、收藏、热度）。
- **多种发送模式**：支持合并转发（默认）或逐条发送。在合并转发模式下，保持聊天界面整洁有序。
- **原图获取**：自动抓取博文中的所有高清原图（`orign` 或 `raw`），支持以图片卡片或文件形式（根据配置）发送。
- **动态状态提示**：在解析较慢时会发送“准备解析”的提示，并在解析完毕后自动撤回该提示消息。
- **锅巴插件支持**：全面支持 [锅巴插件(Guoba-Plugin)](https://gitee.com/guoba-yunzai/guoba-plugin)，可通过 Web 界面轻松修改所有配置项。
- **自定义 UA**：采用特定的移动端 User-Agent 进行请求获取，极大提升了网页请求的成功率。

## 📦 安装说明

1. 进入 Yunzai-Bot 的 `plugins` 目录，克隆本仓库：
```bash
cd plugins
git clone https://github.com/WindDrift/Lofter-Plugin.git
```
*(如果文件夹名称不是 `Lofter-Plugin`，请确保文件夹名称合法，建议保持默认或使用全小写字母)*

2. 进入插件目录并安装依赖（本插件依赖 `node-fetch` 发送网络请求，以及 `yaml` 用于配置文件读写）：
```bash
cd Lofter-Plugin
npm install
```

3. 重启 Yunzai-Bot 或对机器人发送 `#重启`。

## 🚀 使用方法

无需任何特定指令，直接在机器人所在的群聊或私聊中发送含有 Lofter 博文链接的消息即可。

**示例消息：**
> 快看这篇文！ https://hoyeee.lofter.com/post/77cfa643_34d4d17d0

**机器人回复示例（随配置而不同）：**
合并转发标题：“Lofter解析结果”
> [博主信息]：红叶北极贝 | hoyeee.lofter.com | ID：2010097219
> [博文信息]：标题、时间、标签
> [互动数据]：回复: 18 | 点赞: 2101 | 推荐: 344 | 收藏: 77 | 热度: 2522
> [图片列表]：... （如带图片则自动下载并展示）

## ⚙️ 配置说明

插件支持通过 **[关于配置面板 (锅巴插件)](https://gitee.com/guoba-yunzai/guoba-plugin)** 进行可视化配置管理。

如果您未安装锅巴插件，也可以直接修改配置文件。首次运行后，将在 `plugins/lofter-plugin/config/config/` 下生成 `lofter.yaml`，您可以手动修改以下配置项：

- `autoParse`: `true` (是否自动解析 Lofter 链接)
- `sendOriginal`: `false` (是否发送原图文件，开启可能会增加流量消耗)
- `sendMode`: `forward` (消息发送方式：`forward` 合并转发，`normal` 逐条发送)
- `sendFirstImage`: `false` (合并转发时，是否单独发送第一张图片预览)
- `forwardTitle`: `'Lofter解析结果'` (合并转发外显消息标题)
- `forwardNickname`: `''` (合并转发内部QQ名，为空时使用默认Bot名称)
- `timeout`: `30` (网络请求超时时间，单位秒)
- `showTags`: `true` (是否显示博文标签)

## 📝 注意事项

- 插件会将下载的图片暂存在 Yunzai 根目录的 `temp/lofter` 文件夹中，发送完成后会自动清理对应文件，不会占用过多硬盘空间。
- 受网络波动和 Lofter 平台策略影响，部分博文的数据或图片可能存在获取失败的情况。此时插件会进行适当的容错处理（如兜底为普通文本提示或以 Buffer 图片形式发送）。

## 📄 开源协议

本项目使用 [GPL-3.0 License](LICENSE) 开源。
