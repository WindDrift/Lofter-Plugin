/**
 * @module lib/parse/parserBase
 * @description 解析器共享工具函数，提取 parser/blogParser/tagParser 中重复的 DOM/JSON 提取逻辑
 *
 * 设计目的：消除三个解析器中重复的 typeMap、digest 回退、permalink 构造、postCountView 规范化等逻辑，
 * 保证行为一致并减少维护成本。所有函数均为纯函数，无副作用。
 */

/**
 * Lofter 博文类型码到可读名称的映射
 * 1=text(纯文), 2=photo(图文), 3=long(长文), 4=video(视频), 5=music(音乐)
 * @type {Readonly<Record<number, string>>}
 */
export const POST_TYPE_MAP = Object.freeze({
  1: 'text',
  2: 'photo',
  3: 'long',
  4: 'video',
  5: 'music'
})

/**
 * 将 Lofter 数字类型码解析为可读字符串
 * @param {number|string|undefined} type - 原始类型码
 * @returns {string} 类型名称，无法识别时回退到原始值或 'unknown'
 */
export function resolvePostType(type) {
  return POST_TYPE_MAP[type] || type || 'unknown'
}

/**
 * 从 postView 中提取正文摘要，多级回退以兼容 Lofter 多种数据结构
 * 优先级：content → digest → desc → ''
 * @param {object} postView - 博文视图数据
 * @returns {string} 原始 HTML 文本（未清洗）
 */
export function extractDigestText(postView) {
  return postView.content || postView.digest || postView.desc || ''
}

/**
 * 从 postView 中提取博文正文，纯文博文优先取 textPostView.content
 * 优先级：textPostView.content（仅纯文）→ content → digest → desc → ''
 * @param {object} postView - 博文视图数据
 * @param {boolean} hasImages - 是否为图文博文
 * @returns {string} 原始 HTML 文本（未清洗）
 */
export function extractPostDigest(postView, hasImages) {
  // 纯文博文的完整正文存放在 textPostView.content，优先取此字段
  if (!hasImages && postView.textPostView?.content) {
    return postView.textPostView.content
  }
  return extractDigestText(postView)
}

/**
 * 构建博文永久链接
 * @param {string} permalink - postView 中的相对路径 permalink
 * @param {string} blogName - 博客名（子域名前缀）
 * @returns {string} 完整 URL，无 permalink 时返回空串
 */
export function buildPermalink(permalink, blogName) {
  return permalink ? `https://${blogName}.lofter.com/post/${permalink}` : ''
}

/**
 * 规范化互动数据对象，确保所有字段都有默认值 0
 * @param {object} postCountView - 原始互动数据
 * @returns {{responseCount: number, favoriteCount: number, shareCount: number, hotCount: number}}
 */
export function extractPostCountView(postCountView) {
  return {
    responseCount: postCountView.responseCount || 0,
    favoriteCount: postCountView.favoriteCount || 0,
    shareCount: postCountView.shareCount || 0,
    hotCount: postCountView.hotCount || 0
  }
}

/**
 * 清洗 digest 中的 HTML 标签和实体，提取纯文本摘要
 * 用于 API 响应中 digest 字段的快速清洗（列表项摘要不需要完整 HTML 清洗流水线）
 * @param {string} digest - 原始 HTML 摘要
 * @returns {string} 纯文本摘要
 */
export function cleanDigestText(digest) {
  return String(digest || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}
