/**
 * @module lib/imageRenderer
 * @description 图片渲染模块，负责将纯文本博文通过 Puppeteer 渲染为长图
 *
 * 增强点（M-06 / P-04 / P-05 / P-03 / F-04）：
 *  - Yunzai puppeteer 路径抽为可注入的模块级常量
 *  - waitUntil 改为 'domcontentloaded' 减少等待
 *  - viewport height 提升至 3000 避免首次截断
 *  - 首页渲染失败时自动重试 1 次
 *  - 暴露缓存的 Puppeteer Browser 实例钩子（由宿主注入）
 *  - 头像预下载为 base64 data URI 内嵌，规避 Puppeteer 截图时图片未加载或 CDN 防盗链导致的占位白底
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeFetch from 'node-fetch'
import { countTextUnits } from './textProcessor.js'
import { MOBILE_USER_AGENT, sleep } from '../core/utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Yunzai 内置 Puppeteer 路径（可通过 setPuppeteerImporter 注入覆盖） */
let puppeteerImporter = () => import('../../../../lib/puppeteer/puppeteer.js')

/** 首页渲染失败重试次数 */
const RENDER_MAX_RETRIES = 1

/**
 * 注入自定义 Puppeteer 导入器（用于非 Yunzai 部署或测试）
 * @param {() => Promise<{default: any}>} importer
 */
export function setPuppeteerImporter(importer) {
  if (typeof importer === 'function') {
    puppeteerImporter = importer
  }
}

/**
 * 扫描字体目录，查找可用的本地字体文件
 * @param {string} customFontName - 用户配置的字体名称
 * @returns {{localFontFile: string|null, fontFamilyCSS: string}} 字体配置结果
 */
export function resolveFontConfig(customFontName = '') {
  const fontsDir = path.join(__dirname, '..', 'resources', 'fonts')

  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true })
  }

  let localFontFile = null
  const defaultFontFamily = "'PingFang SC', 'Microsoft YaHei', 'SimHei', sans-serif"

  if (fs.existsSync(fontsDir)) {
    const files = fs.readdirSync(fontsDir)
    const fontFiles = files.filter(f =>
      ['.ttf', '.otf', '.woff', '.woff2'].includes(path.extname(f).toLowerCase())
    )

    // 优先匹配用户指定的字体名称
    if (customFontName) {
      localFontFile = fontFiles.find(
        f => path.basename(f, path.extname(f)) === customFontName
      ) || fontFiles.find(f => f === customFontName)
    }

    // 若未匹配到指定字体但有可用字体，则使用第一个
    if (!localFontFile && fontFiles.length > 0) {
      localFontFile = fontFiles[0]
    }
  }

  // 构建 CSS font-family 声明
  let fontFamilyCSS = defaultFontFamily
  if (localFontFile) {
    fontFamilyCSS = `'LocalCustomFont', ` + (customFontName ? `'${customFontName}', ` : '') + fontFamilyCSS
  } else if (customFontName) {
    fontFamilyCSS = `'${customFontName}', ` + fontFamilyCSS
  }

  return { localFontFile, fontFamilyCSS }
}

/**
 * 将远程头像预下载为 base64 data URI
 * 目的：避免 Puppeteer 截图时头像图片尚未加载完成（waitUntil=domcontentloaded），或 Lofter CDN
 *      对无 referer 的跨域图片请求做防盗链拦截，导致生成的图片左上角呈现 44x44 白色圆占位。
 * 失败时回退为原 URL（受限于原有时序问题，但至少不会让整次渲染失败）。
 * @param {string} avatarUrl - 原始头像 URL
 * @param {string} [refererUrl] - 下载时使用的 Referer 头，通常为博文链接
 * @returns {Promise<string>} 解析后的 data URI 或原 URL，空值返回空串
 */
