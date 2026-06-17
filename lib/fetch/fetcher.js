/**
 * @module lib/fetcher
 * @description HTTP 请求模块，封装对 Lofter 页面与移动端 API 的抓取逻辑
 *
 * 职责拆分（M-07/F-01/F-05/P-07）：
 *  - 本模块仅负责 HTTP 请求（fetchPage / fetchTagPageByAPI / buildAuthHeaders）
 *  - 图片下载已迁移至 lib/fetch/imageDownloader.js
 *  - 临时文件清理已迁移至 lib/fetch/tempFileManager.js（此处 re-export 保持向后兼容）
 *  - fetchPage 支持指数退避重试 + URL 级 HTML 内存缓存（TTL）
 */

import fetch from 'node-fetch'
import { MOBILE_USER_AGENT, sleep } from '../core/utils.js'
import { TtlCache } from './cache.js'

// 向后兼容：临时文件清理函数已迁移至 tempFileManager.js
export { cleanupTempFiles, cleanupFile } from './tempFileManager.js'

/** fetchPage 重试最大次数（不含首次） */
const FETCH_MAX_RETRIES = 2

/** fetchPage 重试基础退避毫秒 */
const FETCH_BASE_BACKOFF_MS = 800

/** HTML 内存缓存：基于 TtlCache，TTL 5 分钟，上限 200 条 */
const htmlCache = new TtlCache({ maxSize: 200, defaultTtl: 300 })

/**
 * 构建 Lofter 登录认证头
 * @param {LofterConfig} [config]
 * @returns {object}
 */
export function buildAuthHeaders(config) {
  const key = String(config?.lofterLoginKey || '').trim()
  const auth = String(config?.lofterLoginAuth || '').trim()
  if (config?.lofterLoginEnabled === true && key && auth) {
    return { Cookie: `${key}=${auth}` }
  }
  return {}
}

/**
 * 抓取 Lofter 博文页面并返回原始 HTML 文本（带重试 + 内存缓存）
 * @param {string} url - Lofter 博文链接
 * @param {number} [timeout=30] - 请求超时时间（秒）
 * @param {LofterConfig} [config] - Lofter 配置
 * @returns {Promise<string>} 页面 HTML 内容
 * @throws {Error} 当请求失败或响应状态码非 2xx 时抛出异常
 */
export async function fetchPage(url, timeout = 30, config = {}) {
  const authHeaders = buildAuthHeaders(config)
  const cacheKey = authHeaders.Cookie ? `${url}#auth` : url
  const cached = htmlCache.get(cacheKey)
  if (cached !== null) return cached

  let lastError = null
  for (let attempt = 0; attempt <= FETCH_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        timeout: timeout * 1000,
        headers: {
          'User-Agent': MOBILE_USER_AGENT,
          ...authHeaders
        }
      })

      if (!response.ok) {
        throw new Error(`请求失败: HTTP ${response.status}`)
      }

      const html = await response.text()
      htmlCache.set(cacheKey, html)
      return html
    } catch (err) {
      lastError = err
      logger.debug?.(`[Lofter解析] fetchPage 第 ${attempt + 1} 次失败: ${err.message}`)
      if (attempt < FETCH_MAX_RETRIES) {
        await sleep(FETCH_BASE_BACKOFF_MS * Math.pow(2, attempt))
      }
    }
  }
  throw new Error(`fetchPage 失败，已重试 ${FETCH_MAX_RETRIES} 次: ${lastError?.message || 'unknown'}`)
}

/** 移动端 API User-Agent */
const PHONE_UA = 'LOFTER-Android 7.9.7.2 (PCT-AL10; Android 10; null) MOBILE'

/**
 * 通过移动端 API 获取标签页数据
 * 参考 lofterSpider/l15_phone_tag.py 实现
 * @param {string} tagName - 标签名（原始中文标签名）
 * @param {string} sort - 排序方式 (new/hot/month/week/date/total)
 * @param {number} offset - 分页偏移量，默认 0
 * @param {LofterConfig} config - 配置对象
 * @returns {Promise<object>} API JSON 响应
 */
export async function fetchTagPageByAPI(tagName, sort = 'new', offset = 0, config = {}) {
  // 先请求 newTag.api 获取 NTESwebSI cookie
  const authHeaders = buildAuthHeaders(config)
  const ntesRes = await fetch('https://api.lofter.com/v1.1/newTag.api', {
    method: 'POST',
    headers: {
      'User-Agent': PHONE_UA,
      Host: 'api.lofter.com',
      'Accept-Encoding': 'gzip',
      Connection: 'Keep-Alive',
      ...authHeaders
    }
  })

  // 收集 set-cookie
  let allCookies = authHeaders.Cookie || ''
  const ntesSetCookies = ntesRes.headers.raw()['set-cookie'] || []
  for (const sc of ntesSetCookies) {
    allCookies += (allCookies ? '; ' : '') + sc.split(';')[0]
  }

  // 请求标签数据
  const data = new URLSearchParams({
    product: 'lofter-android-7.9.7.2',
    postTypes: '',
    offset: String(offset),
    postYm: '',
    recentDay: '0',
    protectedFlag: '0',
    range: '0',
    firstpermalink: 'null',
    style: '0',
    tag: tagName,
    type: sort
  })

  const tagRes = await fetch('https://api.lofter.com/newapi/tagPosts.json', {
    method: 'POST',
    headers: {
      'User-Agent': PHONE_UA,
      Host: 'api.lofter.com',
      'Accept-Encoding': 'gzip',
      Connection: 'Keep-Alive',
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      ...(allCookies ? { Cookie: allCookies } : {})
    },
    body: data.toString()
  })

  if (!tagRes.ok) {
    throw new Error(`标签 API 请求失败: HTTP ${tagRes.status}`)
  }

  const json = await tagRes.json()
  if (!json.data || !json.data.list) {
    throw new Error('标签 API 返回数据格式异常')
  }

  return json.data
}
