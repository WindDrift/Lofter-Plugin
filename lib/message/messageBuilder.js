/**
 * @module lib/messageBuilder
 * @description 消息文本构建模块，负责组装各类消息的纯文本内容
 *
 * 发送相关函数（makeForwardMsg, sendImageNormal, recallMessage）已迁移至 lib/sender.js
 */

import { formatDateTime } from '../core/utils.js'

/**
 * 替换合并转发 XML 模板中的默认标题为自定义标题
 * 若模板版本变更导致替换失败，原数据不会被破坏（按字符串片段存在性判断）
 * @param {object} msgNode - 合并转发消息节点
 * @param {string} title - 自定义标题
 * @returns {object} 替换后的消息节点（输入失败时原样返回）
 */
export function applyForwardTitle(msgNode, title) {
  if (!msgNode?.data || typeof msgNode.data !== 'string') return msgNode

  const safeTitle = String(title || '').slice(0, 60)
  if (!safeTitle) return msgNode

  if (
    !msgNode.data.includes('转发的聊天记录') &&
    !msgNode.data.includes('群聊的聊天记录') &&
    !msgNode.data.includes('[聊天记录]')
  ) {
    return msgNode
  }

  let data = msgNode.data
  data = data.replace(
    /<title color="#000000" size="34">转发的聊天记录<\/title>/g,
    `<title color="#000000" size="34">${safeTitle}</title>`
  )
  data = data.replace(
    /<title size="34" color="#000000" margin="15,0,15,0">群聊的聊天记录<\/title>/g,
    `<title size="34" color="#000000" margin="15,0,15,0">${safeTitle}</title>`
  )
  data = data.replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___LOFTER_TITLE_PLACEHOLDER___')
  data = data.replace(/___LOFTER_TITLE_PLACEHOLDER___/g, `<title color="#777777" size="26">${safeTitle}</title>`)
  data = data.replace(/brief="\[聊天记录\]"/g, `brief="[${safeTitle}]"`)
  data = data.replace(/brief="\[转发的聊天记录\]"/g, `brief="[${safeTitle}]"`)

  msgNode.data = data
  return msgNode
}

/**
 * 构建博主信息消息
 * @param {BloggerInfo} blogger - 博主信息对象
 * @returns {string} 格式化的博主信息文本
 */
export function buildBloggerMessage(blogger) {
  return `${blogger.nickname}\n${blogger.blogName}.lofter.com\nID：${blogger.blogId}`
}

/**
 * 构建博文基础信息消息
 * @param {PostInfo & {publishDateTimeStr: string}} post - 博文信息对象
 * @returns {string} 格式化的博文信息文本
 */
export function buildPostInfoMessage(post) {
  let msg = `博文链接：${post.url}\n发布时间：${post.publishDateTimeStr}\nID：${post.postId}`
  if (post.inlineTags && post.inlineTags.length > 0) {
    msg += `\n标签：${post.inlineTags.join(', ')}`
  }
  return msg
}

/**
 * 构建标签链接消息
 * @param {string[]} tagList - 标签列表
 * @returns {string} 格式化的标签链接文本
 */
export function buildTagLinksMessage(tagList) {
  let msg = '标签链接：'
  tagList.forEach((tag) => {
    const encodedTag = encodeURIComponent(tag)
    msg += `\n#${tag}：https://www.lofter.com/tag/${encodedTag}`
  })
  return msg
}

/**
 * 构建互动数据消息
 * @param {InteractionInfo} interaction - 互动数据对象
 * @returns {string} 格式化的互动数据文本
 */
export function buildInteractionMessage(interaction) {
  return `${interaction.responseCount} 回复丨${interaction.favoriteCount} 点赞丨${interaction.shareCount} 推荐\n${interaction.subscribeCount} 收藏丨${interaction.hotCount} 热度`
}

/**
 * 构建合集信息消息
 * @param {CollectionInfo} collection - 合集信息对象
 * @returns {string} 格式化的合集信息文本
 */
