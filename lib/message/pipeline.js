/**
 * @module lib/pipeline
 * @description 博文解析流水线，提取 parseLofter 与 parseCachedListItem 共享的 Step 2-10 编排逻辑
 */

import { fetchPage, cleanupTempFiles, cleanupFile } from '../fetch/fetcher.js'
import { parsePageData, extractPostInfo, extractImageUrl } from '../parse/parser.js'
import { countTextUnits, processText } from '../render/textProcessor.js'
import { processImage, getTempDir } from '../render/imageHandler.js'
import { resolveFontConfig, renderTextAsImages, splitParagraphsByLimit } from '../render/imageRenderer.js'
import {
  buildBloggerMessage,
  buildPostInfoMessage,
  buildTagLinksMessage,
  buildInteractionMessage,
  buildImageOriginMessage,
  buildParseStatsMessage
} from './messageBuilder.js'
import { makeForwardMsg, sendImageNormal, recallMessage } from './sender.js'
import { formatDateTime, runWithConcurrency, sanitizeFileName } from '../core/utils.js'
import { categorizeError } from '../core/errors.js'

/** 图片并发下载数 */
const IMAGE_CONCURRENCY = 3

/**
 * 执行博文解析流水线（Step 2-10 + 错误处理 + 撤回）
 *
 * @param {object} e - Yunzai 消息事件对象
 * @param {object} options
 * @param {string} options.url - 博文链接
 * @param {object} options.config - 已规范化的配置对象
 * @param {function} options.recordParse - 解析计数回调 (e) => { today, group }
 * @param {function} options.onDeveloperMode - 开发者模式消息回调 (e) => Promise<void>
 * @returns {Promise<boolean>}
 */
export async function executeParsePipeline(e, { url, config, recordParse, onDeveloperMode }) {
  const startedAt = Date.now()
  let prepMsg = null

  try {
    // Step 2: 抓取并解析
    const postInfo = await stepFetchAndParse({ url, timeout: config.timeout || 30 })
    const { blogger, post, interaction } = postInfo
    const postWithTime = {
      ...post,
      publishDateTimeStr: formatDateTime(post.publishTime),
      inlineTags: config.sendTagLinks ? [] : post.tagList
    }

    // Step 3: 发送准备提示
    prepMsg = await stepSendPrepare(e, { post, url })

    // Step 4: 文本处理 + 统计
    const textCtx = stepProcessText({ post, config })

    // Step 5: 组装文本消息
    const textMessages = buildTextMessages({ blogger, post: postWithTime, interaction, paragraphs: textCtx.paragraphs, config })

    // Step 6: 纯文图片模式渲染
    const imageMode = await stepRenderImageMode({
      post, blogger, config, textCtx, textMessages
    })

    // Step 8: 图片下载与发送
    const msgList = [...textMessages]
    const imageResult = await stepHandleImages({ post, blogger, config, msgList, existingFirstImagePath: imageMode.firstImagePath })

    // Step 9: 大小限制提示
    if (config.sendImageLimitTip && imageResult.isImageSizeLimitTriggered) {
      const tipMsg = '要调整/关闭图片大小限制功能，请前往锅巴面板配置。'
      msgList.push(tipMsg)
    }

    const stats = {
      textCount: textCtx.totalTextCount,
      paragraphCount: textCtx.paragraphCount,
      imageCount: post.photoLinks.length
    }

    // Step 10: 发送结果
    if (config.sendMode === 'forward') {
      const counts = recordParse(e)
      if (config.sendParseStats) msgList.push(buildStatsMessage({ stats, counts, startedAt }))
      await stepSendForward({ e, msgList, post, blogger, config, imageResult })
      await onDeveloperMode(e)
    } else {
      for (const msg of msgList) await sendNormalMessage(e, msg, config, blogger)
      const counts = recordParse(e)
      if (config.sendParseStats) await e.reply(buildStatsMessage({ stats, counts, startedAt }))
      await cleanupImages(post, blogger)
      await onDeveloperMode(e)
    }

    return true
  } catch (err) {
    const { category, hint } = categorizeError(err)
    logger.error(`[Lofter解析] [${category}] ${err.message}`)
    try {
      await e.reply(hint)
    } catch (replyErr) {
      logger.error('[Lofter解析] 回复错误提示失败', replyErr)
    }
    return false
  } finally {
    await recallMessage(e, prepMsg)
  }
}

