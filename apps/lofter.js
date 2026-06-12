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
import { execFileSync } from 'child_process'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import Config from '../components/Config.js'
import { fetchPage, cleanupTempFiles, cleanupFile } from '../lib/fetcher.js'
import { parsePageData, extractPostInfo, extractImageUrl } from '../lib/parser.js'
import { extractBlogPageInfo } from '../lib/blogParser.js'
import { extractTagPageInfo } from '../lib/tagParser.js'
import { getListCacheKey, setListCache, getListCache } from '../lib/listCache.js'
import { countTextUnits, processText } from '../lib/textProcessor.js'
import { processImage, getTempDir } from '../lib/imageHandler.js'
import { resolveFontConfig, renderTextAsImages, splitParagraphsByLimit } from '../lib/imageRenderer.js'
import {
  buildBloggerMessage,
  buildPostInfoMessage,
  buildTagLinksMessage,
  buildInteractionMessage,
  buildImageOriginMessage,
  buildParseStatsMessage,
  buildBlogListMessages,
  buildTagListMessages,
  makeForwardMsg,
  sendImageNormal,
  recallMessage
} from '../lib/messageBuilder.js'
import { formatDate, formatDateTime, runWithConcurrency, sanitizeFileName, sleep } from '../lib/utils.js'

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

/** 开发者模式提示 */
const DEVELOPER_MODE_MESSAGE = '你正处于开发者模式，较正式版有以下新功能：'

/** 开发者模式无差异提示 */
const DEVELOPER_MODE_SAME_MESSAGE = '你正处于开发者模式，当前与正式版一致。'

/** 插件仓库路径 */
const pluginPath = dirname(dirname(fileURLToPath(import.meta.url)))

/** 当日内存解析计数（无需持久化） */
const parseCounter = {
  date: '',
  today: 0,
  groups: new Map()
}

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

/** Lofter 博主主页链接正则表达式 */
const LOFTER_BLOG_URL_REGEX = /https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/?$/i

