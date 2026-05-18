/**
 * @module lib/fetcher
 * @description HTTP 请求模块，封装对 Lofter 页面的抓取与图片下载逻辑
 */

import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { MOBILE_USER_AGENT } from './utils.js'

const streamPipeline = promisify(pipeline)

/**
 * 抓取 Lofter 博文页面并返回原始 HTML 文本
 * @param {string} url - Lofter 博文链接
 * @param {number} [timeout=30] - 请求超时时间（秒）
 * @returns {Promise<string>} 页面 HTML 内容
 * @throws {Error} 当请求失败或响应状态码非 2xx 时抛出异常
 */
export async function fetchPage(url, timeout = 30) {
  const response = await fetch(url, {
    method: 'GET',
    timeout: timeout * 1000,
    headers: {
      'User-Agent': MOBILE_USER_AGENT
    }
  })

  if (!response.ok) {
    throw new Error(`请求失败: HTTP ${response.status}`)
  }

  return response.text()
}

/**
 * 下载图片到本地临时目录
 * @param {string} imgUrl - 图片原始 URL
 * @param {string} referer - HTTP Referer 头（通常为博文页面 URL）
 * @param {object} options - 下载选项
 * @param {string} options.tempDir - 临时文件存放目录
 * @param {string} options.fileName - 保存的文件名
 * @returns {Promise<{filePath: string, fileSize: number}>} 下载结果，包含文件路径与文件大小
 * @throws {Error} 当下载失败、文件不存在或文件为空时抛出异常
 */
export async function downloadImage(imgUrl, referer, { tempDir, fileName }) {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const filePath = path.join(tempDir, fileName)

  const imgRes = await fetch(imgUrl, {
    headers: {
      'User-Agent': MOBILE_USER_AGENT,
      'Referer': referer
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
    fs.unlinkSync(filePath)
    throw new Error('文件下载失败（空文件）')
  }

  return { filePath, fileSize: stats.size }
}

/**
 * 删除指定临时目录下以指定前缀开头的所有文件
 * @param {string} tempDir - 临时目录路径
 * @param {string} prefix - 文件名前缀
 */
export function cleanupTempFiles(tempDir, prefix) {
  if (!fs.existsSync(tempDir)) return

  fs.readdirSync(tempDir).forEach(file => {
    if (file.startsWith(prefix)) {
      try {
        fs.unlinkSync(path.join(tempDir, file))
      } catch (e) {
        // 静默忽略清理失败，不影响主流程
      }
    }
  })
}

/**
 * 删除单个临时文件
 * @param {string} filePath - 待删除的文件完整路径
 */
export function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (e) {
    // 静默忽略
  }
}
