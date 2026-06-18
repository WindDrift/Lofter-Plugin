/**
 * @module lib/blogParser
 * @description 博主主页数据解析模块，负责从 Lofter 博主主页 HTML 中提取结构化数据
 */

import { resolvePostType, extractDigestText, buildPermalink, extractPostCountView } from './parserBase.js'

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
    followerCount: typeof blogCount.followerCount === 'number' ? blogCount.followerCount : 0
  }

  // 提取博文列表
  const postList = items.map((item) => {
    const postView = item.postData?.postView || {}
    const postCountView = item.postData?.postCountView || {}

    return buildBlogPagePost(postView, postCountView, blogInfo)
  })

  return {
    blogger,
    postList,
    offset,
    sourceUrl
  }
}

/**
 * 从移动端 blogHomePage API 响应中解析博主主页数据
 * @param {object} response - fetchBlogHomePageByAPI 返回的 response 对象
 * @param {string} blogName - 博主名
 * @returns {BlogPageExtracted} 结构化的博主主页数据
 */
export function parseBlogHomePageResponse(response, blogName) {
  const blogInfo = response?.blogInfo || {}
  const blogCount = response?.blogCount || {}
  const posts = response?.posts || []
  const topPost = response?.topPost
  const offset = response?.offset || 0

  const blogger = {
    nickname: blogInfo.blogNickName || '未知',
    blogName: blogInfo.blogName || blogName || '未知',
    blogId: blogInfo.blogId || '未知',
    avatarUrl: blogInfo.bigAvaImg || '',
    selfIntro: blogInfo.selfIntro || '',
    imageProtected: blogInfo.imageProtected || false,
    extraBits: blogInfo.extraBits || 0,
    isAuth: blogInfo.isAuth || false,
    publicPostCount: blogCount.publicPostCount || 0,
    followerCount: typeof blogCount.followerCount === 'number' ? blogCount.followerCount : 0
  }

  const postList = []
  if (topPost?.post) {
    const pinned = buildBlogPagePostFromAPI(topPost.post, blogInfo, true)
    postList.push(pinned)
  }

  posts.forEach((item) => {
    if (item?.post) {
      postList.push(buildBlogPagePostFromAPI(item.post, blogInfo, false))
    }
  })

  return {
    blogger,
    postList,
    offset,
    sourceUrl: `https://${blogName}.lofter.com/`
  }
}

/**
 * 从 HTML 解析的 postView 构建标准 BlogPagePost
 * @param {object} postView
 * @param {object} postCountView
 * @param {object} blogInfo
 * @returns {BlogPagePost}
 */
function buildBlogPagePost(postView, postCountView, blogInfo) {
  return {
    title: postView.title || '无标题',
    digest: extractDigestText(postView),
    type: resolvePostType(postView.type),
    blogNickName: blogInfo.blogNickName || '未知',
    publishTime: postView.publishTime || 0,
    photoCount: postView.photoCount || 0,
    thumbnailUrl: postView.firstImage?.orign || '',
    ccType: postView.ccType || 0,
    permalink: buildPermalink(postView.permalink, blogInfo.blogName),
    tagList: postView.tagList || [],
    forbidShare: postView.forbidShare || false,
    fansVipPost: postView.fansVipPost || false,
    blogInfo: {
      blogName: blogInfo.blogName || '未知'
    },
    postCountView: extractPostCountView(postCountView),
    isTop: false
  }
}

/**
 * 从 API post 构建标准 BlogPagePost
 * @param {object} post
 * @param {object} blogInfo
 * @param {boolean} isTop
 * @returns {BlogPagePost}
 */
function buildBlogPagePostFromAPI(post, blogInfo, isTop) {
  const postCount = post.postCount || {}
  return {
    title: post.title || '无标题',
    digest: extractDigestText(post),
    type: resolvePostType(post.type),
    blogNickName: blogInfo.blogNickName || '未知',
    publishTime: post.publishTime || 0,
    photoCount: post.photoCount || 0,
    thumbnailUrl: post.firstImageUrl || post.firstSmallImageUrl || '',
    ccType: post.cctype || 0,
    permalink: buildPermalink(post.permalink, blogInfo.blogName),
    tagList: post.tagList || [],
    forbidShare: post.forbidShare === 1,
    fansVipPost: post.fansVipPost || false,
    blogInfo: {
      blogName: blogInfo.blogName || '未知'
    },
    postCountView: extractPostCountView(postCount),
    isTop
  }
}

// 类型定义已迁移至 lib/types.js，此处保留 re-export 以保持向后兼容
/** @typedef {import('../core/types.js').BlogPageExtracted} BlogPageExtracted */
/** @typedef {import('../core/types.js').BlogPageBlogger} BlogPageBlogger */
/** @typedef {import('../core/types.js').BlogPagePost} BlogPagePost */
