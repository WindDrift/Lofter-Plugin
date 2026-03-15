import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/Config.js'
import fetch from 'node-fetch'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'

const streamPipeline = promisify(pipeline)

export class LofterPlugin extends plugin {
  constructor() {
    super({
      name: 'Lofter解析',
      dsc: '解析Lofter链接并发送图文',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: 'https?:\\/\\/[a-zA-Z0-9-]+\\.lofter\\.com\\/post\\/[a-zA-Z0-9_]+',
          fnc: 'parseLofter'
        }
      ]
    })
  }

  async parseLofter(e) {
    const config = new Config().getDefSet('lofter')
    if (!config.autoParse) return false

    // Extract URL from message
    const urlMatch = e.msg.match(/(https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+)/i)
    if (!urlMatch) return false

    const url = urlMatch[1]
    logger.info(`[Lofter解析] 检测到链接: ${url}`)
    
    let prepMsg = null
    try {
      prepMsg = await e.reply(`收到 Lofter 链接 ${url}，准备解析...`)
    } catch (err) {
      logger.error('[Lofter解析] 发送准备消息失败', err)
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        timeout: (config.timeout || 30) * 1000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 12; OnePlus 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Edg/119.0.0.0'
        }
      })

      if (!response.ok) {
        logger.error(`[Lofter解析] 请求失败: ${response.status}`)
        return false
      }

      const html = await response.text()
      
      // Extract window.__initialize_data__
      const dataMatch = html.match(/window\.__initialize_data__\s*=\s*(\{[\s\S]*?\})<\/script>/)
      if (!dataMatch) {
        await e.reply('未能在页面中找到解析数据。')
        return false
      }

      const dataStr = dataMatch[1]
      let dataObj
      try {
        dataObj = JSON.parse(dataStr)
      } catch (err) {
        logger.error('[Lofter解析] JSON解析失败', err)
        await e.reply('Lofter数据解析失败。')
        return false
      }

      const postDataObj = dataObj?.postData?.data
      if (!postDataObj) {
        await e.reply('获取博文数据失败。')
        return false
      }

      const blogInfo = postDataObj.blogInfo || {}
      const postView = postDataObj.postData?.postView || {}
      const postCount = postDataObj.postData?.postCountView || {}

      const nickname = blogInfo.blogNickName || '未知'
      const blogName = blogInfo.blogName || '未知'
      const blogId = blogInfo.blogId || '未知'
      const title = postView.title || '无标题'
      const publishTime = postView.publishTime || Date.now()
      const postId = postView.id || '未知'
      let digest = postView.digest || ''
      // Strip HTML tags
      digest = digest.replace(/<[^>]+>/g, '').trim()

      const tags = postView.tagList ? postView.tagList.join(', ') : '无'
      
      const responseCount = postCount.responseCount || 0
      const favoriteCount = postCount.favoriteCount || 0
      const shareCount = postCount.shareCount || 0
      const subscribeCount = postCount.subscribeCount || 0
      const hotCount = postCount.hotCount || 0

      const publishDateStr = this.formatDate(publishTime)
      const publishDateTimeStr = this.formatDateTime(publishTime)

      let textMessages = []

      // 1. 博主信息
      let bloggerInfo = `${nickname}\n${blogName}.lofter.com\nID：${blogId}`
      textMessages.push(bloggerInfo)

      // 2. 博文信息
      let postInfo = `博文链接：${url}\n发布时间：${publishDateTimeStr}\nID：${postId}`
      if (config.showTags) {
        postInfo += `\n标签：${tags}`
      }
      textMessages.push(postInfo)

      // 3. 标题和内容
      let contentInfo = `${title}\n${digest}`
      textMessages.push(contentInfo)

      // 4. 互动数据
      let interactInfo = `回复: ${responseCount}\n点赞: ${favoriteCount}\n推荐: ${shareCount}\n收藏: ${subscribeCount}\n热度: ${hotCount}`
      textMessages.push(interactInfo)

      // 5. 原图链接
      const photoLinks = postView.photoPostView?.photoLinks || []
      if (photoLinks.length > 0) {
        let imgLinksInfo = "原图链接："
        photoLinks.forEach((link, index) => {
           let imgUrl = link.orign || link.raw
           if (imgUrl) {
             imgUrl = imgUrl.split('?')[0]
             imgLinksInfo += `\n图${index + 1}：${imgUrl}`
           }
        })
        textMessages.push(imgLinksInfo)
      }

      // 如果不是合并转发模式，先发送文本消息
      if (config.sendMode !== 'forward') {
        for (let msg of textMessages) {
          await e.reply(msg)
        }
      }

      let msgList = [...textMessages]
      let firstImagePath = null

      // Handle images
      if (photoLinks.length > 0) {
        const tempDir = path.join(process.cwd(), 'temp', 'lofter')
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        for (let i = 0; i < photoLinks.length; i++) {
          // Use 'orign' first, then 'raw' as fallback. 'raw' often points to nos.netease.com which can return 403.
          // 'orign' usually points to imglf3/4/5.lf127.net which is more reliable.
          let imgUrl = photoLinks[i].orign || photoLinks[i].raw
          if (!imgUrl) continue

          // 去掉问号后面的参数，获取原图
          imgUrl = imgUrl.split('?')[0]

          // Remove query parameters to get clean extension
          const cleanUrl = imgUrl
          const extMatch = cleanUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
          const ext = extMatch ? extMatch[1] : 'jpg'
          
          // Sanitize filename
          const safeBlogName = blogName.replace(/[\\/:*?"<>|]/g, '_')
          let fileName = `${safeBlogName}-${publishDateStr}`
          if (photoLinks.length > 1) {
            fileName += `-${i + 1}`
          }
          fileName += `.${ext}`

          const filePath = path.join(tempDir, fileName)

          try {
            const imgRes = await fetch(imgUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 12; OnePlus 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 Edg/119.0.0.0',
                'Referer': url
              }
            })
            if (!imgRes.ok) throw new Error(`Status ${imgRes.status}`)
            
            await streamPipeline(imgRes.body, fs.createWriteStream(filePath))
            
            // Verify file exists and is not empty
            if (!fs.existsSync(filePath)) {
              throw new Error('File download failed (file not found)')
            }
            const stats = fs.statSync(filePath)
            if (stats.size === 0) {
              throw new Error('File download failed (empty file)')
            }
            
            logger.info(`[Lofter解析] 图片下载成功: ${filePath}, 大小: ${stats.size} bytes`)

            if (config.sendMode === 'forward') {
              msgList.push(segment.image(filePath))
              if (i === 0) {
                firstImagePath = filePath
              }
            } else {
              // Send as file or image based on config
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
          } catch (err) {
            logger.error(`[Lofter解析] 下载或发送图片失败: ${imgUrl}`, err)
            if (config.sendMode !== 'forward') {
              await e.reply(`图片 ${fileName} 发送失败。`)
            } else {
              msgList.push(`图片 ${fileName} 下载失败。`)
            }
          } finally {
            // Do not delete file here if we are going to send it in forward message later
            // We will clean up the temp directory periodically or after sending forward message
            if (config.sendMode !== 'forward') {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
              }
            }
          }
        }
      }

      if (config.sendMode === 'forward') {
        try {
          const forwardTitle = config.forwardTitle || 'Lofter解析结果'
          const forwardNickname = config.forwardNickname || ''
          const forwardMsg = await this.makeForwardMsg(e, msgList, forwardTitle, forwardNickname)
          if (forwardMsg) {
            await e.reply(forwardMsg)
          } else {
            // Fallback to sending one by one
            for (let msg of msgList) {
              await e.reply(msg)
            }
          }

          if (config.sendFirstImage && firstImagePath) {
            try {
              await e.reply(segment.image(firstImagePath))
            } catch (firstImgErr) {
              logger.error(`[Lofter解析] 发送首图失败: ${firstImgErr.message}`)
            }
          }
        } catch (err) {
          logger.error(`[Lofter解析] 发送合并转发失败:`, err)
          await e.reply('发送合并转发失败，尝试普通发送。')
          for (let msg of msgList) {
            await e.reply(msg)
          }
        } finally {
          // Cleanup temp files if forward mode
          if (photoLinks.length > 0) {
            const tempDir = path.join(process.cwd(), 'temp', 'lofter')
            if (fs.existsSync(tempDir)) {
              fs.readdirSync(tempDir).forEach(file => {
                if (file.startsWith(blogName.replace(/[\\/:*?"<>|]/g, '_'))) {
                  try {
                    fs.unlinkSync(path.join(tempDir, file))
                  } catch (e) {}
                }
              })
            }
          }
        }
      }

    } catch (err) {
      logger.error('[Lofter解析] 发生错误', err)
      await e.reply('Lofter解析时发生错误。')
    }
    
    // 撤回准备消息
    if (prepMsg && prepMsg.message_id) {
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
    
    return true
  }

  formatDate(timestamp) {
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  formatDateTime(timestamp) {
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}:${s}`
  }

  async makeForwardMsg(e, msgList, title = 'Lofter解析结果', nickname = '') {
    const forwardMsg = []
    const bot = e.bot || global.Bot || {}
    for (let msg of msgList) {
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
}