// ============== Pipeline Steps ==============

/** Step 2: 抓取并解析 */
async function stepFetchAndParse({ url, timeout }) {
  const html = await fetchPage(url, timeout)
  const dataObj = parsePageData(html)
  return extractPostInfo(dataObj, url)
}

/** Step 3: 发送准备提示 */
async function stepSendPrepare(e, { post, url }) {
  try {
    const msgType = post.hasImages ? '图文' : '纯文'
    return await e.reply(`收到${msgType} Lofter 链接 ${url}，准备解析...`)
  } catch (err) {
    logger.error('[Lofter解析] 发送准备消息失败', err)
    return null
  }
}

/** Step 4: 文本处理（HTML 清洗 + 智能缩进 + 统计） */
function stepProcessText({ post, config }) {
  const paragraphs = processText(post.digest, { smartIndent: config.smartIndent ?? true })
  const totalTextCount = paragraphs.reduce((sum, p) => sum + countTextUnits(p), 0)
  const paragraphCount = paragraphs.length
  const pureTextSendMode = config.pureTextSendMode || 'single'
  const expectedImageCount = !post.hasImages && pureTextSendMode === 'image'
    ? Math.max(splitParagraphsByLimit(paragraphs, config.imageTextLimit || 0).length, 1)
    : 0
  const enablePureTextImageFooterStats = config.enablePureTextImageFooterStats ?? true
  return {
    paragraphs, totalTextCount, paragraphCount,
    expectedImageCount, enablePureTextImageFooterStats
  }
}

/** Step 5: 组装文本消息 */
function buildTextMessages({ blogger, post, interaction, paragraphs, config }) {
  const messages = []
  if (config.sendBloggerInfo) messages.push(buildBloggerMessage(blogger))
  if (config.sendPostInfo) messages.push(buildPostInfoMessage(post))
  if (config.sendTagLinks && post.tagList && post.tagList.length > 0) {
    messages.push(buildTagLinksMessage(post.tagList))
  }
  if (config.sendInteraction) messages.push(buildInteractionMessage(interaction))
  if (config.sendPostTitle) messages.push(post.title)

  if (!config.sendPostBody) return messages

  const pureTextSendMode = config.pureTextSendMode || 'single'
  const hasImages = post.hasImages

  if (!hasImages && pureTextSendMode === 'image') {
    // 图片模式由 stepRenderImageMode 单独处理
  } else if (!hasImages && pureTextSendMode === 'multi' && config.sendMode === 'forward') {
    paragraphs.forEach(p => messages.push(p))
  } else {
    messages.push(paragraphs.join('\n\n'))
  }
  return messages
}

/** Step 6: 纯文图片模式渲染 */
async function stepRenderImageMode({ post, blogger, config, textCtx, textMessages }) {
  if (!config.sendPostBody || post.hasImages || (config.pureTextSendMode || 'single') !== 'image') {
    return { firstImagePath: null, isImageMode: false }
  }
  let firstImagePath = null
  try {
    const { localFontFile, fontFamilyCSS } = resolveFontConfig(config.imageFont || '')
    const imagePaths = await renderTextAsImages({
      title: post.title,
      nickname: blogger.nickname,
      publishTime: formatDateTime(post.publishTime),
      blogId: blogger.blogId,
      avatarUrl: blogger.avatarUrl,
      refererUrl: post.url,
      paragraphs: textCtx.paragraphs,
      totalTextCount: textCtx.totalTextCount,
      paragraphCount: textCtx.paragraphCount,
      enablePureTextImageFooterStats: textCtx.enablePureTextImageFooterStats,
      config,
      localFontFile,
      fontFamilyCSS
    })
    if (imagePaths && imagePaths.length > 0) {
      for (const imgPath of imagePaths) textMessages.push(segment.image(imgPath))
      firstImagePath = imagePaths[0]
    } else {
      textMessages.push(textCtx.paragraphs.join('\n\n'))
    }
  } catch (renderErr) {
    logger.error('[Lofter解析] 生成纯文本长图失败：', renderErr)
    textMessages.push(textCtx.paragraphs.join('\n\n'))
  }
  return { firstImagePath, isImageMode: true }
}

