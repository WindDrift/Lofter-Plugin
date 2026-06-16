/**
 * @module config/fields
 * @description Lofter 插件配置字段注册表（M-01 单一事实源）
 *
 * 设计原则：
 *  - 任何配置项都必须在此注册（schema、默认值、类型、分组一并声明）
 *  - guoba schema 与默认 YAML 由本文件自动生成
 *  - 新增配置项 = 在本文件添加一行
 *
 * 字段对象结构：
 *  - key:       短字段名（无 lofter. 前缀）
 *  - type:      'switch' | 'input' | 'number' | 'select' | 'divider'
 *  - default:   默认值
 *  - label:     锅巴面板显示名
 *  - bottomLabel: 锅巴面板说明
 *  - options:   仅 select 使用，{label, value} 列表
 *  - min/max/step: 仅 number 使用
 *  - group:     分组名（用于前端 Divider 区域）
 *  - order:     同组内排序，越小越靠前
 */

export const LOFTER_FIELDS = [
  // ============== 通用设置 ==============
  {
    key: 'autoParse', type: 'switch', default: true,
    label: '自动解析', bottomLabel: '检测到Lofter链接时自动解析',
    group: '通用设置', order: 10
  },
  {
    key: 'smartIndent', type: 'switch', default: true,
    label: '智能首行缩进', bottomLabel: '如果段落没有缩进，自动在开头加两个全角空格',
    group: '通用设置', order: 20
  },
  {
    key: 'enablePureTextImageFooterStats', type: 'switch', default: true,
    label: '纯文图片页脚统计', bottomLabel: '纯文图片模式下在每张图的页脚显示总字数、自然段和当前页字数',
    group: '通用设置', order: 30
  },
  {
    key: 'sendMode', type: 'select', default: 'forward',
    label: '发送模式', bottomLabel: '选择消息发送的方式',
    options: [
      { label: '合并转发', value: 'forward' },
      { label: '逐条发送', value: 'normal' }
    ],
    group: '通用设置', order: 40
  },
  {
    key: 'pureTextSendMode', type: 'select', default: 'single',
    label: '纯文发送模式', bottomLabel: '无图博文的纯文本分段组织方式',
    options: [
      { label: '单消息 (每段空一行)', value: 'single' },
      { label: '多消息 (每段拆分一条，限合并转发)', value: 'multi' },
      { label: '图片模式 (转为渲染长图)', value: 'image' }
    ],
    group: '通用设置', order: 50
  },
  {
    key: 'timeout', type: 'number', default: 30, min: 5, max: 120,
    label: '超时时间', bottomLabel: '解析请求的超时时间（秒）',
    group: '通用设置', order: 60
  },
  {
    key: 'lofterLoginEnabled', type: 'switch', default: false,
    label: '启用Lofter登录', bottomLabel: '开启后使用下方 Cookie Key 与 Cookie 值访问登录后内容',
    group: '通用设置', order: 70
  },
  {
    key: 'lofterLoginKey', type: 'input', default: '',
    label: 'Lofter登录Key', bottomLabel: '登录 Key 参考表：Authorization、LOFTER-PHONE-LOGIN-AUTH、LOFTER_SESS、NTES_SESS。获取方式：浏览器 F12 → Network → XHR → 点开请求 → Cookies → 复制对应 loginKey 的值',
    group: '通用设置', order: 80
  },
  {
    key: 'lofterLoginAuth', type: 'input', default: '',
    label: 'Lofter登录Auth', bottomLabel: '填写 lofterLoginKey 对应的 Cookie 值。获取方式：浏览器 F12 → Network → XHR → 点开请求 → Cookies → 复制对应 loginKey 的值',
    group: '通用设置', order: 90
  },

  // ============== 发送内容管理 ==============
  {
    key: 'sendBloggerInfo', type: 'switch', default: true,
    label: '发送博主信息', bottomLabel: '是否发送博主昵称、博客名和博主ID',
    group: '发送内容管理', order: 10
  },
  {
    key: 'sendPostInfo', type: 'switch', default: true,
    label: '发送博文基础信息', bottomLabel: '是否发送博文链接、发布时间、博文ID；标签链接关闭时普通标签也显示在这里',
    group: '发送内容管理', order: 20
  },
  {
    key: 'sendTagLinks', type: 'switch', default: true,
    label: '发送标签链接', bottomLabel: '开启时单独发送带链接的标签消息；关闭时在博文基础信息中显示普通标签',
    group: '发送内容管理', order: 30
  },
  {
    key: 'sendInteraction', type: 'switch', default: true,
    label: '发送互动数据', bottomLabel: '是否发送回复、点赞、推荐、收藏、热度',
    group: '发送内容管理', order: 40
  },
  {
    key: 'sendPostTitle', type: 'switch', default: true,
    label: '发送正文标题', bottomLabel: '是否发送正文标题；纯文图片模式中长图仍保留标题',
    group: '发送内容管理', order: 50
  },
  {
    key: 'sendPostBody', type: 'switch', default: true,
    label: '发送正文', bottomLabel: '是否发送正文文本或纯文长图',
    group: '发送内容管理', order: 60
  },
  {
    key: 'sendImages', type: 'switch', default: true,
    label: '发送图片', bottomLabel: '是否发送图片本体；关闭后仍可单独发送原图链接',
    group: '发送内容管理', order: 70
  },
  {
    key: 'sendImageLinks', type: 'switch', default: true,
    label: '发送原图链接', bottomLabel: '是否为每张图片发送对应的原图链接，和发送图片本体相互独立',
    group: '发送内容管理', order: 80
  },
  {
    key: 'sendImageLimitTip', type: 'switch', default: true,
    label: '发送大小限制提示', bottomLabel: '图片触发大小限制时，是否发送全局调整提示',
    group: '发送内容管理', order: 90
  },
  {
    key: 'sendParseStats', type: 'switch', default: true,
    label: '发送解析统计', bottomLabel: '是否发送字数、自然段、图片数、耗时、今日和本群解析次数',
    group: '发送内容管理', order: 100
  },
  {
    key: 'sendOriginal', type: 'switch', default: false,
    label: '发送原图', bottomLabel: '是否发送原始图片（可能会增加流量消耗）',
    group: '发送内容管理', order: 110
  },
  {
    key: 'sendFirstImage', type: 'switch', default: false,
    label: '发送首图', bottomLabel: '解析到有图片时，单独发第一张图到聊天（可做合并转发的预览）',
    group: '发送内容管理', order: 120
  },
  {
    key: 'enableImageSizeLimit', type: 'switch', default: true,
    label: '图片大小限制', bottomLabel: '超出阈值的图片将不发送，仅发送链接，可有效防止因单图过大导致机器人进程崩溃',
    group: '发送内容管理', order: 130
  },
  {
    key: 'imageSizeLimit', type: 'number', default: 8, min: 1, max: 50,
    label: '图片大小限制阈值', bottomLabel: '单位：MB，仅当开启图片大小限制时生效',
    group: '发送内容管理', order: 140
  },
  {
    key: 'sendThumbnail', type: 'switch', default: true,
    label: '发送缩略图', bottomLabel: '配合大小限制，对超出阈值的图片尝试发送低画质缩略图',
    group: '发送内容管理', order: 150
  },
  {
    key: 'imageCountPrompt', type: 'switch', default: true,
    label: '多图数量提示', bottomLabel: '在解析到多图时发送数量提示',
    group: '发送内容管理', order: 160
  },

  // ============== 纯文图片模式设置 ==============
  {
    key: 'imageFont', type: 'input', default: '',
    label: '正文字体', bottomLabel: '填入系统字体名称。或放入字体文件到 resources/fonts 目录（优先读取）',
    group: '纯文图片模式设置', order: 10
  },
  {
    key: 'imageBgColor', type: 'input', default: '#FFFFFF',
    label: '背景颜色', bottomLabel: '图片模式的全局背景颜色（HEX 色值，如 #FFFFFF）',
    group: '纯文图片模式设置', order: 20
  },
  {
    key: 'imageFontColor', type: 'input', default: '#333333',
    label: '正文字体颜色', bottomLabel: '图片模式中正文文字的颜色（HEX 色值）',
    group: '纯文图片模式设置', order: 30
  },
  {
    key: 'imageFontSize', type: 'number', default: 26, min: 10, max: 36,
    label: '正文字号 (px)', bottomLabel: '正文基础字号，单位 px，默认 26',
    group: '纯文图片模式设置', order: 40
  },
  {
    key: 'imageLineHeight', type: 'number', default: 1.5, min: 1, max: 3, step: 0.1,
    label: '正文行高', bottomLabel: '数字倍数，如 1.5，控制行间距',
    group: '纯文图片模式设置', order: 50
  },
  {
    key: 'imageTitleColor', type: 'input', default: '#000000',
    label: '标题颜色', bottomLabel: '图片模式中标题文字的颜色（HEX 色值）',
    group: '纯文图片模式设置', order: 60
  },
  {
    key: 'imageTitleSize', type: 'number', default: 32, min: 12, max: 48,
    label: '标题字号 (px)', bottomLabel: '标题字号，单位 px，默认 32',
    group: '纯文图片模式设置', order: 70
  },
  {
    key: 'imagePadding', type: 'number', default: 40, min: 0, max: 120,
    label: '全局内边距 (px)', bottomLabel: '控制图片四周的留白大小，默认 40px',
    group: '纯文图片模式设置', order: 80
  },
  {
    key: 'imageWidth', type: 'number', default: 800, min: 400, max: 2000,
    label: '图片宽度 (px)', bottomLabel: '布局基础宽度，默认 800px',
    group: '纯文图片模式设置', order: 90
  },
  {
    key: 'imageDeviceScale', type: 'number', default: 2, min: 1, max: 4,
    label: '渲染倍率', bottomLabel: '无头浏览器渲染偏差系数：1 = 正常，2 = 2x 清晰，默认 2',
    group: '纯文图片模式设置', order: 100
  },
  {
    key: 'imageTextLimit', type: 'number', default: 1000, min: 0, max: 10000,
    label: '文本数量限制', bottomLabel: '长文本超过此字数将自动分页渲染为多张图片（0为不限制）',
    group: '纯文图片模式设置', order: 110
  },

  // ============== 合并转发设置 ==============
  {
    key: 'forwardTitle', type: 'input', default: 'Lofter解析结果',
    label: '转发标题', bottomLabel: '合并转发模式下聊天列表中显示的外显标题',
    group: '合并转发设置', order: 10
  },
  {
    key: 'forwardNickname', type: 'input', default: '',
    label: '转发昵称', bottomLabel: '合并转发内部的发信人昵称（留空则默认使用 Bot 名称）',
    group: '合并转发设置', order: 20
  },

  // ============== 列表浏览设置 ==============
  {
    key: 'blogListPageSize', type: 'number', default: 10, min: 1, max: 20,
    label: '博主主页列表数量', bottomLabel: '博主主页列表每次显示的帖子数量',
    group: '列表浏览设置', order: 10
  },
  {
    key: 'tagListPageSize', type: 'number', default: 20, min: 1, max: 50,
    label: '标签页列表数量', bottomLabel: '标签页列表每次显示的帖子数量',
    group: '列表浏览设置', order: 20
  },
  {
    key: 'listCacheTTL', type: 'number', default: 600, min: 60, max: 3600,
    label: '列表缓存有效期', bottomLabel: '列表缓存有效期，单位：秒，用于 #lofter解析 序号',
    group: '列表浏览设置', order: 30
  },
  {
    key: 'sendBlogInfo', type: 'switch', default: true,
    label: '发送博主信息', bottomLabel: '是否发送博主主页的博主信息',
    group: '列表浏览设置', order: 40
  },
  {
    key: 'sendTagInfo', type: 'switch', default: true,
    label: '发送标签信息', bottomLabel: '是否发送标签页的标签信息',
    group: '列表浏览设置', order: 50
  },
  {
    key: 'tagDefaultSort', type: 'select', default: 'new',
    label: '标签默认排序', bottomLabel: '标签页默认排序方式',
    options: [
      { label: '最新', value: 'new' },
      { label: '热门', value: 'hot' }
    ],
    group: '列表浏览设置', order: 60
  },

  // ============== 每日一图设置 ==============
  {
    key: 'dailyImageEnabled', type: 'switch', default: false,
    label: '每日一图功能', bottomLabel: '开启后可在群聊中订阅标签，每天定时推送随机博文',
    group: '每日一图设置', order: 10
  },
  {
    key: 'dailyImagePushTime', type: 'input', default: '08:00',
    label: '每日推送时间', bottomLabel: '每日推送时间，格式 HH:mm（如 08:00）',
    group: '每日一图设置', order: 20
  },
  {
    key: 'dailyImageMaxSubscriptions', type: 'number', default: 50, min: 1, max: 500,
    label: '最大订阅数量', bottomLabel: '全局最大订阅数量限制',
    group: '每日一图设置', order: 30
  }
]

/**
 * 字段名索引（用于 O(1) 查找）
 * @type {Map<string, object>}
 */
export const LOFTER_FIELDS_BY_KEY = new Map(LOFTER_FIELDS.map(f => [f.key, f]))

/**
 * 字段短名集合（兼容原 schemas/index.js 逻辑）
 * @type {Set<string>}
 */
export const LOFTER_FIELD_KEYS = new Set(LOFTER_FIELDS.map(f => f.key))

/**
 * 默认配置对象（不含注释）
 * @returns {object}
 */
export function buildDefaultLofterConfig() {
  const cfg = {}
  for (const f of LOFTER_FIELDS) {
    cfg[f.key] = f.default
  }
  return cfg
}

/**
 * 字段分组（按 group 名字典序遍历）
 * @returns {Map<string, object[]>}
 */
export function groupFields() {
  const out = new Map()
  for (const f of LOFTER_FIELDS) {
    if (!out.has(f.group)) out.set(f.group, [])
    out.get(f.group).push(f)
  }
  for (const list of out.values()) list.sort((a, b) => a.order - b.order)
  return out
}
