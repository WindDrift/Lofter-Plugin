/**
 * @module apps/lofter
 * @description Lofter 链接解析插件主入口
 *
 * 本模块作为薄层调度器，负责：
 * 1. 注册消息匹配规则
 * 2. 协调各子模块完成页面抓取、数据解析、文本处理、图片下载、消息组装与发送
 *
 * 具体业务逻辑已拆分至 lib/ 目录下的各子模块：
 * - lib/fetcher.js      — HTTP 请求与文件下载
 * - lib/parser.js       — HTML/JSON 数据解析
 * - lib/textProcessor.js — 文本清洗与智能缩进
 * - lib/imageHandler.js  — 图片下载与大小限制
 * - lib/imageRenderer.js — Puppeteer 长图渲染
 * - lib/messageBuilder.js — 消息组装与发送
 * - lib/utils.js         — 通用工具函数
 */

import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import { fetchPage, cleanupTempFiles, cleanupFile } from '../lib/fetcher.js'
import { parsePageData, extractPostInfo } from '../lib/parser.js'
import { countTextUnits, processText } from '../lib/textProcessor.js'
import { processImage, getTempDir } from '../lib/imageHandler.js'
import { resolveFontConfig, renderTextAsImages, splitParagraphsByLimit } from '../lib/imageRenderer.js'
import {
  buildBloggerMessage,
  buildPostInfoMessage,
  buildTagLinksMessage,
  buildInteractionMessage,
  buildImageLinksMessage,
  makeForwardMsg,
  sendImageNormal,
  recallMessage
} from '../lib/messageBuilder.js'
import { formatDateTime, sanitizeFileName } from '../lib/utils.js'

/** Lofter 博文链接正则表达式 */
const LOFTER_URL_REGEX = /(https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+)/i

