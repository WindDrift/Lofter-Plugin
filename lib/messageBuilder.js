/**
 * @module lib/messageBuilder
 * @description 消息构建模块，负责组装各类消息内容并处理不同发送模式（合并转发/逐条发送）
 */

import fs from 'node:fs'
import { formatDateTime } from './utils.js'

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

  // 若 Yunzai 模板中已不存在可识别的占位符，跳过替换（保留原数据）
  if (!msgNode.data.includes('转发的聊天记录') &&
      !msgNode.data.includes('群聊的聊天记录') &&
      !msgNode.data.includes('[聊天记录]')) {
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
  // 次级标题替换（占位符链式）
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
  tagList.forEach(tag => {
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
 * 构建合并转发消息结构体
 * @param {object} e - 云崽消息事件对象
 * @param {Array} msgList - 消息内容列表
 * @param {string} [title='Lofter解析结果'] - 合并转发外显标题
 * @param {string} [nickname=''] - 合并转发内部昵称
 * @returns {Promise<object|null>} 合并转发消息节点，失败时返回 null
 */
export async function makeForwardMsg(e, msgList, title = 'Lofter解析结果', nickname = '') {
  const forwardMsg = []
  const bot = e.bot || global.Bot || {}

  for (const msg of msgList) {
    forwardMsg.push({
      user_id: bot.uin || 123456,
      nickname: nickname || bot.nickname || 'Bot',
      message: msg
    })
  }

  let msgNode = null
  try {
    if (e.isGroup && e.group?.makeForwardMsg) {
      msgNode = await e.group.makeForwardMsg(forwardMsg)
    } else if (e.friend?.makeForwardMsg) {
      msgNode = await e.friend.makeForwardMsg(forwardMsg)
    } else if (bot.makeForwardMsg) {
      msgNode = await bot.makeForwardMsg(forwardMsg)
    }
  } catch (err) {
    logger.error('[Lofter解析] 构造合并转发失败', err)
    return null
  }

  if (msgNode) {
    return applyForwardTitle(msgNode, title)
  }
  return null
}

/**
 * 以逐条模式发送图片（根据配置决定发送原图文件或图片消息）
 * @param {object} e - 云崽消息事件对象
 * @param {string} filePath - 图片文件路径
 * @param {string} fileName - 文件名
 * @param {LofterConfig} config - 插件配置
 */
export async function sendImageNormal(e, filePath, fileName, config) {
  try {
    if (config.sendOriginal) {
      if (e.isGroup) {
        await e.group.sendFile(filePath, fileName)
      } else if (e.friend) {
        await e.friend.sendFile(filePath, fileName)
      } else {
        await e.reply(segment.image(filePath))
      }
    } else {
      await e.reply(segment.image(filePath))
    }
  } catch (sendErr) {
    logger.error(`[Lofter解析] 发送失败，尝试以 Buffer 形式发送图片: ${sendErr.message}`)
    try {
      const fileBuffer = fs.readFileSync(filePath)
      await e.reply(segment.image(fileBuffer))
    } catch (bufferErr) {
      logger.error(`[Lofter解析] Buffer 发送失败: ${bufferErr.message}`)
      await e.reply(`图片 ${fileName} 发送失败。`)
    }
  }
}

/**
 * 撤回指定的提示消息
 * 撤回失败时回退为发"解析完成"消息并尝试再次撤回，避免残留"准备解析..."提示
 * @param {object} e - 云崽消息事件对象
 * @param {object|null} prepMsg - 待撤回的消息对象（需包含 message_id）
 * @returns {Promise<boolean>} 是否成功撤回或回退处理
 */
export async function recallMessage(e, prepMsg) {
  if (!prepMsg?.message_id) return false

  // 第一次尝试撤回
  const directSuccess = await tryRecall(e, prepMsg.message_id)
  if (directSuccess) return true

  // 撤回失败：发"解析完成"作为占位并尝试再撤
  try {
    const fallback = await e.reply('解析完成。')
    if (fallback?.message_id) {
      await tryRecall(e, fallback.message_id)
    }
  } catch (err) {
    logger.error('[Lofter解析] 撤回失败且占位消息也失败', err)
  }
  return false
}

/**
 * 构建博主主页列表消息
 * @param {object} blogPage - 博主主页数据
 * @param {object} config - 配置对象
 * @returns {string[]} 消息数组
 */
export function buildBlogListMessages(blogPage, config) {
  const messages = []

  // 博主信息
  if (config.sendBlogInfo !== false) {
    const blogger = blogPage.blogger
    const lines = [
      `博主：${blogger.nickname}`,
      `博客：${blogger.blogName}.lofter.com`,
      `ID：${blogger.blogId}`,
      `博文：${blogger.publicPostCount} | 粉丝：${blogger.followerCount}`
    ]
    if (blogger.selfIntro) {
      lines.push(`简介：${blogger.selfIntro}`)
    }
    messages.push(lines.join('\n'))
  }

  // 帖子列表
  if (blogPage.postList && blogPage.postList.length > 0) {
    const listLines = blogPage.postList.map((item, index) => {
      return buildListItemLine(item, index + 1, false)
    })
    messages.push(listLines.join('\n\n'))
  } else {
    messages.push('暂无博文')
  }

  return messages
}

/**
 * 构建标签页列表消息
 * @param {object} tagPage - 标签页数据
 * @param {object} config - 配置对象
 * @returns {string[]} 消息数组
 */
export function buildTagListMessages(tagPage, config) {
  const messages = []

  // 标签信息
  if (config.sendTagInfo !== false) {
    const tag = tagPage.tag
    messages.push(`标签：#${tag.name} | 帖子数：${tag.postCount}`)
  }

  // 帖子列表
  if (tagPage.items && tagPage.items.length > 0) {
    const listLines = tagPage.items.map((item, index) => {
      return buildListItemLine(item, index + 1, true)
    })
    messages.push(listLines.join('\n\n'))
  } else {
    messages.push('暂无帖子')
  }

  return messages
}

/**
 * 构建列表项单行
 * @param {object} item - 列表项
 * @param {number} index - 序号
 * @param {boolean} showBlogger - 是否显示博主信息（标签页需要）
 * @returns {string} 格式化的列表项文本
 */
function buildListItemLine(item, index, showBlogger) {
  const lines = [`${index}. ${item.title || '无标题'}`]

  if (showBlogger && item.blogInfo) {
    lines.push(`博主：${item.blogInfo.blogNickName || item.blogInfo.blogName || '未知'}`)
  }

  const timeStr = item.publishTime ? formatDateTime(item.publishTime) : '未知时间'
  const photoStr = item.photoCount > 0 ? `图片：${item.photoCount}` : ''
  const hotStr = item.postCountView?.hotCount > 0 ? `热度：${item.postCountView.hotCount}` : ''

  const metaParts = [timeStr, photoStr, hotStr].filter(Boolean)
  if (metaParts.length > 0) {
    lines.push(metaParts.join('丨'))
  }

  if (item.tagList && item.tagList.length > 0) {
    lines.push(`标签：${item.tagList.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * 内部：根据 e 的形态选择对应 API 撤回消息
 * @param {object} e - 云崽消息事件对象
 * @param {string} messageId - 待撤回消息 ID
 * @returns {Promise<boolean>} 是否成功
 */
async function tryRecall(e, messageId) {
  try {
    if (e.group?.recallMsg) {
      await e.group.recallMsg(messageId)
      return true
    } else if (e.friend?.recallMsg) {
      await e.friend.recallMsg(messageId)
      return true
    } else if (e.bot?.deleteMsg) {
      await e.bot.deleteMsg(messageId)
      return true
    }
  } catch (err) {
    logger.debug(`[Lofter解析] 撤回消息 ${messageId} 失败`, err)
  }
  return false
}
