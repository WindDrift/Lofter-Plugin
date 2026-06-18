/**
 * @module lib/utils
 * @description 通用工具函数模块，提供日期格式化、文件名净化等跨模块复用的基础能力
 *
 * 类型定义已迁移至 lib/types.js，此处保留 re-export 以兼容现有引用
 */

// Re-export 类型定义以保持向后兼容
/** @typedef {import('./types.js').ImageLink} ImageLink */
/** @typedef {import('./types.js').BloggerInfo} BloggerInfo */
/** @typedef {import('./types.js').PostInfo} PostInfo */
/** @typedef {import('./types.js').InteractionInfo} InteractionInfo */
/** @typedef {import('./types.js').PostExtracted} PostExtracted */
/** @typedef {import('./types.js').LofterConfig} LofterConfig */

/**
 * Lofter 缩略图 URL 后缀（拼接在原图 URL 后）
 * 作用：基于 Lofter imageView 服务生成低画质缩略图，避免发送大图触发客户端/服务端崩溃。
 * @type {string}
 */
export const THUMBNAIL_TRANSFORM = '?imageView&thumbnail=750x0&quality=96&stripmeta=0&type=jpg&tostatic=1&enlarge=1'

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
 * 将十进制 postId 转换为 Lofter permalink 片段（十六进制小写）
 * @param {number|string} postId - 博文 ID
 * @returns {string} permalink 片段
 */
export function postIdToPermalink(postId) {
  const num = Number(postId)
  if (!Number.isFinite(num) || num <= 0) return String(postId || '')
  return num.toString(16).toLowerCase()
}

/**
 * 移动端 User-Agent 常量，用于模拟移动端浏览器请求以提高 Lofter 页面的访问成功率
 * @type {string}
 */
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 12; OnePlus 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Edg/119.0.0.0'

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
