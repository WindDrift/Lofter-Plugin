/**
 * @module lib/tagParser
 * @description 标签页数据解析模块，负责从 Lofter 标签页 HTML 中提取结构化数据
 */

/**
 * 从标签页数据对象中提取并结构化标签信息与博文列表
 * @param {object} dataObj - parsePageData 返回的原始数据对象
 * @param {string} sourceUrl - 原始标签页链接
 * @param {string} sort - 排序方式（new/hot）
 * @returns {TagPageExtracted} 结构化的标签页数据
 * @throws {Error} 当数据对象结构不符合预期时抛出异常
 */
export function extractTagPageInfo(dataObj, sourceUrl, sort = 'new') {
  const typeMap = {
    1: 'text',
    2: 'photo',
    3: 'long',
    4: 'video',
    5: 'music'
  }
  const tagDataObj = dataObj?.tagInfoData
  if (!tagDataObj) {
    throw new Error('获取标签页数据失败')
  }

  const tagInfo = tagDataObj.tagInfo || {}
  const postList = tagDataObj.postList || []
  const offset = tagDataObj.offset || 0
  const page = tagDataObj.page || 1

  // 提取标签信息
  const tag = {
    name: tagInfo.name || '未知',
    postCount: tagInfo.postCount || 0
  }

  // 提取博文列表
  const items = postList.map(item => {
    const postView = item.postView || {}
    const blogInfo = item.blogInfo || {}
    const postCountView = item.postCountView || {}

    return {
      title: postView.title || '无标题',
      digest: postView.content || postView.digest || postView.desc || '',
      type: typeMap[postView.type] || postView.type || 'unknown',
      blogNickName: blogInfo.blogNickName || '未知',
      publishTime: postView.publishTime || 0,
      photoCount: postView.photoCount || 0,
      ccType: postView.ccType || 0,
      permalink: postView.permalink ? `https://${blogInfo.blogName}.lofter.com/post/${postView.permalink}` : '',
      tagList: postView.tagList || [],
      forbidShare: postView.forbidShare || false,
      fansVipPost: postView.fansVipPost || false,
      blogInfo: {
        blogNickName: blogInfo.blogNickName || '未知',
        blogName: blogInfo.blogName || '未知',
        blogId: blogInfo.blogId || '未知',
        imageProtected: blogInfo.imageProtected || false,
        extraBits: blogInfo.extraBits || 0,
        isAuth: blogInfo.isAuth || false
      },
      postCountView: {
        responseCount: postCountView.responseCount || 0,
        favoriteCount: postCountView.favoriteCount || 0,
        shareCount: postCountView.shareCount || 0,
        hotCount: postCountView.hotCount || 0
      }
    }
  })

  return {
    tag,
    items,
    page,
    offset,
    sort,
    sourceUrl
  }
}

/**
 * 解析 DWR 响应，提取标签页帖子列表
 * @param {string} dwrText - DWR 响应文本
 * @param {string} tagName - 标签名（用于构建 URL）
 * @param {string} sort - 排序方式
 * @returns {{ items: TagPagePost[], lastTimestamp: number }} 解析后的帖子列表和最后时间戳
 */
export function parseDWRResponse(dwrText, tagName, sort = 'new') {
  const items = []
  let lastTimestamp = 0

  // 按 activityTags 分割，每个帖子的数据在 activityTags 之后
  const segments = dwrText.split('activityTags').slice(1) || []

  for (const segment of segments) {
    try {
      // 提取 blogPageUrl
      const urlMatch = segment.match(/s\d{1,5}\.blogPageUrl="(.*?)"/)
      if (!urlMatch) continue
      const blogPageUrl = urlMatch[1]

      // 提取 blogNickName
      const nicknameMatch = segment.match(/s\d{1,5}\.blogNickName="(.*?)"/)
      let blogNickName = '未知'
      if (nicknameMatch) {
        try {
          blogNickName = nicknameMatch[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        } catch { blogNickName = nicknameMatch[1] }
      }

      // 提取 blogName (从 URL 中提取)
      const blogNameMatch = blogPageUrl.match(/https?:\/\/(.*?)\.lofter\.com/)
      const blogName = blogNameMatch ? blogNameMatch[1] : '未知'

      // 提取 publishTime
      const pubTimeMatch = segment.match(/s\d{1,5}\.publishTime=(.*?);/)
      const publishTime = pubTimeMatch ? parseInt(pubTimeMatch[1]) : 0
      if (publishTime > lastTimestamp) lastTimestamp = publishTime

      // 提取 title
      const titleMatch = segment.match(/s\d{1,5}\.title="(.*?)"/)
      let title = '无标题'
      if (titleMatch) {
        try {
          title = titleMatch[1].replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        } catch { title = titleMatch[1] }
      }

      // 提取 content (用于 digest)
      const contentMatch = segment.match(/s\d{1,5}\.content="(.*?)";/)
      let content = ''
      if (contentMatch) {
        content = contentMatch[1]
          .replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim()
      }

      // 提取 hot
      const hotMatch = segment.match(/s\d{1,5}\.hot=(.*?);/)
      const hotCount = hotMatch ? parseInt(hotMatch[1]) : 0

      // 提取 type (从 originPhotoLinks 或 compositeContent 判断)
      let type = 'text'
      if (segment.includes('originPhotoLinks="[')) type = 'photo'
      else if (segment.includes('compositeContent=')) type = 'long'

      // 提取 permalink
      const permalinkMatch = segment.match(/s\d{1,5}\.permalink="(.*?)"/)
      const permalink = permalinkMatch ? permalinkMatch[1] : ''

      // 提取 originPhotoLinks
      const photoLinksMatch = segment.match(/originPhotoLinks="(\[.*?\])"/)
      let photoCount = 0
      if (photoLinksMatch) {
        try {
          const linksStr = photoLinksMatch[1].replace(/\\/g, '')
          const links = JSON.parse(linksStr)
          photoCount = links.length
        } catch { photoCount = 0 }
      }

      items.push({
        title,
        digest: content.slice(0, 200),
        type,
        blogNickName,
        blogInfo: {
          blogNickName,
          blogName,
          blogId: 'unknown'
        },
        publishTime,
        photoCount,
        permalink: `https://${blogName}.lofter.com/post/${permalink}`,
        tagList: [],
        postCountView: {
          responseCount: 0,
          favoriteCount: 0,
          shareCount: 0,
          hotCount
        }
      })
    } catch (err) {
      logger.debug?.(`[Lofter解析] parseDWRResponse 解析单条失败: ${err.message}`)
    }
  }

  return { items, lastTimestamp }
}

// 类型定义已迁移至 lib/types.js，此处保留 re-export 以保持向后兼容
/** @typedef {import('../core/types.js').TagPageExtracted} TagPageExtracted */
/** @typedef {import('../core/types.js').TagInfo} TagInfo */
/** @typedef {import('../core/types.js').TagPagePost} TagPagePost */
