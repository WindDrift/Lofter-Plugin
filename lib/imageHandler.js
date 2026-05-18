/**
 * @module lib/imageHandler
 * @description 图片处理模块，负责图片下载、大小限制检查、缩略图生成等逻辑
 */

import path from 'node:path'
import fs from 'node:fs'
import { downloadImage, cleanupFile } from './fetcher.js'
import { extractImageUrl, extractImageExt } from './parser.js'
import { formatDate, sanitizeFileName } from './utils.js'

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
 * 处理单张图片的下载与大小限制检查
 * @param {object} photoLink - 图片链接对象
 * @param {number} index - 图片序号
 * @param {number} totalCount - 图片总数
 * @param {object} context - 上下文信息
 * @param {object} context.blogger - 博主信息
 * @param {object} context.post - 博文信息
 * @param {object} context.config - 插件配置
 * @param {string} context.tempDir - 临时目录
 * @returns {Promise<object>} 处理结果对象
 */
export async function processImage(photoLink, index, totalCount, context) {
  const { blogger, post, config, tempDir } = context
  const imgUrl = extractImageUrl(photoLink)

  if (!imgUrl) {
    return { success: false, reason: 'no_url' }
  }

  const fileName = buildImageFileName(blogger.blogName, post.publishTime, index, totalCount, imgUrl)
  const filePath = path.join(tempDir, fileName)

  try {
    const result = await downloadImage(imgUrl, post.url, { tempDir, fileName })
    logger.info(`[Lofter解析] 图片下载成功: ${result.filePath}, 大小: ${result.fileSize} bytes`)

    // 检查图片大小限制
    const enableLimit = config.enableImageSizeLimit ?? true
    const sizeLimitMB = config.imageSizeLimit ?? 8
    const fileSizeMB = Number((result.fileSize / 1024 / 1024).toFixed(2))

    if (enableLimit && fileSizeMB > sizeLimitMB) {
      return handleOversizedImage(imgUrl, index, fileSizeMB, sizeLimitMB, config)
    }

    return {
      success: true,
      filePath: result.filePath,
      fileName,
      fileSizeMB,
      isThumbnail: false
    }
  } catch (err) {
    logger.error(`[Lofter解析] 下载图片失败: ${imgUrl}`, err)
    return {
      success: false,
      reason: 'download_failed',
      fileName,
      error: err.message
    }
  }
}

/**
 * 处理超出大小限制的图片：根据配置决定发送缩略图或仅发送链接
 * @param {string} imgUrl - 原图 URL
 * @param {number} index - 图片序号
 * @param {number} fileSizeMB - 实际文件大小（MB）
 * @param {number} sizeLimitMB - 大小限制阈值（MB）
 * @param {object} config - 插件配置
 * @returns {object} 处理结果
 */
function handleOversizedImage(imgUrl, index, fileSizeMB, sizeLimitMB, config) {
  const sendThumbnail = config.sendThumbnail ?? true

  if (sendThumbnail) {
    const thumbnailUrl = `${imgUrl}?imageView&thumbnail=750x0&quality=96&stripmeta=0&type=jpg&tostatic=1&enlarge=1`
    const limitMsg = `\n图${index + 1}超过设定限制(${sizeLimitMB}MB)，该图片并非原图，请点击上方链接获取原图。`

    return {
      success: true,
      isThumbnail: true,
      thumbnailUrl,
      limitMsg,
      fileSizeMB,
      index
    }
  }

  return {
    success: true,
    isThumbnail: false,
    isOversized: true,
    oversizedMsg: `图${index + 1}大小(${fileSizeMB}MB)超过设定限制(${sizeLimitMB}MB)，请点击链接获取图片：${imgUrl}`,
    index
  }
}

/**
 * 获取临时目录路径
 * @returns {string} 临时目录的绝对路径
 */
export function getTempDir() {
  return path.join(process.cwd(), 'temp', 'lofter')
}
