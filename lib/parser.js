/**
 * @module lib/parser
 * @description 数据解析模块，负责从 Lofter 页面 HTML 中提取结构化的博文数据
 *
 * 增强点（F-08）：extractPostInfo 增加 digest 字段的多级回退链
 *  - textPostView.content → postView.content → postView.digest → postView.desc
 */

/**
 * 从 Lofter 页面 HTML 中提取 window.__initialize_data__ JSON 数据
 * @param {string} html - 页面原始 HTML
 * @returns {object} 解析后的数据对象
 * @throws {Error} 当页面中未找到数据或 JSON 解析失败时抛出异常
 */
export function parsePageData(html) {
  const dataMatch = html.match(/window\.__initialize_data__\s*=\s*(\{[\s\S]*?\})<\/script>/)
  if (!dataMatch) {
    throw new Error('未能在页面中找到解析数据')
  }

  let dataObj
  try {
    dataObj = JSON.parse(dataMatch[1])
  } catch (err) {
    throw new Error(`Lofter 数据 JSON 解析失败: ${err.message} (html.length=${html.length})`)
  }

  return dataObj
}

/**
 * 从原始数据对象中提取并结构化博文信息
 * @param {object} dataObj - parsePageData 返回的原始数据对象
 * @param {string} url - 原始博文链接（用于回填）
 * @returns {PostExtracted} 结构化的博文数据
 * @throws {Error} 当数据对象结构不符合预期时抛出异常
 */
export function extractPostInfo(dataObj, url) {
  const postDataObj = dataObj?.postData?.data
  if (!postDataObj) {
    throw new Error('获取博文数据失败')
  }

  const blogInfo = postDataObj.blogInfo || {}
  const postView = postDataObj.postData?.postView || {}
  const postCount = postDataObj.postData?.postCountView || {}

  // 提取图片链接列表
  const photoLinks = postView.photoPostView?.photoLinks || []
  const hasImages = photoLinks.length > 0

  // 提取正文：多级回退（F-08）
  const digest = extractDigest(postView, hasImages)

  return {
    // 博主信息
    blogger: {
      nickname: blogInfo.blogNickName || '未知',
      blogName: blogInfo.blogName || '未知',
      blogId: blogInfo.blogId || '未知',
      avatarUrl: blogInfo.bigAvaImg || '',
      imageProtected: blogInfo.imageProtected || false
    },
    // 博文信息
    post: {
      title: postView.title || '无标题',
      publishTime: postView.publishTime || Date.now(),
      postId: postView.id || '未知',
      url,
      digest,
      hasImages,
      photoLinks,
      tagList: postView.tagList || []
    },
    // 互动数据
    interaction: {
      responseCount: postCount.responseCount || 0,
      favoriteCount: postCount.favoriteCount || 0,
      shareCount: postCount.shareCount || 0,
      subscribeCount: postCount.subscribeCount || 0,
      hotCount: postCount.hotCount || 0
    }
  }
}

/**
 * 提取博文正文，多级回退以兼容 Lofter 多种结构（F-08）
 * 优先级：textPostView.content → postView.content → postView.digest → postView.desc → ''
 * @param {object} postView - 博文视图数据
 * @param {boolean} hasImages - 是否为图文博文
 * @returns {string} 清洗前的原始 HTML 文本
 */
function extractDigest(postView, hasImages) {
  // 纯文博文优先取 textPostView.content
  if (!hasImages && postView.textPostView?.content) {
    return postView.textPostView.content
  }
  // 通用 content 字段
  if (postView.content) {
    return postView.content
  }
  // digest 摘要
  if (postView.digest) {
    return postView.digest
  }
  // desc 摘要（部分博文可能使用此字段）
  if (postView.desc) {
    return postView.desc
  }
  return ''
}

/**
 * 从图片链接对象中提取最佳原图 URL
 * 优先使用 orign 字段（更稳定），回退到 raw 字段
 * @param {ImageLink} link - 图片链接对象
 * @returns {string|null} 清理后的原图 URL，无可用链接时返回 null
 */
export function extractImageUrl(link) {
  let imgUrl = link.orign || link.raw
  if (!imgUrl) return null
  // 移除 URL 查询参数，确保获取完整原图
  return imgUrl.split('?')[0]
}

/**
 * 从图片 URL 中提取文件扩展名
 * @param {string} imgUrl - 图片 URL
 * @returns {string} 文件扩展名（如 jpg、png），无法识别时默认返回 jpg
 */
export function extractImageExt(imgUrl) {
  const extMatch = imgUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
  return extMatch ? extMatch[1] : 'jpg'
}
