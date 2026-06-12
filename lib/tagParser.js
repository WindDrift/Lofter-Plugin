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
      type: postView.type || 'unknown',
      publishTime: postView.publishTime || 0,
      photoCount: postView.photoCount || 0,
      ccType: postView.ccType || 0,
      permalink: postView.permalink || '',
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
 * @typedef {object} TagPageExtracted
 * @property {TagInfo} tag - 标签信息
 * @property {TagPagePost[]} items - 博文列表
 * @property {number} page - 当前页码
 * @property {number} offset - 下一页偏移量
 * @property {string} sort - 排序方式
 * @property {string} sourceUrl - 原始标签页链接
 */

/**
 * @typedef {object} TagInfo
 * @property {string} name - 标签名
 * @property {number} postCount - 帖子总数
 */

/**
 * @typedef {object} TagPagePost
 * @property {string} title - 博文标题
 * @property {string} type - 博文类型
 * @property {number} publishTime - 发布时间戳
 * @property {number} photoCount - 图片数量
 * @property {number} ccType - CC协议类型
 * @property {string} permalink - 永久链接
 * @property {string[]} tagList - 标签列表
 * @property {boolean} forbidShare - 是否禁止分享
 * @property {boolean} fansVipPost - 是否粉丝专属
 * @property {object} blogInfo - 博主信息
 * @property {string} blogInfo.blogNickName - 博主昵称
 * @property {string} blogInfo.blogName - 博客名
 * @property {string} blogInfo.blogId - 博主ID
 * @property {boolean} blogInfo.imageProtected - 是否图片保护
 * @property {number} blogInfo.extraBits - 额外标志位
 * @property {boolean} blogInfo.isAuth - 是否认证
 * @property {object} postCountView - 互动数据
 * @property {number} postCountView.responseCount - 回复数
 * @property {number} postCountView.favoriteCount - 点赞数
 * @property {number} postCountView.shareCount - 推荐数
 * @property {number} postCountView.hotCount - 热度
 */