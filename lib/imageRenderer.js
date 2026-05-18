/**
 * @module lib/imageRenderer
 * @description 图片渲染模块，负责将纯文本博文通过 Puppeteer 渲染为长图
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countTextUnits } from './textProcessor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
 * @param {string} params.title - 博文标题
 * @param {string} params.nickname - 博主昵称
 * @param {string} params.publishTime - 发布时间字符串
 * @param {string} params.blogId - 博主 ID
 * @param {string} params.avatarUrl - 头像 URL
 * @param {string[]} params.paragraphs - 段落列表
 * @param {object} params.config - 插件配置
 * @param {string|null} params.localFontFile - 本地字体文件名
 * @param {string} params.fontFamilyCSS - CSS font-family 声明
 * @returns {Promise<string[]|null>} 渲染后的图片路径数组，失败时返回 null
 */
export async function renderTextAsImages(params) {
  const {
    title, nickname, publishTime, blogId, avatarUrl,
    paragraphs, totalTextCount, paragraphCount, enablePureTextImageFooterStats, config, localFontFile, fontFamilyCSS
  } = params

  // 动态导入云崽的 puppeteer 支持
  const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default

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
      avatar: avatarUrl,
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
      pageGotoParams: { waitUntil: 'networkidle0' },
      viewPort: {
        width: imageWidth * deviceScale,
        height: 100,
        deviceScaleFactor: deviceScale
      }
    }

    const imgRes = await puppeteer.render('lofter-plugin', renderData)
    if (imgRes) {
      imagePaths.push(imgRes)
    } else if (i === 0) {
      // 首页渲染失败，整体回退为文字模式
      return null
    }
  }

  return imagePaths
}
