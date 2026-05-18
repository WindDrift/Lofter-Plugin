/**
 * @module lib/messageBuilder
 * @description 消息构建模块，负责组装各类消息内容并处理不同发送模式（合并转发/逐条发送）
 */

import fs from 'node:fs'

/**
 * 构建博主信息消息
 * @param {object} blogger - 博主信息对象
 * @param {string} blogger.nickname - 昵称
 * @param {string} blogger.blogName - 博客名
 * @param {string} blogger.blogId - 博主 ID
 * @returns {string} 格式化的博主信息文本
 */
export function buildBloggerMessage(blogger) {
  return `${blogger.nickname}\n${blogger.blogName}.lofter.com\nID：${blogger.blogId}`
}

/**
 * 构建博文基础信息消息
 * @param {object} post - 博文信息对象
 * @param {string} post.url - 博文链接
 * @param {string} post.publishDateTimeStr - 格式化的发布时间
 * @param {string} post.postId - 博文 ID
 * @returns {string} 格式化的博文信息文本
 */
export function buildPostInfoMessage(post) {
  return `博文链接：${post.url}\n发布时间：${post.publishDateTimeStr}\nID：${post.postId}`
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
 * @param {object} interaction - 互动数据对象
 * @param {number} interaction.responseCount - 回复数
 * @param {number} interaction.favoriteCount - 点赞数
 * @param {number} interaction.shareCount - 推荐数
 * @param {number} interaction.subscribeCount - 收藏数
 * @param {number} interaction.hotCount - 热度
 * @returns {string} 格式化的互动数据文本
 */
export function buildInteractionMessage(interaction) {
  return `回复: ${interaction.responseCount}\n点赞: ${interaction.favoriteCount}\n推荐: ${interaction.shareCount}\n收藏: ${interaction.subscribeCount}\n热度: ${interaction.hotCount}`
}

/**
 * 构建原图链接列表消息
 * @param {Array} photoLinks - 图片链接对象数组
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
  if (e.isGroup && e.group?.makeForwardMsg) {
    msgNode = await e.group.makeForwardMsg(forwardMsg)
  } else if (e.friend?.makeForwardMsg) {
    msgNode = await e.friend.makeForwardMsg(forwardMsg)
  } else if (bot.makeForwardMsg) {
    msgNode = await bot.makeForwardMsg(forwardMsg)
  }

  // 替换合并转发消息中的默认标题为自定义标题
  if (msgNode && msgNode.data && typeof msgNode.data === 'string') {
    msgNode.data = msgNode.data
      .replace(/<title color="#000000" size="34">转发的聊天记录<\/title>/g, `<title color="#000000" size="34">${title}</title>`)
      .replace(/<title size="34" color="#000000" margin="15,0,15,0">群聊的聊天记录<\/title>/g, `<title size="34" color="#000000" margin="15,0,15,0">${title}</title>`)
      .replace(/<title color="#777777" size="26">(.+?)<\/title>/g, '___')
      .replace(/___/g, `<title color="#777777" size="26">${title}</title>`)
      .replace(/brief="\[聊天记录\]"/g, `brief="[${title}]"`)
      .replace(/brief="\[转发的聊天记录\]"/g, `brief="[${title}]"`)
  }

  return msgNode
}

/**
 * 以逐条模式发送图片（根据配置决定发送原图文件或图片消息）
 * @param {object} e - 云崽消息事件对象
 * @param {string} filePath - 图片文件路径
 * @param {string} fileName - 文件名
 * @param {object} config - 插件配置
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
 * @param {object} e - 云崽消息事件对象
 * @param {object} prepMsg - 待撤回的消息对象（需包含 message_id）
 */
export async function recallMessage(e, prepMsg) {
  if (!prepMsg?.message_id) return

  try {
    if (e.group?.recallMsg) {
      await e.group.recallMsg(prepMsg.message_id)
    } else if (e.friend?.recallMsg) {
      await e.friend.recallMsg(prepMsg.message_id)
    } else if (e.bot?.deleteMsg) {
      await e.bot.deleteMsg(prepMsg.message_id)
    }
  } catch (err) {
    logger.error('[Lofter解析] 撤回准备消息失败', err)
  }
}