/** Step 8: 处理图片（并发下载） */
async function stepHandleImages({ post, blogger, config, msgList, existingFirstImagePath }) {
  const result = {
    firstImagePath: existingFirstImagePath || null,
    firstImageIsThumbnail: false,
    firstImageThumbnailMsg: null,
    successImageCount: 0,
    isImageSizeLimitTriggered: false
  }
  if (!post.hasImages) return result

  if (!config.sendImages) {
    if (config.sendImageLinks) appendImageLinkMessages(post, msgList)
    return result
  }

  const tempDir = getTempDir()
  const total = post.photoLinks.length

  const ctxFor = (i) => ({ blogger, post, config, tempDir, imageProtected: blogger.imageProtected })

  const tasks = post.photoLinks.map((link, i) => async () => processImage(link, i, total, ctxFor(i)))
  const settled = await runWithConcurrency(IMAGE_CONCURRENCY, tasks)

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (!r || r.__error || !r.success) {
      const name = r?.fileName || `图${i + 1}`
      const failMsg = r?.error || r?.reason || '下载失败（已重试）'
      msgList.push(`图片 ${name} ${failMsg}。`)
      continue
    }
    dispatchImageResult({ r, i, config, msgList, result })
  }

  // 作品保护时在图片消息前插入版权提示
  if (blogger.imageProtected && result.successImageCount > 0) {
    const firstImageIdx = msgList.findIndex(msg => msg?.type === 'lofter-image' || (Array.isArray(msg) && msg.some(m => m?.type === 'image')))
    if (firstImageIdx >= 0) {
      msgList.splice(firstImageIdx, 0, '该博主已开启作品保护，将不下载原图，请点击链接获取原图，请保留版权意识。')
    }
  }

  return result
}

/** 根据图片处理结果分支发送到 msgList */
function dispatchImageResult({ r, i, config, msgList, result }) {
  const originMsg = buildImageOriginMessage(i, r.imgUrl)
  if (r.isThumbnail) {
    result.isImageSizeLimitTriggered = true
    result.successImageCount++
    const suffix = config.sendImageLinks ? `\n${originMsg}${r.limitMsg}` : r.limitMsg
    const combined = [segment.image(r.thumbnailUrl), suffix]
    msgList.push(combined)
    if (!result.firstImagePath) {
      result.firstImagePath = r.thumbnailUrl
      result.firstImageIsThumbnail = true
      result.firstImageThumbnailMsg = suffix
    }
    return
  }
  if (r.isOversized) {
    result.isImageSizeLimitTriggered = true
    msgList.push(config.sendImageLinks ? `${originMsg}\n${r.oversizedMsg}` : r.oversizedMsg)
    return
  }
  // 正常
  result.successImageCount++
  msgList.push({ type: 'lofter-image', filePath: r.filePath, fileName: r.fileName, originMsg: config.sendImageLinks ? originMsg : '' })
  if (!result.firstImagePath) result.firstImagePath = r.filePath
}

function appendImageLinkMessages(post, msgList) {
  post.photoLinks.forEach((link, index) => {
    const imgUrl = extractImageUrl(link)
    if (imgUrl) msgList.push(buildImageOriginMessage(index, imgUrl))
  })
}

