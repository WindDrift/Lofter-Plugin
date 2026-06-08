/**
 * @module apps/lofter
 * @description Lofter 链接解析插件主入口
 *
 * 增强点（M-05 / F-03 / R-02 / P-01）：
 *  - 拆解为 Pipeline 风格：`parseLofter` 仅做编排，11 步各为独立方法
 *  - 顶层 catch 分类处理（网络/解析/渲染/未知），给出可操作提示
 *  - 长参数列表（sendForwardMode / sendFirstImagePreview）改为对象参数
 *  - 图片下载改为 `runWithConcurrency(3)` 并发限流
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
import { formatDateTime, runWithConcurrency, sanitizeFileName } from '../lib/utils.js'

/** @typedef {import('../lib/utils.js').LofterConfig} LofterConfig */
/** @typedef {import('../lib/utils.js').PostExtracted} PostExtracted */
/** @typedef {import('../lib/utils.js').BloggerInfo} BloggerInfo */
/** @typedef {import('../lib/utils.js').PostInfo} PostInfo */
/** @typedef {import('../lib/utils.js').InteractionInfo} InteractionInfo */

/** Lofter 博文链接正则表达式（模块内私有） */
const LOFTER_URL_REGEX = /https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+/i

/** 与 LOFTER_URL_REGEX 等价的字符串模式（供 Yunzai rule.reg 使用，模块内私有） */
const LOFTER_URL_PATTERN = 'https?:\\/\\/[a-zA-Z0-9-]+\\.lofter\\.com\\/post\\/[a-zA-Z0-9_]+'

/** 图片并发下载数 */
const IMAGE_CONCURRENCY = 3

/**
 * 从文本中提取第一个 Lofter 博文 URL
 * @param {string} text
 * @returns {string|null}
 */
const extractLofterUrl = (text) => {
  const m = text.match(LOFTER_URL_REGEX)
  return m ? m[0] : null
}

/**
 * 错误分类（F-03）：将异常归类为可操作类别
 * @param {Error} err
 * @returns {{category: string, hint: string}}
 */
function categorizeError(err) {
  const msg = String(err?.message || '')
  if (/fetchPage 失败|ENOTFOUND|ETIMEDOUT|ECONNRESET|超时|HTTP 5\d{2}/i.test(msg)) {
    return { category: 'network', hint: '网络请求失败，请稍后重试（已自动重试 2 次）。' }
  }
  if (/JSON 解析失败|未能在页面中找到解析数据|获取博文数据失败/.test(msg)) {
    return { category: 'parse', hint: '页面结构已变更，请前往 github 提 issue。' }
  }
  if (/Puppeteer|Chromium/.test(msg)) {
    return { category: 'render', hint: 'Puppeteer 渲染失败，请确认 Chromium 已正确安装。' }
  }
  return { category: 'unknown', hint: 'Lofter 解析时发生未知错误。' }
}