export class LofterPlugin extends plugin {
  constructor() {
    super({
      name: 'Lofter解析',
      dsc: '解析Lofter链接并发送图文',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: 'https?:\\/\\/[a-zA-Z0-9-]+\\.lofter\\.com\\/post\\/[a-zA-Z0-9_]+',
          fnc: 'parseLofter'
        }
      ]
    })
  }

  /**
   * 主处理函数：检测到 Lofter 链接后触发完整的解析与发送流程
   * @param {object} e - 云崽消息事件对象
   * @returns {Promise<boolean>} 是否成功处理
   */
  async parseLofter(e) {
    const config = new Config().getDefSet('lofter')
    if (!config.autoParse) return false

    // 步骤 1：从消息中提取 Lofter 链接
    const urlMatch = e.msg.match(LOFTER_URL_REGEX)
    if (!urlMatch) return false

    const url = urlMatch[1]
    logger.info(`[Lofter解析] 检测到链接: ${url}`)

    let prepMsg = null

    try {
      // 步骤 2：抓取页面并解析数据
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const postInfo = extractPostInfo(dataObj, url)

      const { blogger, post, interaction } = postInfo
      const publishDateTimeStr = formatDateTime(post.publishTime)

      // 步骤 3：发送准备解析的提示消息
      try {
        const msgType = post.hasImages ? '图文' : '纯文'
        prepMsg = await e.reply(`收到${msgType} Lofter 链接 ${url}，准备解析...`)
      } catch (err) {
        logger.error('[Lofter解析] 发送准备消息失败', err)
      }

      // 步骤 4：文本处理（HTML 清洗 + 智能缩进）
      const paragraphs = processText(post.digest, {
        smartIndent: config.smartIndent ?? true
      })
      const totalTextCount = paragraphs.reduce((sum, paragraph) => sum + countTextUnits(paragraph), 0)
      const paragraphCount = paragraphs.length
      const pureTextSendMode = config.pureTextSendMode || 'single'
      const expectedImageCount = !post.hasImages && pureTextSendMode === 'image'
        ? Math.max(splitParagraphsByLimit(paragraphs, config.imageTextLimit || 0).length, 1)
        : 0

      const enablePureTextStatPrompt = config.enablePureTextStatPrompt ?? true
      const enablePureTextImageFooterStats = config.enablePureTextImageFooterStats ?? true
      const summaryMessage = expectedImageCount > 0
        ? `本博文共${totalTextCount}字，${paragraphCount}自然段。预计生成${expectedImageCount}张图片...`
        : `本博文共${totalTextCount}字，${paragraphCount}自然段。`

      // 步骤 5：组装文本消息
      const textMessages = this.buildTextMessages(
        blogger, { ...post, publishDateTimeStr }, interaction, paragraphs, config
      )

      // 步骤 6：处理纯文本图片模式渲染
      const imageModeResult = await this.handlePureTextImageMode(
        post, blogger, paragraphs, config, textMessages, summaryMessage,
        enablePureTextStatPrompt, enablePureTextImageFooterStats
      )

      if (!imageModeResult.isImageMode && enablePureTextStatPrompt) {
        textMessages.unshift(summaryMessage)
      }

      // 步骤 7：非合并转发模式下，先发送文本消息
      if (config.sendMode !== 'forward') {
        for (const msg of textMessages) {
          await e.reply(msg)
        }
      }

      // 步骤 8：处理图片下载与发送
      const msgList = [...textMessages]
      const imageResult = await this.handleImages(
        e, post, blogger, config, msgList,
        imageModeResult.firstImagePath
      )

      // 步骤 9：发送大小限制提示
      if (imageResult.isImageSizeLimitTriggered) {
        const tipMsg = '要调整/关闭图片大小限制功能，请前往锅巴面板配置。'
        if (config.sendMode === 'forward') {
          msgList.push(tipMsg)
        } else {
          await e.reply(tipMsg)
        }
      }

      // 步骤 10：合并转发模式发送
      if (config.sendMode === 'forward') {
        await this.sendForwardMode(
          e, msgList, post, config,
          imageResult.firstImagePath,
          imageResult.firstImageIsThumbnail,
          imageResult.firstImageThumbnailMsg,
          imageResult.successImageCount
        )
      }
    } catch (err) {
      logger.error('[Lofter解析] 发生错误', err)
      await e.reply('Lofter解析时发生错误。')
    }

    // 步骤 11：撤回准备消息
    await recallMessage(e, prepMsg)

    return true
  }

  /**
   * 组装所有文本类消息（博主信息、博文信息、标签、正文、互动数据、原图链接）
   * @param {object} blogger - 博主信息
   * @param {object} post - 博文信息（含 publishDateTimeStr）
   * @param {object} interaction - 互动数据
   * @param {string[]} paragraphs - 处理后的段落列表
   * @param {object} config - 插件配置
   * @returns {Array} 消息内容数组
   */
  buildTextMessages(blogger, post, interaction, paragraphs, config) {
    const messages = []

    // 博主信息
    messages.push(buildBloggerMessage(blogger))

    // 博文基础信息
    messages.push(buildPostInfoMessage(post))

    // 标签链接（如果开启）
    if (config.tagLinks && post.tagList && post.tagList.length > 0) {
      messages.push(buildTagLinksMessage(post.tagList))
    }

    // 正文内容（根据发送模式决定格式）
    const pureTextSendMode = config.pureTextSendMode || 'single'
    const hasImages = post.hasImages

    if (!hasImages && pureTextSendMode === 'image') {
      // 图片模式由 handlePureTextImageMode 单独处理，此处不添加文本
    } else if (!hasImages && pureTextSendMode === 'multi' && config.sendMode === 'forward') {
      messages.push(post.title)
      paragraphs.forEach(p => messages.push(p))
    } else {
      const digestToSend = paragraphs.join('\n\n')
      messages.push(`${post.title}\n\n${digestToSend}`)
    }

    // 互动数据
    messages.push(buildInteractionMessage(interaction))

    // 原图链接
    if (hasImages) {
      messages.push(buildImageLinksMessage(post.photoLinks))
    }

    return messages
  }

  /**
   * 处理纯文本博文的图片模式渲染
   * @param {object} post - 博文信息
   * @param {object} blogger - 博主信息
   * @param {string[]} paragraphs - 段落列表
   * @param {object} config - 插件配置
   * @param {Array} textMessages - 文本消息数组（渲染结果将追加到此数组）
   * @returns {Promise<{firstImagePath: string|null}>} 首图路径
   */
  async handlePureTextImageMode(post, blogger, paragraphs, config, textMessages, summaryMessage, enablePureTextStatPrompt, enablePureTextImageFooterStats) {
    let firstImagePath = null
    const totalTextCount = paragraphs.reduce((sum, paragraph) => sum + countTextUnits(paragraph), 0)
    const paragraphCount = paragraphs.length

    if (post.hasImages || (config.pureTextSendMode || 'single') !== 'image') {
      return { firstImagePath, isImageMode: false }
    }

    if (enablePureTextStatPrompt) {
      textMessages.unshift(summaryMessage)
    }

    try {
      const { localFontFile, fontFamilyCSS } = resolveFontConfig(config.imageFont || '')

      const imagePaths = await renderTextAsImages({
        title: post.title,
        nickname: blogger.nickname,
        publishTime: formatDateTime(post.publishTime),
        blogId: blogger.blogId,
        avatarUrl: blogger.avatarUrl,
        paragraphs,
        totalTextCount,
        paragraphCount,
        enablePureTextImageFooterStats,
        config,
        localFontFile,
        fontFamilyCSS
      })

      if (imagePaths && imagePaths.length > 0) {
        for (const imgPath of imagePaths) {
          textMessages.push(segment.image(imgPath))
        }
        firstImagePath = imagePaths[0]
      } else {
        // 渲染失败，回退为文字模式
        textMessages.push(`${post.title}\n\n${paragraphs.join('\n\n')}`)
      }
    } catch (e) {
      logger.error('[Lofter解析] 生成纯文本长图失败：', e)
      textMessages.push(`${post.title}\n\n${paragraphs.join('\n\n')}`)
    }

    return { firstImagePath, isImageMode: true }
  }

  /**
   * 处理博文图片的下载与发送
   * @param {object} e - 云崽消息事件对象
   * @param {object} post - 博文信息
   * @param {object} blogger - 博主信息
   * @param {object} config - 插件配置
   * @param {Array} msgList - 合并转发消息列表
   * @param {string|null} existingFirstImagePath - 已有的首图路径（图片模式渲染结果）
   * @returns {Promise<object>} 图片处理结果
   */
  async handleImages(e, post, blogger, config, msgList, existingFirstImagePath) {
    let firstImagePath = existingFirstImagePath || null
    let firstImageIsThumbnail = false
    let firstImageThumbnailMsg = null
    let successImageCount = 0
    let isImageSizeLimitTriggered = false

    if (!post.hasImages) {
      return { firstImagePath, firstImageIsThumbnail, firstImageThumbnailMsg, successImageCount, isImageSizeLimitTriggered }
    }

    const tempDir = getTempDir()

    for (let i = 0; i < post.photoLinks.length; i++) {
      const photoLink = post.photoLinks[i]
      const result = await processImage(photoLink, i, post.photoLinks.length, {
        blogger, post, config, tempDir
      })

      if (!result.success) {
        // 下载失败
        if (config.sendMode !== 'forward') {
          await e.reply(`图片 ${result.fileName || `图${i + 1}`} 发送失败。`)
        } else {
          msgList.push(`图片 ${result.fileName || `图${i + 1}`} 下载失败。`)
        }
        continue
      }

      successImageCount++

      if (result.isThumbnail) {
        // 超限图片 - 发送缩略图
        isImageSizeLimitTriggered = true
        const combinedMsg = [segment.image(result.thumbnailUrl), result.limitMsg]

        if (config.sendMode === 'forward') {
          msgList.push(combinedMsg)
          if (!firstImagePath) {
            firstImagePath = result.thumbnailUrl
            firstImageIsThumbnail = true
            firstImageThumbnailMsg = result.limitMsg
          }
        } else {
          await e.reply(combinedMsg)
        }
      } else if (result.isOversized) {
        // 超限图片 - 不发送缩略图，仅发送链接
        isImageSizeLimitTriggered = true
        if (config.sendMode === 'forward') {
          msgList.push(result.oversizedMsg)
        } else {
          await e.reply(result.oversizedMsg)
        }
      } else {
        // 正常图片
        if (config.sendMode === 'forward') {
          msgList.push(segment.image(result.filePath))
          if (!firstImagePath) {
            firstImagePath = result.filePath
          }
        } else {
          await sendImageNormal(e, result.filePath, result.fileName, config)
          // 普通模式下图片已发送，立即清理临时文件
          cleanupFile(result.filePath)
        }
      }
    }

    return { firstImagePath, firstImageIsThumbnail, firstImageThumbnailMsg, successImageCount, isImageSizeLimitTriggered }
  }

  /**
   * 以合并转发模式发送所有消息
   * @param {object} e - 云崽消息事件对象
   * @param {Array} msgList - 消息列表
   * @param {object} post - 博文信息
   * @param {object} config - 插件配置
   * @param {string|null} firstImagePath - 首图路径
   * @param {boolean} firstImageIsThumbnail - 首图是否为缩略图
   * @param {string|null} firstImageThumbnailMsg - 首图缩略图提示消息
   * @param {number} successImageCount - 成功处理的图片数
   */
  async sendForwardMode(e, msgList, post, config, firstImagePath, firstImageIsThumbnail, firstImageThumbnailMsg, successImageCount) {
    try {
      const forwardTitle = config.forwardTitle || 'Lofter解析结果'
      const forwardNickname = config.forwardNickname || ''
      const forwardMsg = await makeForwardMsg(e, msgList, forwardTitle, forwardNickname)

      if (forwardMsg) {
        await e.reply(forwardMsg)
      } else {
        // 合并转发构建失败，降级为逐条发送
        for (const msg of msgList) {
          await e.reply(msg)
        }
      }

      // 发送首图预览
      if (config.sendFirstImage) {
        await this.sendFirstImagePreview(
          e, post, firstImagePath,
          firstImageIsThumbnail, firstImageThumbnailMsg,
          successImageCount, config
        )
      }
    } catch (err) {
      logger.error('[Lofter解析] 发送合并转发失败:', err)
      await e.reply('发送合并转发失败，尝试普通发送。')
      for (const msg of msgList) {
        await e.reply(msg)
      }
    } finally {
      // 合并转发完成后集中清理临时文件
      if (post.hasImages && post.photoLinks.length > 0) {
        const tempDir = getTempDir()
        cleanupTempFiles(tempDir, sanitizeFileName(post.blogName))
      }
    }
  }

  /**
   * 发送首图预览消息
   * @param {object} e - 云崽消息事件对象
   * @param {object} post - 博文信息
   * @param {string|null} firstImagePath - 首图路径
   * @param {boolean} firstImageIsThumbnail - 首图是否为缩略图
   * @param {string|null} firstImageThumbnailMsg - 缩略图提示消息
   * @param {number} successImageCount - 成功图片数
   * @param {object} config - 插件配置
   */
  async sendFirstImagePreview(e, post, firstImagePath, firstImageIsThumbnail, firstImageThumbnailMsg, successImageCount, config) {
    const showPrompt = config.imageCountPrompt ?? true

    if (firstImagePath) {
      try {
        let firstImageMsg = segment.image(firstImagePath)
        let suffixMsg = ''

        if (showPrompt && post.photoLinks.length >= 2) {
          suffixMsg += `\n还有${post.photoLinks.length - 1}张图片，请点击合并转发查看`
        }
        if (firstImageIsThumbnail && firstImageThumbnailMsg) {
          suffixMsg += firstImageThumbnailMsg
        }

        if (suffixMsg) {
          await e.reply([firstImageMsg, suffixMsg])
        } else {
          await e.reply(firstImageMsg)
        }
      } catch (firstImgErr) {
        logger.error(`[Lofter解析] 发送首图失败: ${firstImgErr.message}`)
      }
    } else if (showPrompt && post.photoLinks.length > 0 && successImageCount === 0) {
      const sizeLimitMB = config.imageSizeLimit ?? 8
      await e.reply(`解析成功${post.photoLinks.length}张图片，均超过设定的大小上限（${sizeLimitMB}MB），请点击合并转发查看具体链接。`)
    }
  }
}
