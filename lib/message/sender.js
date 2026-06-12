/**
 * @module lib/sender
 * @description 消息发送模块，负责合并转发构造、图片发送、消息撤回、列表消息发送
 */

import fs from 'node:fs'
import { applyForwardTitle } from './messageBuilder.js'

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
 * 撤回失败时回退为发"解析完成"消息并尝试再次撤回，避免残留"准备解析..."提示
 * @param {object} e - 云崽消息事件对象
 * @param {object|null} prepMsg - 待撤回的消息对象（需包含 message_id）
 * @returns {Promise<boolean>} 是否成功撤回或回退处理
 */
export async function recallMessage(e, prepMsg) {
  if (!prepMsg?.message_id) return false

  const directSuccess = await tryRecall(e, prepMsg.message_id)
  if (directSuccess) return true

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
 * 统一列表消息发送（合并转发或逐条发送）
 * @param {object} e - 云崽消息事件对象
 * @param {Array} messages - 消息列表
 * @param {object} config - 配置对象
 */
export async function sendListResult(e, messages, config) {
  if (config.sendMode === 'forward') {
    const forwardMsg = await makeForwardMsg(e, messages, config.forwardTitle || 'Lofter解析结果', config.forwardNickname || '')
    if (forwardMsg) {
      await e.reply(forwardMsg)
    } else {
      for (const msg of messages) await e.reply(msg)
    }
  } else {
    for (const msg of messages) await e.reply(msg)
  }
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
