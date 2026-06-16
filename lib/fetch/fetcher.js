/**
 * @module lib/fetcher
 * @description HTTP 请求模块，封装对 Lofter 页面的抓取与图片下载逻辑
 * 增强点（M-07/F-01/F-05/P-07）：
 *  - 静默 catch 改为 logger.debug 留痕
 *  - fetchPage 支持指数退避重试
 *  - 临时文件清理改异步实现
 *  - URL 级 HTML 内存缓存（TTL）
 */

import fetch from 'node-fetch'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { MOBILE_USER_AGENT, sleep } from '../core/utils.js'
import { TtlCache } from './cache.js'

const streamPipeline = promisify(pipeline)

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

/**
 * 下载图片到本地临时目录
 * @param {string} imgUrl - 图片原始 URL
 * @param {string} referer - HTTP Referer 头（通常为博文页面 URL）
 * @param {object} options - 下载选项
 * @param {string} options.tempDir - 临时文件存放目录
 * @param {string} options.fileName - 保存的文件名
 * @param {LofterConfig} [options.config] - Lofter 配置
 * @returns {Promise<{filePath: string, fileSize: number}>} 下载结果
 * @throws {Error} 当下载失败、文件不存在或文件为空时抛出异常
 */
export async function downloadImage(imgUrl, referer, { tempDir, fileName, config }) {
  if (!fs.existsSync(tempDir)) {
    await fsp.mkdir(tempDir, { recursive: true })
  }

  const filePath = path.join(tempDir, fileName)
  const authHeaders = buildAuthHeaders(config)

  const imgRes = await fetch(imgUrl, {
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      'Referer': referer,
      ...authHeaders
    }
  })

  if (!imgRes.ok) {
    throw new Error(`图片下载失败: HTTP ${imgRes.status}`)
  }

  await streamPipeline(imgRes.body, fs.createWriteStream(filePath))

  // 校验下载结果：文件必须存在且大小不为 0
  if (!fs.existsSync(filePath)) {
    throw new Error('文件下载失败（文件未找到）')
  }

  const stats = fs.statSync(filePath)
  if (stats.size === 0) {
    await cleanupFile(filePath)
    throw new Error('文件下载失败（空文件）')
  }

  return { filePath, fileSize: stats.size }
}

/**
 * 异步删除指定临时目录下以指定前缀开头的所有文件
 * @param {string} tempDir - 临时目录路径
 * @param {string} prefix - 文件名前缀
 * @returns {Promise<number>} 成功删除的文件数
 */
export async function cleanupTempFiles(tempDir, prefix) {
  try {
    if (!fs.existsSync(tempDir)) return 0
    const files = await fsp.readdir(tempDir)
    const targets = files.filter(f => f.startsWith(prefix))
    await Promise.all(targets.map(f =>
      fsp.unlink(path.join(tempDir, f)).catch(err => {
        logger.debug?.(`[Lofter解析] 删除临时文件失败: ${f}`, err)
      })
    ))
    return targets.length
  } catch (err) {
    logger.debug?.(`[Lofter解析] cleanupTempFiles 失败: ${tempDir}`, err)
    return 0
  }
}

/**
 * 异步删除单个临时文件
 * @param {string} filePath - 待删除的文件完整路径
 * @returns {Promise<boolean>} 是否成功
 */
export async function cleanupFile(filePath) {
  try {
    await fsp.unlink(filePath)
    return true
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      logger.debug?.(`[Lofter解析] cleanupFile 失败: ${filePath}`, err)
    }
    return false
  }
}