export class LofterPlugin extends plugin {
  constructor() {
    super({
      name: 'Lofter解析',
      dsc: '解析Lofter链接并发送图文',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: LOFTER_URL_PATTERN,
          fnc: 'parseLofter'
        }
      ]
    })
  }

  /**
   * 主入口：编排 11 步流水线
   * @param {object} e
   * @returns {Promise<boolean>}
   */
  async parseLofter(e) {
    // 诊断：确认 handler 已被 Yunzai 路由触发
    logger.debug?.(`[Lofter解析] parseLofter 已触发, msg=${String(e?.msg).slice(0, 80)}`)

    // 防御性配置加载：优先单例，失败时回退到 new Config()
    let config
    try {
      const ConfigClass = Config
      if (typeof ConfigClass.getInstance === 'function') {
        config = ConfigClass.getInstance().getDefSet('lofter')
      } else {
        config = new ConfigClass().getDefSet('lofter')
      }
    } catch (cfgErr) {
      logger.error('[Lofter解析] 配置加载失败，使用空配置继续', cfgErr)
      config = {}
    }
    if (!config || typeof config !== 'object') {
      logger.error('[Lofter解析] 配置加载结果异常，放弃本次解析')
      return false
    }
    if (!config.autoParse) {
      logger.debug?.('[Lofter解析] autoParse=false，跳过')
      return false
    }

    // Step 1: 提取 URL
    const url = extractLofterUrl(e.msg)
    if (!url) {
      logger.debug?.('[Lofter解析] 未能从消息中提取 Lofter URL')
      return false
    }
    logger.info(`[Lofter解析] 检测到链接: ${url}`)

    let prepMsg = null
    try {
      // Step 2: 抓取并解析
      const postInfo = await this.stepFetchAndParse({ url, timeout: config.timeout || 30 })
      const { blogger, post, interaction } = postInfo
      const postWithTime = { ...post, publishDateTimeStr: formatDateTime(post.publishTime) }

      // Step 3: 发送准备提示
      prepMsg = await this.stepSendPrepare(e, { post, url })

      // Step 4: 文本处理 + 统计
      const textCtx = this.stepProcessText({ post, config })

      // Step 5: 组装文本消息
      const textMessages = this.buildTextMessages({ blogger, post: postWithTime, interaction, paragraphs: textCtx.paragraphs, config })

      // Step 6: 纯文图片模式渲染
      const imageMode = await this.stepRenderImageMode({
        post, blogger, config, textCtx, textMessages, summaryMessage: textCtx.summaryMessage
      })

      if (!imageMode.isImageMode && textCtx.enablePureTextStatPrompt && !textCtx.sendStatOutsideForward) {
        textMessages.unshift(textCtx.summaryMessage)
      }

      // Step 7: 非合并转发模式先发文本
      if (config.sendMode !== 'forward') {
        for (const msg of textMessages) {
          await e.reply(msg)
        }
      }

      // Step 8: 图片下载与发送
      const msgList = [...textMessages]
      const imageResult = await this.stepHandleImages({ e, post, blogger, config, msgList, existingFirstImagePath: imageMode.firstImagePath })

      // Step 9: 大小限制提示
      if (imageResult.isImageSizeLimitTriggered) {
        const tipMsg = '要调整/关闭图片大小限制功能，请前往锅巴面板配置。'
        if (config.sendMode === 'forward') msgList.push(tipMsg)
        else await e.reply(tipMsg)
      }

      // Step 10: 合并转发模式发送
      if (config.sendMode === 'forward') {
        await this.stepSendForward({ e, msgList, post, config, imageResult })
      }
    } catch (err) {
      // F-03 分类异常
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] ${err.message}`)
      try {
        await e.reply(hint)
      } catch (replyErr) {
        logger.error('[Lofter解析] 回复错误提示失败', replyErr)
      }
    } finally {
      // Step 11: 撤回准备消息
      await recallMessage(e, prepMsg)
    }

    return true
  }

  // ============== Pipeline Steps ==============

  /** Step 2: 抓取并解析 */
  async stepFetchAndParse({ url, timeout }) {
    const html = await fetchPage(url, timeout)
    const dataObj = parsePageData(html)
    return extractPostInfo(dataObj, url)
  }

  /** Step 3: 发送准备提示 */
  async stepSendPrepare(e, { post, url }) {
    try {
      const msgType = post.hasImages ? '图文' : '纯文'
      return await e.reply(`收到${msgType} Lofter 链接 ${url}，准备解析...`)
    } catch (err) {
      logger.error('[Lofter解析] 发送准备消息失败', err)
      return null
    }
  }

  /** Step 4: 文本处理（HTML 清洗 + 智能缩进 + 统计） */
  stepProcessText({ post, config }) {
    const paragraphs = processText(post.digest, { smartIndent: config.smartIndent ?? true })
    const totalTextCount = paragraphs.reduce((sum, p) => sum + countTextUnits(p), 0)
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
    const sendStatOutsideForward = config.sendMode === 'forward' && !post.hasImages && enablePureTextStatPrompt
    return {
      paragraphs, totalTextCount, paragraphCount,
      enablePureTextStatPrompt, enablePureTextImageFooterStats,
      summaryMessage, sendStatOutsideForward
    }
  }

  /** Step 5: 组装文本消息（R-02 已改造） */
  buildTextMessages({ blogger, post, interaction, paragraphs, config }) {
    const messages = []
    messages.push(buildBloggerMessage(blogger))
    messages.push(buildPostInfoMessage(post))
    if (config.tagLinks && post.tagList && post.tagList.length > 0) {
      messages.push(buildTagLinksMessage(post.tagList))
    }

    const pureTextSendMode = config.pureTextSendMode || 'single'
    const hasImages = post.hasImages

    if (!hasImages && pureTextSendMode === 'image') {
      // 图片模式由 stepRenderImageMode 单独处理
    } else if (!hasImages && pureTextSendMode === 'multi' && config.sendMode === 'forward') {
      messages.push(post.title)
      paragraphs.forEach(p => messages.push(p))
    } else {
      messages.push(`${post.title}\n\n${paragraphs.join('\n\n')}`)
    }

    messages.push(buildInteractionMessage(interaction))

    if (hasImages) {
      messages.push(buildImageLinksMessage(post.photoLinks))
    }
    return messages
  }

  /** Step 6: 纯文图片模式渲染 */
  async stepRenderImageMode({ post, blogger, config, textCtx, textMessages }) {
    if (post.hasImages || (config.pureTextSendMode || 'single') !== 'image') {
      return { firstImagePath: null, isImageMode: false }
    }
    if (textCtx.enablePureTextStatPrompt && !textCtx.sendStatOutsideForward) {
      textMessages.unshift(textCtx.summaryMessage)
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
        // 传博文链接作为头像下载的 Referer，规避 Lofter CDN 防盗链
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
        textMessages.push(`${post.title}\n\n${textCtx.paragraphs.join('\n\n')}`)
      }
    } catch (renderErr) {
      logger.error('[Lofter解析] 生成纯文本长图失败：', renderErr)
      textMessages.push(`${post.title}\n\n${textCtx.paragraphs.join('\n\n')}`)
    }
    return { firstImagePath, isImageMode: true }
  }

  /** Step 8: 处理图片（P-01 并发下载） */
  async stepHandleImages({ e, post, blogger, config, msgList, existingFirstImagePath }) {
    const result = {
      firstImagePath: existingFirstImagePath || null,
      firstImageIsThumbnail: false,
      firstImageThumbnailMsg: null,
      successImageCount: 0,
      isImageSizeLimitTriggered: false
    }
    if (!post.hasImages) return result

    const tempDir = getTempDir()
    const total = post.photoLinks.length

    // 预创建上下文
    const ctxFor = (i) => ({ blogger, post, config, tempDir })

    // 并发下载（P-01：默认 3 并发）
    const tasks = post.photoLinks.map((link, i) => async () => processImage(link, i, total, ctxFor(i)))
    const settled = await runWithConcurrency(IMAGE_CONCURRENCY, tasks)

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]
      if (!r || r.__error || !r.success) {
        const name = r?.fileName || `图${i + 1}`
        const failMsg = r?.error || r?.reason || '下载失败（已重试）'
        if (config.sendMode !== 'forward') {
          await e.reply(`图片 ${name} ${failMsg}。`)
        } else {
          msgList.push(`图片 ${name} ${failMsg}。`)
        }
        continue
      }
      await this.dispatchImageResult({ e, r, i, total, config, msgList, result })
    }
    return result
  }

  /**
   * 内部：根据图片处理结果分支发送到 msgList 或 e.reply
   * @param {object} args
   */
  async dispatchImageResult({ e, r, i, total, config, msgList, result }) {
    if (r.isThumbnail) {
      result.isImageSizeLimitTriggered = true
      result.successImageCount++
      const combined = [segment.image(r.thumbnailUrl), r.limitMsg]
      if (config.sendMode === 'forward') {
        msgList.push(combined)
        if (!result.firstImagePath) {
          result.firstImagePath = r.thumbnailUrl
          result.firstImageIsThumbnail = true
          result.firstImageThumbnailMsg = r.limitMsg
        }
      } else {
        await e.reply(combined)
      }
      return
    }
    if (r.isOversized) {
      result.isImageSizeLimitTriggered = true
      if (config.sendMode === 'forward') msgList.push(r.oversizedMsg)
      else await e.reply(r.oversizedMsg)
      return
    }
    // 正常
    result.successImageCount++
    if (config.sendMode === 'forward') {
      msgList.push(segment.image(r.filePath))
      if (!result.firstImagePath) result.firstImagePath = r.filePath
    } else {
      await sendImageNormal(e, r.filePath, r.fileName, config)
      await cleanupFile(r.filePath)
    }
  }

  /** Step 10: 合并转发模式（R-02 对象参数） */
  async stepSendForward({ e, msgList, post, config, imageResult }) {
    const forwardTitle = config.forwardTitle || 'Lofter解析结果'
    const forwardNickname = config.forwardNickname || ''
    try {
      const forwardMsg = await makeForwardMsg(e, msgList, forwardTitle, forwardNickname)
      if (forwardMsg) {
        await e.reply(forwardMsg)
      } else {
        for (const msg of msgList) await e.reply(msg)
      }
      if (config.sendFirstImage) {
        await this.sendFirstImagePreview({ e, post, config, image: imageResult })
      }
    } catch (err) {
      logger.error('[Lofter解析] 发送合并转发失败:', err)
      await e.reply('发送合并转发失败，尝试普通发送。')
      for (const msg of msgList) await e.reply(msg)
    } finally {
      if (post.hasImages && post.photoLinks.length > 0) {
        const tempDir = getTempDir()
        await cleanupTempFiles(tempDir, sanitizeFileName(post.blogName))
      }
    }
  }

  /** Step 10.b: 首图预览（R-02 对象参数） */
  async sendFirstImagePreview({ e, post, config, image }) {
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
}
