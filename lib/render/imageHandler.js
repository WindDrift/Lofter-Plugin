/**
 * @module lib/imageHandler
 * @description 图片处理模块，负责图片下载、大小限制检查、缩略图生成本地化等逻辑
 *
 * 增强点（M-08 / F-02 / R-04 / P-06）：
 *  - 拆分为纯函数 `downloadOnce` + 业务编排 `downloadWithRetry`
 *  - 单图下载失败时自动重试 1 次
 *  - 缩略图改为本地下载后返回 filePath（由调用方发送）
 *  - 缩略图 URL 后缀改为引用 utils.THUMBNAIL_TRANSFORM
 */

import path from 'node:path'
import { downloadImage } from '../fetch/imageDownloader.js'
import { extractImageUrl, extractImageExt } from '../parse/parser.js'
import { formatDate, sanitizeFileName, THUMBNAIL_TRANSFORM, sleep } from '../core/utils.js'

/** 单图下载最大重试次数 */
const IMAGE_MAX_RETRIES = 1

/** 重试基础退避毫秒 */
const IMAGE_RETRY_BACKOFF_MS = 500

/**
 * 构建图片的本地保存文件名
 * @param {string} blogName - 博主名称
 * @param {number} publishTime - 发布时间戳
 * @param {number} index - 图片序号（从 0 开始）
 * @param {number} totalCount - 图片总数
 * @param {string} imgUrl - 图片 URL（用于提取扩展名）
 * @returns {string} 安全的文件名字符串
 */
export function buildImageFileName(blogName, publishTime, index, totalCount, imgUrl) {
  const safeBlogName = sanitizeFileName(blogName)
  const dateStr = formatDate(publishTime)
  const ext = extractImageExt(imgUrl)

  let fileName = `${safeBlogName}-${dateStr}`
  if (totalCount > 1) {
    fileName += `-${index + 1}`
  }
  fileName += `.${ext}`

  return fileName
}

/**
 * 纯函数：从 photoLink 中提取 URL 并构建文件名
 * @param {ImageLink} photoLink
 * @param {number} index
 * @param {number} totalCount
 * @param {object} context
 * @returns {{imgUrl: string, fileName: string, filePath: string} | null} 提取失败时返回 null
 */
export function resolveImageTarget(photoLink, index, totalCount, context) {
  const { blogger, post, tempDir } = context
  const imgUrl = extractImageUrl(photoLink)
  if (!imgUrl) return null

  // 作品保护时使用缩略图下载，但保留原始 URL 用于显示
  const downloadUrl = context.imageProtected ? `${imgUrl}${THUMBNAIL_TRANSFORM}` : imgUrl

  const fileName = buildImageFileName(blogger.blogName, post.publishTime, index, totalCount, imgUrl)
  return { imgUrl, downloadUrl, fileName, filePath: path.join(tempDir, fileName) }
}

/**
 * 纯函数：根据文件大小与配置决定走正常 / 缩略图 / 仅链接分支（F-02）
 * @param {string} imgUrl - 原图 URL
 * @param {number} index - 图片序号
 * @param {number} fileSizeMB - 实际大小（MB）
 * @param {LofterConfig} config
 * @returns {object} 分支结果
 */
export function classifyBySize(imgUrl, index, fileSizeMB, config) {
  const enableLimit = config.enableImageSizeLimit ?? true
  const sizeLimitMB = config.imageSizeLimit ?? 8

  if (enableLimit && fileSizeMB > sizeLimitMB) {
    const sendThumbnail = config.sendThumbnail ?? true
    if (sendThumbnail) {
      return {
        branch: 'thumbnail',
        thumbnailUrl: `${imgUrl}${THUMBNAIL_TRANSFORM}`,
        limitMsg: `\n图${index + 1}超过设定限制(${sizeLimitMB}MB)，该图片并非原图，请点击上方链接获取原图。`,
        fileSizeMB
      }
    }
    return {
      branch: 'oversized',
      oversizedMsg: `图${index + 1}大小(${fileSizeMB}MB)超过设定限制(${sizeLimitMB}MB)，请点击链接获取图片：${imgUrl}`,
      fileSizeMB
    }
  }
  return { branch: 'normal' }
}

