/**
 * @module lib/parser
 * @description 数据解析模块，负责从 Lofter 页面 HTML 中提取结构化的博文数据
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
    throw new Error('Lofter 数据 JSON 解析失败')
  }

  return dataObj
}

/**
 * 从原始数据对象中提取并结构化博文信息
 * @param {object} dataObj - parsePageData 返回的原始数据对象
 * @param {string} url - 原始博文链接（用于回填）
 * @returns {object} 结构化的博文数据，包含博主信息、博文内容、互动数据等
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

  // 提取正文摘要：纯文博文优先使用完整内容，否则使用 digest 字段
  let digest = ''
  if (!hasImages && postView.textPostView?.content) {
    digest = postView.textPostView.content
  } else {
    digest = postView.digest || ''
  }

  return {
    // 博主信息
    blogger: {
      nickname: blogInfo.blogNickName || '未知',
      blogName: blogInfo.blogName || '未知',
      blogId: blogInfo.blogId || '未知',
      avatarUrl: blogInfo.bigAvaImg || ''
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
 * 从图片链接对象中提取最佳原图 URL
 * 优先使用 orign 字段（更稳定），回退到 raw 字段
 * @param {object} link - 图片链接对象，包含 orign / raw 字段
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
