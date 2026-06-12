/**
 * @module lib/blogParser
 * @description 博主主页数据解析模块，负责从 Lofter 博主主页 HTML 中提取结构化数据
 */

/**
 * 从博主主页数据对象中提取并结构化博主信息与博文列表
 * @param {object} dataObj - parsePageData 返回的原始数据对象
 * @param {string} sourceUrl - 原始博主主页链接
 * @returns {BlogPageExtracted} 结构化的博主主页数据
 * @throws {Error} 当数据对象结构不符合预期时抛出异常
 */
export function extractBlogPageInfo(dataObj, sourceUrl) {
  const blogDataObj = dataObj?.blogData?.data
  if (!blogDataObj) {
    throw new Error('获取博主主页数据失败')
  }

  const blogInfo = blogDataObj.blogInfo || {}
  const blogCount = blogDataObj.blogCount || {}
  const items = blogDataObj.items || []
  const offset = blogDataObj.offset || 0

  // 提取博主信息
  const blogger = {
    nickname: blogInfo.blogNickName || '未知',
    blogName: blogInfo.blogName || '未知',
    blogId: blogInfo.blogId || '未知',
    avatarUrl: blogInfo.bigAvaImg || '',
    selfIntro: blogInfo.selfIntro || '',
    imageProtected: blogInfo.imageProtected || false,
    extraBits: blogInfo.extraBits || 0,
    isAuth: blogInfo.isAuth || false,
    publicPostCount: blogCount.publicPostCount || 0,
    followerCount: blogCount.followerCount || 0
  }

  // 提取博文列表
  const postList = items.map(item => {
    const postView = item.postData?.postView || {}
    const postCountView = item.postData?.postCountView || {}

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
        blogName: blogInfo.blogName || '未知'
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
    blogger,
    postList,
    offset,
    sourceUrl
  }
}

/**
 * @typedef {object} BlogPageExtracted
 * @property {BlogPageBlogger} blogger - 博主信息
 * @property {BlogPagePost[]} postList - 博文列表
 * @property {number} offset - 下一页偏移量
 * @property {string} sourceUrl - 原始博主主页链接
 */

/**
 * @typedef {object} BlogPageBlogger
 * @property {string} nickname - 博主昵称
 * @property {string} blogName - 博客名
 * @property {string} blogId - 博主ID
 * @property {string} avatarUrl - 头像URL
 * @property {string} selfIntro - 个人简介
 * @property {boolean} imageProtected - 是否图片保护
 * @property {number} extraBits - 额外标志位
 * @property {boolean} isAuth - 是否认证
 * @property {number} publicPostCount - 公开博文数
 * @property {number} followerCount - 粉丝数
 */

/**
 * @typedef {object} BlogPagePost
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
 * @property {string} blogInfo.blogName - 博客名
 * @property {object} postCountView - 互动数据
 * @property {number} postCountView.responseCount - 回复数
 * @property {number} postCountView.favoriteCount - 点赞数
 * @property {number} postCountView.shareCount - 推荐数
 * @property {number} postCountView.hotCount - 热度
 */