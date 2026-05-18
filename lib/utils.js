/**
 * @module lib/utils
 * @description 通用工具函数模块，提供日期格式化、文件名净化等跨模块复用的基础能力
 */

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
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * 移动端 User-Agent 常量，用于模拟移动端浏览器请求以提高 Lofter 页面的访问成功率
 */
export const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; OnePlus 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Edg/119.0.0.0'