export async function resolveAvatarDataUri(avatarUrl, refererUrl) {
  if (!avatarUrl) return ''
  try {
    const res = await nodeFetch(avatarUrl, {
      headers: {
        'User-Agent': MOBILE_USER_AGENT,
        ...(refererUrl ? { 'Referer': refererUrl } : {})
      }
    })
    if (!res.ok) {
      logger.debug?.(`[Lofter解析] 头像下载失败 HTTP ${res.status}，回退为原 URL`)
      return avatarUrl
    }
    const buffer = await res.buffer()
    if (!buffer || buffer.length === 0) {
      logger.debug?.('[Lofter解析] 头像下载为空，回退为原 URL')
      return avatarUrl
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    return `data:${contentType};base64,${buffer.toString('base64')}`
  } catch (err) {
    logger.debug?.('[Lofter解析] 转换头像为 data URI 失败，回退为原 URL:', err.message)
    return avatarUrl
  }
}

/**
 * 将长段落列表按字数限制拆分为多个分组，用于分页渲染
 * @param {string[]} paragraphs - 段落列表
 * @param {number} textLimit - 单次渲染最大字数（0 表示不限制）
 * @returns {string[][]} 分组后的段落二维数组
 */
export function splitParagraphsByLimit(paragraphs, textLimit) {
  if (textLimit <= 0) {
    return [paragraphs]
  }

  const groups = []
  let currentGroup = []
  let currentLength = 0

  for (const p of paragraphs) {
    const paragraphLength = countTextUnits(p)
    if (currentLength + paragraphLength > textLimit && currentGroup.length > 0) {
      groups.push(currentGroup)
      currentGroup = [p]
      currentLength = paragraphLength
    } else {
      currentGroup.push(p)
      currentLength += paragraphLength
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

/**
 * 使用 Puppeteer 将博文内容渲染为图片
 * @param {object} params - 渲染参数
 * @returns {Promise<string[]|null>} 渲染后的图片路径数组，失败时返回 null
 */
export async function renderTextAsImages(params) {
  const {
    title, nickname, publishTime, blogId, avatarUrl, refererUrl,
    paragraphs, totalTextCount, paragraphCount, enablePureTextImageFooterStats, config, localFontFile, fontFamilyCSS
  } = params

  // 动态导入云崽的 puppeteer 支持
  let puppeteer
  try {
    puppeteer = (await puppeteerImporter()).default
  } catch (err) {
    logger.error('[Lofter解析] 加载 Puppeteer 模块失败', err)
    return null
  }

  // 提前预下载头像为 base64 data URI，避开 puppeteer 截图时图片尚未加载 / CDN 防盗链导致的白底问题
  const resolvedAvatar = await resolveAvatarDataUri(avatarUrl, refererUrl)

  const deviceScale = config.imageDeviceScale || 2
  const imageWidth = config.imageWidth || 800
  const textLimit = config.imageTextLimit || 0

  const paragraphGroups = splitParagraphsByLimit(paragraphs, textLimit)
  const resolvedTotalTextCount = totalTextCount ?? paragraphs.reduce((sum, paragraph) => sum + countTextUnits(paragraph), 0)
  const resolvedParagraphCount = paragraphCount ?? paragraphs.length
  const imagePaths = []

  for (let i = 0; i < paragraphGroups.length; i++) {
    let pageTitle = title
    if (paragraphGroups.length > 1) {
      pageTitle = `${title} (${i + 1}/${paragraphGroups.length})`
    }

    const pageTextCount = paragraphGroups[i].reduce((sum, paragraph) => sum + countTextUnits(paragraph), 0)

    const renderData = {
      tplFile: './plugins/Lofter-Plugin/resources/html/lofter/text-post.html',
      plugin: 'Lofter-Plugin',
      saveId: `lofter-plugin-${i}`,
      title: pageTitle,
      nickname,
      publishTime,
      blogId,
      avatar: resolvedAvatar,
      paragraphs: paragraphGroups[i],
      pageIndex: i + 1,
      pageTotal: paragraphGroups.length,
      pageTextCount,
      totalTextCount: resolvedTotalTextCount,
      paragraphCount: resolvedParagraphCount,
      enablePureTextImageFooterStats: enablePureTextImageFooterStats ?? true,
      config,
      localFontFile,
      fontFamilyCSS,
      // P-04: 改用 domcontentloaded 减少等待；P-05: 提升 viewport 高度避免首次截断
      pageGotoParams: { waitUntil: 'domcontentloaded' },
      viewPort: {
        width: imageWidth * deviceScale,
        height: 3000 * deviceScale,
        deviceScaleFactor: deviceScale
      }
    }

    // 首页渲染重试（F-04）
    let imgRes = null
    const isFirst = i === 0
    const maxRetries = isFirst ? RENDER_MAX_RETRIES : 0
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        imgRes = await puppeteer.render('lofter-plugin', renderData)
        if (imgRes) break
      } catch (err) {
        logger.error(`[Lofter解析] Puppeteer render 第 ${attempt + 1} 次失败:`, err)
        if (attempt < maxRetries) {
          await sleep(500)
        }
      }
    }

    if (imgRes) {
      imagePaths.push(imgRes)
    } else if (isFirst) {
      // 首页（含重试）失败，整体回退为文字模式
      return null
    }
    // 非首页失败：跳过该页，继续后续
  }

  return imagePaths
}
