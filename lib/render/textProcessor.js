/**
 * @module lib/textProcessor
 * @description 文本处理模块，负责 HTML 清洗、智能缩进、段落分割等文本转换逻辑
 */

import { HTML_ENTITY_MAP } from '../core/utils.js'

/**
 * 将 HTML 内容清洗为纯文本
 * 处理流程：换行标签转换 → 移除 HTML 标签 → 解码 HTML 实体
 * @param {string} html - 原始 HTML 内容
 * @returns {string} 清洗后的纯文本
 */
export function cleanHtml(html) {
  let text = html

  // 将 HTML 换行标签与段落标签替换为真实换行符
  text = text.replace(/<\/p>/ig, '\n')
  text = text.replace(/<br[^>]*>/ig, '\n')

  // 移除所有剩余 HTML 标签
  text = text.replace(/<[^>]+>/g, '')

  // 解码 HTML 实体（按映射表逐项替换）
  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    if (text.includes(entity)) {
      text = text.split(entity).join(char)
    }
  }

  return text
}

/**
 * 将清洗后的文本按换行符分割为段落列表
 * @param {string} text - 清洗后的纯文本
 * @returns {string[]} 非空段落数组
 */
export function splitParagraphs(text) {
  return text.split('\n').filter(line => line.trim())
}

/**
 * 统计文本字数
 * 中文汉字、中文标点、英文单词都按 1 个字计算
 * @param {string} text - 待统计文本
 * @returns {number} 字数
 */
export function countTextUnits(text) {
  if (!text) return 0

  const normalized = String(text).replace(/[\s\u3000]+/g, '')
  if (!normalized) return 0

  const matches = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+|[^\s]/g)
  return matches ? matches.length : 0
}

/**
 * 对段落列表应用智能首行缩进
 * 如果所有段落都没有缩进，则自动添加全角空格缩进
 * @param {string[]} paragraphs - 段落数组
 * @param {boolean} [enabled=true] - 是否启用智能缩进
 * @returns {string[]} 处理后的段落数组
 */
export function applySmartIndent(paragraphs, enabled = true) {
  if (!enabled) {
    return paragraphs.map(line => line.trim())
  }

  // 检查是否有任何段落已经包含首行缩进
  const hasIndent = paragraphs.some(
    line => line.startsWith('  ') || line.startsWith('　　')
  )

  if (!hasIndent) {
    return paragraphs.map(line => '　　' + line.trim())
  }

  return paragraphs.map(line => line.trim())
}

/**
 * 完整的文本处理流水线：HTML 清洗 → 段落分割 → 智能缩进
 * @param {string} html - 原始 HTML 内容
 * @param {object} [options={}] - 处理选项
 * @param {boolean} [options.smartIndent=true] - 是否启用智能缩进
 * @returns {string[]} 处理后的段落数组
 */
export function processText(html, options = {}) {
  const { smartIndent = true } = options
  const text = cleanHtml(html)
  const rawParagraphs = splitParagraphs(text)
  return applySmartIndent(rawParagraphs, smartIndent)
}
