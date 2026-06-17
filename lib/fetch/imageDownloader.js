/**
 * @module lib/fetch/imageDownloader
 * @description 图片下载模块，负责将远程图片下载到本地临时目录
 *
 * 从 fetcher.js 拆分而来，将图片下载职责独立为单一模块。
 * 依赖方向：imageDownloader → fetcher(buildAuthHeaders) → tempFileManager，无循环依赖。
 */

import fetch from 'node-fetch'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { MOBILE_USER_AGENT } from '../core/utils.js'
import { buildAuthHeaders } from './fetcher.js'
import { cleanupFile } from './tempFileManager.js'

const streamPipeline = promisify(pipeline)

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
      Referer: referer,
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
    // 空文件无保留价值，立即清理避免占用临时目录
    await cleanupFile(filePath)
    throw new Error('文件下载失败（空文件）')
  }

  return { filePath, fileSize: stats.size }
}