export function buildCollectionMessage(collection) {
  if (!collection) return ''
  const progress = collection.currentIndex
    ? `第 ${collection.currentIndex}/${collection.postCount} 篇`
    : `${collection.postCount} 篇`
  let msg = `合集：${collection.name}（${progress}）`
  if (collection.description) {
    msg += `\n简介：${collection.description}`
  }
  return msg
}

/**
 * 构建合集文章选择列表消息
 * @param {CollectionInfo} collection - 合集信息对象
 * @param {number} [limit=10] - 最多显示的条目数
 * @returns {string} 格式化的列表文本
 */
export function buildCollectionListMessage(collection, limit = 10) {
  if (!collection || !collection.posts || collection.posts.length === 0) return ''

  const lines = [`【${collection.name}】同合集文章：`]
  const displayPosts = collection.posts.slice(0, limit)
  displayPosts.forEach((post, index) => {
    const marker = index + 1 === collection.currentIndex ? '▶' : ' '
    lines.push(`${marker}${index + 1}. ${post.title}`)
  })

  if (collection.posts.length > limit) {
    lines.push(`……还有 ${collection.posts.length - limit} 篇未显示`)
  }

  if (collection.currentIndex && collection.currentIndex > limit) {
    lines.push(`（当前为第 ${collection.currentIndex} 篇，未在上方列表中显示）`)
  }

  lines.push(`\n回复 “#lofter解析 序号” 可解析对应文章`)
  return lines.join('\n')
}

/**
 * 构建原图链接列表消息
 * @param {ImageLink[]} photoLinks - 图片链接对象数组
 * @returns {string} 格式化的原图链接文本
 */
export function buildImageLinksMessage(photoLinks) {
  let msg = '原图链接：'
  photoLinks.forEach((link, index) => {
    let imgUrl = link.orign || link.raw
    if (imgUrl) {
      imgUrl = imgUrl.split('?')[0]
      msg += `\n图${index + 1}：${imgUrl}`
    }
  })
  return msg
}

/**
 * 构建单张图片的原图链接文本
 * @param {number} index - 图片序号（从 0 开始）
 * @param {string} imgUrl - 原图 URL
 * @returns {string}
 */
export function buildImageOriginMessage(index, imgUrl) {
  return `图${index + 1}原图：${imgUrl}`
}

/**
 * 构建解析统计消息
 * @param {object} stats
 * @returns {string}
 */
export function buildParseStatsMessage(stats) {
  return `${stats.textCount} 字丨${stats.paragraphCount} 自然段\n${stats.imageCount} 张图片\n耗时 ${stats.elapsedSeconds} 秒\n今日解析 ${stats.todayCount} 次丨本群 ${stats.groupCount} 次`
}

/**
 * 构建博主主页列表消息
 * @param {object} blogPage - 博主主页数据
 * @param {object} config - 配置对象
 * @param {string} [sort='new'] - 当前排序方式
 * @returns {Array<string|ListMessageItem>} 消息数组
 */
export function buildBlogListMessages(blogPage, config, sort = 'new') {
  const messages = []

  if (config.sendBlogInfo !== false) {
    const blogger = blogPage.blogger
    const followerText = blogger.followerCount === -1 ? '私密' : blogger.followerCount
    const lines = [
      `博主：${blogger.nickname}`,
      `博客：${blogger.blogName}.lofter.com`,
      `ID：${blogger.blogId}`,
      `博文：${blogger.publicPostCount} | 粉丝：${followerText}`
    ]
    if (blogger.selfIntro) {
      lines.push(`简介：${blogger.selfIntro}`)
    }
    messages.push(lines.join('\n'))
  }

  if (blogPage.postList && blogPage.postList.length > 0) {
    blogPage.postList.forEach((item, index) => {
      const text = buildListItemLine(item, index + 1, false, { newMetaFormat: true })
      messages.push({ text, thumbnailUrl: item.thumbnailUrl || '' })
    })
  } else {
    messages.push({ text: '暂无博文', thumbnailUrl: '' })
  }

  const sortHint = sort === 'hot' ? '当前按热度排序，翻页仍按热度展示' : '当前按最新排序'
  messages.push({
    text: `${sortHint}\n回复 “#lofter解析 序号” 可解析对应文章\n回复 “#lofter下一页” 查看更多`,
    thumbnailUrl: ''
  })

  return messages
}

