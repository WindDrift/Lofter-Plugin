/**
 * @module lib/utils
 * @description 通用工具函数模块，提供日期格式化、文件名净化等跨模块复用的基础能力
 */

/**
 * Lofter 缩略图 URL 后缀（拼接在原图 URL 后）
 * 作用：基于 Lofter imageView 服务生成低画质缩略图，避免发送大图触发客户端/服务端崩溃。
 * @type {string}
 */
export const THUMBNAIL_TRANSFORM = '?imageView&thumbnail=750x0&quality=96&stripmeta=0&type=jpg&tostatic=1&enlarge=1'

/**
 * @typedef {object} ImageLink
 * @property {string} [orign]  原图 URL（首选）
 * @property {string} [raw]    原图 URL（备选）
 */

/**
 * @typedef {object} BloggerInfo
 * @property {string} nickname  博主昵称
 * @property {string} blogName  博客名（子域名前缀）
 * @property {string} blogId    博主 ID
 * @property {string} avatarUrl 头像 URL
 */

/**
 * @typedef {object} PostInfo
 * @property {string}        title        博文标题
 * @property {number}        publishTime  发布时间戳（毫秒）
 * @property {string}        postId       博文 ID
 * @property {string}        url          博文原始链接
 * @property {string}        digest       正文（HTML 原文）
 * @property {boolean}       hasImages    是否为图文博文
 * @property {ImageLink[]}   photoLinks   图片链接对象列表
 * @property {string[]}      tagList      标签列表
 */

/**
 * @typedef {object} InteractionInfo
 * @property {number} responseCount   回复数
 * @property {number} favoriteCount   点赞数
 * @property {number} shareCount      推荐数
 * @property {number} subscribeCount  收藏数
 * @property {number} hotCount        热度
 */

/**
 * @typedef {object} PostExtracted
 * @property {BloggerInfo}     blogger      博主信息
 * @property {PostInfo}        post         博文信息
 * @property {InteractionInfo} interaction  互动数据
 */

/**
 * @typedef {object} LofterConfig
 * @property {boolean} [autoParse]                     自动解析开关
 * @property {boolean} [smartIndent]                   智能首行缩进
 * @property {'forward'|'normal'} [sendMode]           发送模式
 * @property {'single'|'multi'|'image'} [pureTextSendMode]  纯文发送模式
 * @property {number} [timeout]                        请求超时（秒）
 * @property {boolean} [sendBloggerInfo]               发送博主信息
 * @property {boolean} [sendPostInfo]                  发送博文基础信息
 * @property {boolean} [sendTagLinks]                  发送标签链接
 * @property {boolean} [sendInteraction]               发送互动数据
 * @property {boolean} [sendPostTitle]                 发送正文标题
 * @property {boolean} [sendPostBody]                  发送正文
 * @property {boolean} [sendImages]                    发送图片本体
 * @property {boolean} [sendImageLinks]                发送原图链接
 * @property {boolean} [sendImageLimitTip]             发送图片大小限制全局提示
 * @property {boolean} [sendParseStats]                发送解析统计
 * @property {boolean} [tagLinks]                      旧配置：标签链接
 * @property {boolean} [sendOriginal]                  原图文件发送
 * @property {boolean} [sendFirstImage]                合并转发时单发首图
 * @property {boolean} [imageCountPrompt]              首图后数量提示
 * @property {boolean} [enableImageSizeLimit]          启用图片大小限制
 * @property {number}  [imageSizeLimit]                限制阈值（MB）
 * @property {boolean} [sendThumbnail]                 超限发送缩略图
 * @property {boolean} [enablePureTextImageFooterStats] 纯文图片页脚统计
 * @property {string}  [imageFont]                     图片模式字体
 * @property {string}  [imageBgColor]                  图片背景色
 * @property {string}  [imageFontColor]                正文字体色
 * @property {number}  [imageFontSize]                 正文字号
 * @property {number}  [imageLineHeight]               正文行高
 * @property {string}  [imageTitleColor]               标题颜色
 * @property {number}  [imageTitleSize]                标题字号
 * @property {number}  [imagePadding]                  内边距
 * @property {number}  [imageWidth]                    布局宽度
 * @property {number}  [imageDeviceScale]              渲染倍率
 * @property {number}  [imageTextLimit]                单图最大字数
 * @property {string}  [forwardTitle]                  合并转发标题
 * @property {string}  [forwardNickname]               合并转发昵称
 */

/**
 * 异步简易并发控制器（轻量级 p-limit 替代）
 * @template T
 * @param {number} concurrency 最大并发数（至少 1）
 * @param {(() => Promise<T>)[]} tasks 任务工厂列表（数组）
 * @returns {Promise<T[]>} 全部任务结果（顺序与输入一致）
 */
export async function runWithConcurrency(concurrency, tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return []
  const limit = Math.max(1, Math.min(concurrency, tasks.length))
  const results = new Array(tasks.length)
  let cursor = 0
  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= tasks.length) return
      try {
        results[idx] = await tasks[idx]()
      } catch (err) {
        results[idx] = { __error: err }
      }
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 简易指数退避睡眠
 * @param {number} ms 退避毫秒数
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 将时间戳格式化为日期字符串 (YYYY-MM-DD)
 * @param {number} timestamp - Unix 时间戳（毫秒）
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 将时间戳格式化为日期时间字符串 (YYYY-MM-DD HH:mm:ss)
 * @param {number} timestamp - Unix 时间戳（毫秒）
 * @returns {string} 格式化后的日期时间字符串
 */
export function formatDateTime(timestamp) {
  const date = new Date(timestamp)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}`
}

/**
 * 净化字符串使其可作为安全文件名，将操作系统不允许的特殊字符替换为下划线
 * @param {string} name - 原始字符串
 * @returns {string} 安全的文件名字符串
 */
export function sanitizeFileName(name) {
  if (!name) return 'unknown'
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * 移动端 User-Agent 常量，用于模拟移动端浏览器请求以提高 Lofter 页面的访问成功率
 * @type {string}
 */
export const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; OnePlus 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Edg/119.0.0.0'

/**
 * HTML 实体到纯文本的映射表（Lofter 常用全集）
 * @type {Readonly<Record<string, string>>}
 */
export const HTML_ENTITY_MAP = Object.freeze({
  '&times;': '×',
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&hellip;': '…',
  '&mdash;': '—',
  '&ndash;': '–',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201c',
  '&rdquo;': '\u201d',
  '&middot;': '·',
  '&bull;': '•',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&cent;': '¢',
  '&deg;': '°',
  '&para;': '¶',
  '&sect;': '§',
  '&laquo;': '«',
  '&raquo;': '»',
  '&iexcl;': '¡',
  '&iquest;': '¿'
})
