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
 * 解析移动端 API 响应，提取标签页帖子列表
 * 参考 lofterSpider/l15_phone_tag.py 的数据结构
 * @param {object} apiData - fetchTagPageByAPI 返回的 data 对象
 * @param {string} tagName - 标签名
 * @param {string} sort - 排序方式
 * @returns {{ items: TagPagePost[], offset: number }} 解析后的帖子列表和下一页偏移
 */
export function parseAPIResponse(apiData, tagName, sort = 'new') {
  const typeMap = {
    1: 'text',
    2: 'photo',
    3: 'long',
    4: 'video',
    5: 'music'
  }

  const list = apiData?.list || []
  const offset = apiData?.offset || 0

  const items = list.map(item => {
    const postView = item.postData?.postView || {}
    const postCount = item.postData?.postCount || {}
    const blogInfo = item.blogInfo || {}

    // 从 digest 中提取纯文本摘要
    const digest = (postView.digest || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim()

    return {
      title: postView.title || '无标题',
      digest,
      type: typeMap[postView.type] || 'unknown',
      blogNickName: blogInfo.blogNickName || '未知',
      publishTime: postView.publishTime || 0,
      photoCount: postView.photoCount || 0,
      permalink: postView.permalink
        ? `https://${blogInfo.blogName}.lofter.com/post/${postView.permalink}`
        : '',
      tagList: postView.tagList || [],
      forbidShare: postView.forbidShare === 1,
      blogInfo: {
        blogNickName: blogInfo.blogNickName || '未知',
        blogName: blogInfo.blogName || '未知',
        blogId: blogInfo.blogId || '未知',
        imageProtected: blogInfo.imageProtected || false,
        extraBits: blogInfo.extraBits || 0
      },
      postCountView: {
        responseCount: postCount.responseCount || 0,
        favoriteCount: postCount.favoriteCount || 0,
        shareCount: postCount.shareCount || 0,
        hotCount: postCount.hotCount || 0
      }
    }
  })

  return { items, offset }
}

// 类型定义已迁移至 lib/types.js，此处保留 re-export 以保持向后兼容
/** @typedef {import('../core/types.js').TagPageExtracted} TagPageExtracted */
/** @typedef {import('../core/types.js').TagInfo} TagInfo */
/** @typedef {import('../core/types.js').TagPagePost} TagPagePost */