/**
 * 处理单张图片的下载与大小限制检查（业务编排：含 1 次重试 + 缩略图本地化）
 * @param {ImageLink} photoLink
 * @param {number} index
 * @param {number} totalCount
 * @param {object} context {blogger, post, config, tempDir}
 * @returns {Promise<object>} 处理结果
 */
export async function processImage(photoLink, index, totalCount, context) {
  const target = resolveImageTarget(photoLink, index, totalCount, context)
  if (!target) {
    return { success: false, reason: 'no_url', fileName: null }
  }
  const { imgUrl, downloadUrl, fileName } = target
  const { config, post } = context

  // 下载 + 1 次重试（F-02）
  const downloadResult = await downloadWithRetry(downloadUrl, post.url, { tempDir: context.tempDir, fileName, config })
  if (!downloadResult) {
    return { success: false, reason: 'download_failed', fileName, error: '下载失败（已重试）' }
  }

  const { filePath: actualPath, fileSize } = downloadResult
  const fileSizeMB = Number((fileSize / 1024 / 1024).toFixed(2))
  logger.info?.(`[Lofter解析] 图片下载成功: ${actualPath}, 大小: ${fileSize} bytes`)

  // 大小分支判定
  const cls = classifyBySize(imgUrl, index, fileSizeMB, config)
  if (cls.branch === 'thumbnail') {
    // 缩略图改为本地下载（P-06）
    const localThumb = await downloadThumbnailLocally(cls.thumbnailUrl, context.tempDir, fileName, config)
    return {
      success: true,
      isThumbnail: true,
      imgUrl,
      thumbnailUrl: localThumb || cls.thumbnailUrl, // 失败则回退 URL 形式
      limitMsg: cls.limitMsg,
      fileSizeMB,
      fileName,
      index
    }
  }
  if (cls.branch === 'oversized') {
    return {
      success: true,
      isOversized: true,
      imgUrl,
      oversizedMsg: cls.oversizedMsg,
      fileName,
      filePath: actualPath,
      index
    }
  }
  return {
    success: true,
    imgUrl,
    filePath: actualPath,
    fileName,
    fileSizeMB,
    isThumbnail: false
  }
}

/**
 * 内部：下载 + 重试封装（F-02）
 * @param {string} imgUrl
 * @param {string} referer
 * @param {object} opts
 * @returns {Promise<{filePath: string, fileSize: number}|null>}
 */
async function downloadWithRetry(imgUrl, referer, opts) {
  let lastError = null
  for (let attempt = 0; attempt <= IMAGE_MAX_RETRIES; attempt++) {
    try {
      return await downloadImage(imgUrl, referer, opts)
    } catch (err) {
      lastError = err
      logger.debug?.(`[Lofter解析] 下载图片第 ${attempt + 1} 次失败: ${imgUrl}`, err)
      if (attempt < IMAGE_MAX_RETRIES) {
        await sleep(IMAGE_RETRY_BACKOFF_MS)
      }
    }
  }
  logger.error?.(`[Lofter解析] 下载图片失败，已重试 ${IMAGE_MAX_RETRIES} 次: ${imgUrl}`, lastError)
  return null
}

/**
 * 内部：缩略图本地化下载（P-06）
 * 失败时返回 null，调用方可回退到 URL 形式
 * @param {string} thumbnailUrl
 * @param {string} tempDir
 * @param {string} originFileName 原图文件名
 * @param {LofterConfig} [_config] 预留配置参数（当前缩略图下载不使用认证头）
 * @returns {Promise<string|null>} 本地缩略图路径
 */
async function downloadThumbnailLocally(thumbnailUrl, tempDir, originFileName, _config) {
  try {
    const thumbName = originFileName.replace(/\.(\w+)$/, '_thumb.$1')
    const result = await downloadImage(thumbnailUrl, '', { tempDir, fileName: thumbName })
    return result.filePath
  } catch (err) {
    logger.debug?.(`[Lofter解析] 缩略图本地化失败，回退 URL 形式: ${thumbnailUrl}`, err)
    return null
  }
}

/**
 * 获取临时目录路径
 * @returns {string} 临时目录的绝对路径
 */
export function getTempDir() {
  return path.join(process.cwd(), 'temp', 'lofter')
}
