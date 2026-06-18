/**
 * @module lib/parse/collectionParser
 * @description 合集信息解析模块，负责从移动端 blogHomePage API 响应中提取合集数据
 */

/**
 * 从博主主页 API 响应中提取目标博文的合集信息
 * @param {object} homePageResponse - fetchBlogHomePageByAPI 返回的 response 对象
 * @param {number|string} targetPostId - 目标博文 ID
 * @returns {CollectionInfo|null} 合集信息，无合集时返回 null
 */
export function extractCollectionInfo(homePageResponse, targetPostId) {
  const postCollection = homePageResponse?.postCollection
  if (!postCollection || !postCollection.id) return null

  const posts = homePageResponse?.posts || []
  const collectionId = postCollection.id
  const targetId = normalizePostId(targetPostId)

  const collectionPosts = posts
    .filter((item) => item?.post?.collectionId === collectionId)
    .map((item) => ({
      postId: item.post.id,
      title: item.post.title || '无标题',
      publishTime: item.post.publishTime || 0
    }))
    .sort((a, b) => a.publishTime - b.publishTime)

  const targetIndex = collectionPosts.findIndex((p) => normalizePostId(p.postId) === targetId)

  return {
    id: collectionId,
    name: postCollection.name || '未命名合集',
    description: postCollection.description || '',
    postCount: postCollection.postCount || collectionPosts.length,
    currentIndex: targetIndex >= 0 ? targetIndex + 1 : null,
    posts: collectionPosts
  }
}

/**
 * 统一 postId 为字符串，便于跨来源比较
 * @param {number|string} postId
 * @returns {string}
 */
function normalizePostId(postId) {
  return String(postId || '')
}
