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
    followerCount: blogCount.followerCount || 0
  }

  // 提取博文列表
  const postList = items.map((item) => {
    const postView = item.postData?.postView || {}
    const postCountView = item.postData?.postCountView || {}

    return {
      title: postView.title || '无标题',
      digest: extractDigestText(postView),
      type: resolvePostType(postView.type),
      publishTime: postView.publishTime || 0,
      photoCount: postView.photoCount || 0,
      ccType: postView.ccType || 0,
      permalink: buildPermalink(postView.permalink, blogInfo.blogName),
      tagList: postView.tagList || [],
      forbidShare: postView.forbidShare || false,
      fansVipPost: postView.fansVipPost || false,
      blogInfo: {
        blogName: blogInfo.blogName || '未知'
      },
      postCountView: extractPostCountView(postCountView)
    }
  })

  return {
    blogger,
    postList,
    offset,
    sourceUrl
  }
}

// 类型定义已迁移至 lib/types.js，此处保留 re-export 以保持向后兼容
/** @typedef {import('../core/types.js').BlogPageExtracted} BlogPageExtracted */
/** @typedef {import('../core/types.js').BlogPageBlogger} BlogPageBlogger */
/** @typedef {import('../core/types.js').BlogPagePost} BlogPagePost */