/** Step 10: 合并转发模式 */
async function stepSendForward({ e, msgList, post, blogger, config, imageResult }) {
  const forwardTitle = config.forwardTitle || 'Lofter解析结果'
  const forwardNickname = config.forwardNickname || ''
  try {
    const forwardMsg = await makeForwardMsg(e, msgList.map(msg => toForwardMessage(msg)), forwardTitle, forwardNickname)
    if (forwardMsg) {
      await e.reply(forwardMsg)
    } else {
      for (const msg of msgList) await e.reply(toReplyMessage(msg))
    }
    if (config.sendFirstImage) {
      await sendFirstImagePreview({ e, post, config, image: imageResult, blogger })
    }
  } catch (err) {
    logger.error('[Lofter解析] 发送合并转发失败:', err)
    await e.reply('发送合并转发失败，尝试普通发送。')
    for (const msg of msgList) await e.reply(toReplyMessage(msg))
  } finally {
    if (post.hasImages && post.photoLinks.length > 0) {
      const tempDir = getTempDir()
      await cleanupTempFiles(tempDir, sanitizeFileName(blogger.blogName))
    }
  }
}

/** 首图预览 */
async function sendFirstImagePreview({ e, post, config, image, blogger }) {
  if (blogger?.imageProtected) {
    await e.reply('该博主已开启作品保护，请点击合并转发查看')
    return
  }

  const showPrompt = config.imageCountPrompt ?? true
  const { firstImagePath, firstImageIsThumbnail, firstImageThumbnailMsg, successImageCount } = image

  if (firstImagePath) {
    try {
      const firstImageMsg = segment.image(firstImagePath)
      let suffixMsg = ''
      if (showPrompt && post.photoLinks.length >= 2) {
        suffixMsg += `\n还有${post.photoLinks.length - 1}张图片，请点击合并转发查看`
      }
      if (firstImageIsThumbnail && firstImageThumbnailMsg) {
        suffixMsg += firstImageThumbnailMsg
      }
      if (suffixMsg) await e.reply([firstImageMsg, suffixMsg])
      else await e.reply(firstImageMsg)
    } catch (err) {
      logger.error(`[Lofter解析] 发送首图失败: ${err.message}`)
    }
  } else if (showPrompt && post.photoLinks.length > 0 && successImageCount === 0) {
    const sizeLimitMB = config.imageSizeLimit ?? 8
    await e.reply(`解析成功${post.photoLinks.length}张图片，均超过设定的大小上限（${sizeLimitMB}MB），请点击合并转发查看具体链接。`)
  }
}

function toForwardMessage(msg) {
  if (msg?.type === 'lofter-image') {
    return msg.originMsg ? [segment.image(msg.filePath), `\n${msg.originMsg}`] : segment.image(msg.filePath)
  }
  return msg
}

function toReplyMessage(msg) {
  if (msg?.type === 'lofter-image') {
    return msg.originMsg ? [segment.image(msg.filePath), `\n${msg.originMsg}`] : segment.image(msg.filePath)
  }
  return msg
}

async function sendNormalMessage(e, msg, config, blogger) {
  if (msg?.type === 'lofter-image') {
    if (config.sendOriginal && !blogger?.imageProtected) {
      await sendImageNormal(e, msg.filePath, msg.fileName, config)
      if (msg.originMsg) await e.reply(msg.originMsg)
      await cleanupFile(msg.filePath)
      return
    }
    await e.reply(toReplyMessage(msg))
    await cleanupFile(msg.filePath)
  } else {
    await e.reply(toReplyMessage(msg))
  }
}

async function cleanupImages(post, blogger) {
  if (post.hasImages && post.photoLinks.length > 0) {
    const tempDir = getTempDir()
    await cleanupTempFiles(tempDir, sanitizeFileName(blogger.blogName))
  }
}

function buildStatsMessage({ stats, counts, startedAt }) {
  return buildParseStatsMessage({
    ...stats,
    elapsedSeconds: ((Date.now() - startedAt) / 1000).toFixed(3),
    todayCount: counts.today,
    groupCount: counts.group
  })
}