/**
 * 构建标签页列表消息
 * @param {object} tagPage - 标签页数据
 * @param {object} config - 配置对象
 * @returns {Array<string|ListMessageItem>} 消息数组
 */
export function buildTagListMessages(tagPage, config) {
  const messages = []

  if (config.sendTagInfo !== false) {
    const tag = tagPage.tag
    messages.push(`标签：#${tag.name} | 帖子数：${tag.postCount}`)
  }

  if (tagPage.items && tagPage.items.length > 0) {
    tagPage.items.forEach((item, index) => {
      const text = buildListItemLine(item, index + 1, true, { newMetaFormat: true })
      messages.push({ text, thumbnailUrl: item.thumbnailUrl || '' })
    })
  } else {
    messages.push({ text: '暂无帖子', thumbnailUrl: '' })
  }

  messages.push({
    text: '回复 “#lofter解析 序号” 可解析对应文章\n回复 “#lofter标签下一页” 查看更多',
    thumbnailUrl: ''
  })

  return messages
}

/**
 * @typedef {object} ListMessageItem
 * @property {string} text - 文本内容
 * @property {string} thumbnailUrl - 缩略图 URL
 */

/**
 * 构建列表项单行
 * @param {object} item - 列表项
 * @param {number} index - 序号
 * @param {boolean} showBlogger - 是否显示博主信息（标签页需要）
 * @param {object} [options={}] - 额外选项
 * @param {boolean} [options.newMetaFormat] - 是否使用新的统计信息格式（时间换行 + N 图片丨M 热度）
 * @returns {string} 格式化的列表项文本
 */
function buildListItemLine(item, index, showBlogger, options = {}) {
  const typeLabel = getTypeLabel(item.type)
  const topLabel = item.isTop ? '【置顶】' : ''
  const title = typeLabel ? `【${typeLabel}】${item.title || '无标题'}` : item.title || '无标题'
  const lines = [`${index}. ${topLabel}${title}`]

  if (showBlogger && item.blogInfo) {
    lines.push(`博主：${item.blogNickName || item.blogInfo.blogNickName || item.blogInfo.blogName || '未知'}`)
  }

  const digest = truncateDigest(item.digest)
  if (digest) {
    lines.push(`摘要：${digest}`)
  }

  const timeStr = item.publishTime ? formatDateTime(item.publishTime) : '未知时间'
  const photoStr = item.photoCount > 0 ? `${item.photoCount} 图片` : ''
  const hotStr = item.postCountView?.hotCount > 0 ? `${item.postCountView.hotCount} 热度` : ''

  const metaParts = [photoStr, hotStr].filter(Boolean)
  if (options.newMetaFormat) {
    lines.push(timeStr)
    if (metaParts.length > 0) {
      lines.push(metaParts.join('丨'))
    }
  } else {
    metaParts.unshift(timeStr)
    if (metaParts.length > 0) {
      lines.push(metaParts.join('丨'))
    }
  }

  if (item.tagList && item.tagList.length > 0) {
    lines.push(`标签：${item.tagList.join(', ')}`)
  }

  return lines.join('\n')
}

function truncateDigest(digest) {
  const text = String(digest || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > 80 ? `${text.slice(0, 80)}...` : text
}

function getTypeLabel(type) {
  const map = {
    text: '文',
    photo: '图',
    long: '长文',
    video: '视频',
    music: '音乐'
  }
  return map[type] || ''
}