/** 与 LOFTER_BLOG_URL_REGEX 等价的字符串模式（供 Yunzai rule.reg 使用） */
const LOFTER_BLOG_URL_PATTERN = 'https?:\\/\\/[a-zA-Z0-9-]+\\.lofter\\.com\\/?$'

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
        },
        {
          reg: '^#lofter\\s+(.+)$',
          fnc: 'browseBlog'
        },
        {
          reg: '^#lofter下一页$',
          fnc: 'browseBlogNextPage'
        },
        {
          reg: '^#lofter标签\\s+(.+)$',
          fnc: 'browseTag'
        },
        {
          reg: '^#lofter标签下一页$',
          fnc: 'browseTagNextPage'
        },
        {
          reg: '^#lofter标签热门$',
          fnc: 'browseTagHot'
        },
        {
          reg: '^#lofter解析\\s*(\\d+)$',
          fnc: 'parseCachedListItem'
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
    config = this.normalizeConfig(config)
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
    const startedAt = Date.now()

    let prepMsg = null
    try {
      // Step 2: 抓取并解析
      const postInfo = await this.stepFetchAndParse({ url, timeout: config.timeout || 30 })
      const { blogger, post, interaction } = postInfo
      const postWithTime = {
        ...post,
        publishDateTimeStr: formatDateTime(post.publishTime),
        inlineTags: config.sendTagLinks ? [] : post.tagList
      }

      // Step 3: 发送准备提示
      prepMsg = await this.stepSendPrepare(e, { post, url })

      // Step 4: 文本处理 + 统计
      const textCtx = this.stepProcessText({ post, config })

      // Step 5: 组装文本消息
      const textMessages = this.buildTextMessages({ blogger, post: postWithTime, interaction, paragraphs: textCtx.paragraphs, config })

      // Step 6: 纯文图片模式渲染
      const imageMode = await this.stepRenderImageMode({
        post, blogger, config, textCtx, textMessages
      })

      // Step 8: 图片下载与发送
      const msgList = [...textMessages]
      const imageResult = await this.stepHandleImages({ post, blogger, config, msgList, existingFirstImagePath: imageMode.firstImagePath })

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
        const counts = this.recordSuccessfulParse(e)
        if (config.sendParseStats) msgList.push(this.buildStatsMessage({ stats, counts, startedAt }))
        await this.stepSendForward({ e, msgList, post, blogger, config, imageResult })
        await this.sendDeveloperModeMessage(e)
      } else {
        for (const msg of msgList) await this.sendNormalMessage(e, msg, config)
        const counts = this.recordSuccessfulParse(e)
        if (config.sendParseStats) await e.reply(this.buildStatsMessage({ stats, counts, startedAt }))
        await this.cleanupImages(post, blogger)
        await this.sendDeveloperModeMessage(e)
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

  normalizeConfig(config) {
    return {
      ...config,
      sendBloggerInfo: config.sendBloggerInfo ?? true,
      sendPostInfo: config.sendPostInfo ?? true,
      sendTagLinks: config.sendTagLinks ?? config.tagLinks ?? true,
      sendInteraction: config.sendInteraction ?? true,
      sendPostTitle: config.sendPostTitle ?? true,
      sendPostBody: config.sendPostBody ?? true,
      sendImages: config.sendImages ?? true,
      sendImageLinks: config.sendImageLinks ?? true,
      sendImageLimitTip: config.sendImageLimitTip ?? true,
      sendParseStats: config.sendParseStats ?? true,
      blogListPageSize: config.blogListPageSize ?? 10,
      tagListPageSize: config.tagListPageSize ?? 20,
      listCacheTTL: config.listCacheTTL ?? 600,
      sendBlogInfo: config.sendBlogInfo ?? true,
      sendTagInfo: config.sendTagInfo ?? true,
      tagDefaultSort: config.tagDefaultSort ?? 'new'
    }
  }

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
    const enablePureTextImageFooterStats = config.enablePureTextImageFooterStats ?? true
    return {
      paragraphs, totalTextCount, paragraphCount,
      expectedImageCount, enablePureTextImageFooterStats
    }
  }

  /** Step 5: 组装文本消息（R-02 已改造） */
  buildTextMessages({ blogger, post, interaction, paragraphs, config }) {
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
  async stepRenderImageMode({ post, blogger, config, textCtx, textMessages }) {
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
        textMessages.push(textCtx.paragraphs.join('\n\n'))
      }
    } catch (renderErr) {
      logger.error('[Lofter解析] 生成纯文本长图失败：', renderErr)
      textMessages.push(textCtx.paragraphs.join('\n\n'))
    }
    return { firstImagePath, isImageMode: true }
  }

  /** Step 8: 处理图片（P-01 并发下载） */
  async stepHandleImages({ post, blogger, config, msgList, existingFirstImagePath }) {
    const result = {
      firstImagePath: existingFirstImagePath || null,
      firstImageIsThumbnail: false,
      firstImageThumbnailMsg: null,
      successImageCount: 0,
      isImageSizeLimitTriggered: false
    }
    if (!post.hasImages) return result

    if (!config.sendImages) {
      if (config.sendImageLinks) this.appendImageLinkMessages(post, msgList)
      return result
    }

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
        msgList.push(`图片 ${name} ${failMsg}。`)
        continue
      }
      this.dispatchImageResult({ r, i, config, msgList, result })
    }
    return result
  }

  /**
   * 内部：根据图片处理结果分支发送到 msgList 或 e.reply
   * @param {object} args
   */
  dispatchImageResult({ r, i, config, msgList, result }) {
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

  appendImageLinkMessages(post, msgList) {
    post.photoLinks.forEach((link, index) => {
      const imgUrl = extractImageUrl(link)
      if (imgUrl) msgList.push(buildImageOriginMessage(index, imgUrl))
    })
  }

  /** Step 10: 合并转发模式（R-02 对象参数） */
  async stepSendForward({ e, msgList, post, blogger, config, imageResult }) {
    const forwardTitle = config.forwardTitle || 'Lofter解析结果'
    const forwardNickname = config.forwardNickname || ''
    try {
      const forwardMsg = await makeForwardMsg(e, msgList.map(msg => this.toForwardMessage(msg)), forwardTitle, forwardNickname)
      if (forwardMsg) {
        await e.reply(forwardMsg)
      } else {
        for (const msg of msgList) await e.reply(this.toReplyMessage(msg))
      }
      if (config.sendFirstImage) {
        await this.sendFirstImagePreview({ e, post, config, image: imageResult })
      }
    } catch (err) {
      logger.error('[Lofter解析] 发送合并转发失败:', err)
      await e.reply('发送合并转发失败，尝试普通发送。')
      for (const msg of msgList) await e.reply(this.toReplyMessage(msg))
    } finally {
      if (post.hasImages && post.photoLinks.length > 0) {
        const tempDir = getTempDir()
        await cleanupTempFiles(tempDir, sanitizeFileName(blogger.blogName))
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

  toForwardMessage(msg) {
    if (msg?.type === 'lofter-image') {
      return msg.originMsg ? [segment.image(msg.filePath), `\n${msg.originMsg}`] : segment.image(msg.filePath)
    }
    return msg
  }

  toReplyMessage(msg) {
    if (msg?.type === 'lofter-image') {
      return msg.originMsg ? [segment.image(msg.filePath), `\n${msg.originMsg}`] : segment.image(msg.filePath)
    }
    return msg
  }

  async sendNormalMessage(e, msg, config) {
    if (msg?.type === 'lofter-image' && config.sendOriginal) {
      await sendImageNormal(e, msg.filePath, msg.fileName, config)
      if (msg.originMsg) await e.reply(msg.originMsg)
      await cleanupFile(msg.filePath)
      return
    }
    await e.reply(this.toReplyMessage(msg))
    if (msg?.type === 'lofter-image') await cleanupFile(msg.filePath)
  }

  async cleanupImages(post, blogger) {
    if (post.hasImages && post.photoLinks.length > 0) {
      const tempDir = getTempDir()
      await cleanupTempFiles(tempDir, sanitizeFileName(blogger.blogName))
    }
  }

  buildStatsMessage({ stats, counts, startedAt }) {
    return buildParseStatsMessage({
      ...stats,
      elapsedSeconds: ((Date.now() - startedAt) / 1000).toFixed(3),
      todayCount: counts.today,
      groupCount: counts.group
    })
  }

  recordSuccessfulParse(e) {
    const today = formatDate(Date.now())
    if (parseCounter.date !== today) {
      parseCounter.date = today
      parseCounter.today = 0
      parseCounter.groups.clear()
    }
    parseCounter.today++

    const groupKey = e.isGroup ? String(e.group_id || e.group?.group_id || e.group?.id || 'unknown') : 'private'
    const groupCount = (parseCounter.groups.get(groupKey) || 0) + 1
    parseCounter.groups.set(groupKey, groupCount)

    return { today: parseCounter.today, group: groupCount }
  }

  isDeveloperMode() {
    try {
      const branch = execFileSync('git', ['branch', '--show-current'], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      return branch === 'dev'
    } catch (err) {
      logger.debug?.(`[Lofter解析] 获取当前 Git 分支失败: ${err.message}`)
      return false
    }
  }

  getDeveloperCommitMessages() {
    try {
      const baseRef = this.resolveMainRef()
      const output = execFileSync('git', ['log', '--format=%cd%x09%H%x09%s', '--date=format:%Y-%m-%d %H:%M:%S', `${baseRef}..dev`], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
      if (!output) return []
      return output.split('\n').map(line => {
        const [time, hash, ...subjectParts] = line.split('\t')
        const shortHash = hash.slice(-7)
        return `${time} ${shortHash} ${subjectParts.join('\t')}`
      })
    } catch (err) {
      logger.debug?.(`[Lofter解析] 对比 dev 与 main 分支失败: ${err.message}`)
      return []
    }
  }

  resolveMainRef() {
    try {
      execFileSync('git', ['rev-parse', '--verify', 'origin/main'], {
        cwd: pluginPath,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'ignore']
      })
      return 'origin/main'
    } catch (err) {
      return 'main'
    }
  }

  async sendDeveloperModeMessage(e) {
    if (!this.isDeveloperMode()) return
    try {
      const commits = this.getDeveloperCommitMessages()
      const message = commits.length > 0
        ? `${DEVELOPER_MODE_MESSAGE}\n${commits.join('\n')}`
        : DEVELOPER_MODE_SAME_MESSAGE
      await e.reply(message)
    } catch (err) {
      logger.error('[Lofter解析] 发送开发者模式提示失败', err)
    }
  }

  // ============== 博主主页浏览 ==============

  /**
   * 加载配置（复用 parseLofter 的防御性加载逻辑）
   * @returns {LofterConfig|null}
   */
  loadConfig() {
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
      logger.error('[Lofter解析] 配置加载结果异常')
      return null
    }
    return this.normalizeConfig(config)
  }

  /**
   * 从消息中提取博主名或主页 URL
   * @param {string} msg - 消息文本
   * @returns {string|null} blogName
   */
  extractBlogName(msg) {
    const match = msg.match(/^#lofter\s+(.+)$/)
    if (!match) return null
    const input = match[1].trim()

    // 检查是否为 Lofter 主页 URL
    const urlMatch = input.match(/^https?:\/\/([a-zA-Z0-9-]+)\.lofter\.com\/?$/i)
    if (urlMatch) return urlMatch[1]

    // 否则视为博主名
    return input
  }

  /**
   * 浏览博主主页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlog(e) {
    const config = this.loadConfig()
    if (!config) return false

    const blogName = this.extractBlogName(e.msg)
    if (!blogName) return false

    logger.info(`[Lofter解析] 浏览博主主页: ${blogName}`)
    const url = `https://${blogName}.lofter.com/`

    try {
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const blogPage = extractBlogPageInfo(dataObj, url)

      // 截取指定数量的帖子
      const pageSize = config.blogListPageSize || 10
      const items = blogPage.postList.slice(0, pageSize)

      // 构建消息
      const messages = buildBlogListMessages({ ...blogPage, postList: items }, config)

      // 缓存列表
      setListCache(e, {
        type: 'blog',
        items: items,
        pageState: {
          blogName: blogPage.blogger.blogName,
          offset: blogPage.offset
        }
      }, config.listCacheTTL || 600)

      // 发送消息
      if (config.sendMode === 'forward') {
        const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
        if (forwardMsg) {
          await e.reply(forwardMsg)
        } else {
          for (const msg of messages) await e.reply(msg)
        }
      } else {
        for (const msg of messages) await e.reply(msg)
      }

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 博主主页浏览失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 博主主页下一页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlogNextPage(e) {
    const config = this.loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'blog') {
      await e.reply('请先使用 #lofter 博主名 浏览博主主页')
      return false
    }

    const { blogName, offset } = cache.pageState
    if (!offset || offset <= 0) {
      await e.reply('已经没有更多内容了')
      return false
    }

    logger.info(`[Lofter解析] 博主主页下一页: ${blogName}, offset=${offset}`)
    const url = `https://${blogName}.lofter.com/?offset=${offset}`

    try {
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const blogPage = extractBlogPageInfo(dataObj, url)

      // 截取指定数量的帖子
      const pageSize = config.blogListPageSize || 10
      const items = blogPage.postList.slice(0, pageSize)

      // 构建消息
      const messages = buildBlogListMessages({ ...blogPage, postList: items }, config)

      // 更新缓存
      setListCache(e, {
        type: 'blog',
        items: items,
        pageState: {
          blogName: blogPage.blogger.blogName,
          offset: blogPage.offset
        }
      }, config.listCacheTTL || 600)

      // 发送消息
      if (config.sendMode === 'forward') {
        const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
        if (forwardMsg) {
          await e.reply(forwardMsg)
        } else {
          for (const msg of messages) await e.reply(msg)
        }
      } else {
        for (const msg of messages) await e.reply(msg)
      }

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 博主主页下一页失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  // ============== 标签页浏览 ==============

  /**
   * 从消息中提取标签名
   * @param {string} msg - 消息文本
   * @returns {string|null} 标签名
   */
  extractTagName(msg) {
    const match = msg.match(/^#lofter标签\s+(.+)$/)
    return match ? match[1].trim() : null
  }

  /**
   * 浏览标签页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTag(e) {
    const config = this.loadConfig()
    if (!config) return false

    const tagName = this.extractTagName(e.msg)
    if (!tagName) return false

    const sort = config.tagDefaultSort || 'new'
    logger.info(`[Lofter解析] 浏览标签页: ${tagName}, 排序: ${sort}`)

    try {
      const encodedTag = encodeURIComponent(tagName)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=1`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      // 截取指定数量的帖子
      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      // 构建消息
      const messages = buildTagListMessages({ ...tagPage, items }, config)

      // 缓存列表
      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tagName,
          page: 1,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      // 发送消息
      if (config.sendMode === 'forward') {
        const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
        if (forwardMsg) {
          await e.reply(forwardMsg)
        } else {
          for (const msg of messages) await e.reply(msg)
        }
      } else {
        for (const msg of messages) await e.reply(msg)
      }

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页浏览失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 标签页下一页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTagNextPage(e) {
    const config = this.loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'tag') {
      await e.reply('请先使用 #lofter标签 标签名 浏览标签页')
      return false
    }

    const { tag, page, sort } = cache.pageState
    const nextPage = page + 1

    logger.info(`[Lofter解析] 标签页下一页: ${tag}, page=${nextPage}, sort=${sort}`)

    try {
      const encodedTag = encodeURIComponent(tag)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=${nextPage}`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      // 截取指定数量的帖子
      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      // 构建消息
      const messages = buildTagListMessages({ ...tagPage, items }, config)

      // 更新缓存
      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tag,
          page: nextPage,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      // 发送消息
      if (config.sendMode === 'forward') {
        const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
        if (forwardMsg) {
          await e.reply(forwardMsg)
        } else {
          for (const msg of messages) await e.reply(msg)
        }
      } else {
        for (const msg of messages) await e.reply(msg)
      }

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页下一页失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 标签页切换热门排序
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTagHot(e) {
    const config = this.loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'tag') {
      await e.reply('请先使用 #lofter标签 标签名 浏览标签页')
      return false
    }

    const { tag } = cache.pageState
    const sort = 'hot'

    logger.info(`[Lofter解析] 标签页切换热门: ${tag}`)

    try {
      const encodedTag = encodeURIComponent(tag)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=1`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      // 截取指定数量的帖子
      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      // 构建消息
      const messages = buildTagListMessages({ ...tagPage, items }, config)

      // 更新缓存
      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tag,
          page: 1,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      // 发送消息
      if (config.sendMode === 'forward') {
        const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
        if (forwardMsg) {
          await e.reply(forwardMsg)
        } else {
          for (const msg of messages) await e.reply(msg)
        }
      } else {
        for (const msg of messages) await e.reply(msg)
      }

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页热门切换失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  // ============== 列表快速解析 ==============

  /**
   * 从缓存列表中解析指定序号的帖子
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async parseCachedListItem(e) {
    const config = this.loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || !cache.items || cache.items.length === 0) {
      await e.reply('当前没有可解析的列表，请先使用 #lofter 博主名 或 #lofter标签 标签名 浏览列表')
      return false
    }

    // 提取序号
    const match = e.msg.match(/^#lofter解析\s*(\d+)$/)
    if (!match) return false

    const index = parseInt(match[1], 10)
    if (index < 1 || index > cache.items.length) {
      await e.reply(`序号超出范围，请输入 1 到 ${cache.items.length} 之间的数字`)
      return false
    }

    const item = cache.items[index - 1]
    const blogName = item.blogInfo?.blogName
    const permalink = item.permalink

    if (!blogName || !permalink) {
      await e.reply('该帖子信息不完整，无法解析')
      return false
    }

    const url = `https://${blogName}.lofter.com/post/${permalink}`
    logger.info(`[Lofter解析] 快速解析: ${url}`)

    try {
      // 复用 parseLofterUrl 的逻辑
      return await this.parseLofterUrl(e, url, config)
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 快速解析失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 解析指定 URL 的 Lofter 帖子（复用 parseLofter 的核心逻辑）
   * @param {object} e - 消息事件对象
   * @param {string} url - 帖子 URL
   * @param {LofterConfig} config - 配置对象
   * @returns {Promise<boolean>}
   */
  async parseLofterUrl(e, url, config) {
    const startedAt = Date.now()
    let prepMsg = null

    try {
      // Step 2: 抓取并解析
      const postInfo = await this.stepFetchAndParse({ url, timeout: config.timeout || 30 })
      const { blogger, post, interaction } = postInfo
      const postWithTime = {
        ...post,
        publishDateTimeStr: formatDateTime(post.publishTime),
        inlineTags: config.sendTagLinks ? [] : post.tagList
      }

      // Step 3: 发送准备提示
      prepMsg = await this.stepSendPrepare(e, { post, url })

      // Step 4: 文本处理 + 统计
      const textCtx = this.stepProcessText({ post, config })

      // Step 5: 组装文本消息
      const textMessages = this.buildTextMessages({ blogger, post: postWithTime, interaction, paragraphs: textCtx.paragraphs, config })

      // Step 6: 纯文图片模式渲染
      const imageMode = await this.stepRenderImageMode({
        post, blogger, config, textCtx, textMessages
      })

      // Step 8: 图片下载与发送
      const msgList = [...textMessages]
      const imageResult = await this.stepHandleImages({ post, blogger, config, msgList, existingFirstImagePath: imageMode.firstImagePath })

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
        const counts = this.recordSuccessfulParse(e)
        if (config.sendParseStats) msgList.push(this.buildStatsMessage({ stats, counts, startedAt }))
        await this.stepSendForward({ e, msgList, post, blogger, config, imageResult })
        await this.sendDeveloperModeMessage(e)
      } else {
        for (const msg of msgList) await this.sendNormalMessage(e, msg, config)
        const counts = this.recordSuccessfulParse(e)
        if (config.sendParseStats) await e.reply(this.buildStatsMessage({ stats, counts, startedAt }))
        await this.cleanupImages(post, blogger)
        await this.sendDeveloperModeMessage(e)
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
}
