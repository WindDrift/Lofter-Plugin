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

      let replyText = `博主：${nickname} (${blogName})\n`
      replyText += `用户ID：${blogId}\n`
      replyText += `标题：${title}\n`
      replyText += `发布时间：${publishDateTimeStr}\n`
      replyText += `博文ID：${postId}\n`
      replyText += `内容：\n${digest}\n`
      if (config.showTags) {
        replyText += `标签：${tags}\n`
      }
      replyText += `互动数据：\n`
      replyText += `回复: ${responseCount} | 点赞: ${favoriteCount} | 推荐: ${shareCount} | 收藏: ${subscribeCount} | 热度: ${hotCount}`

      await e.reply(replyText)

      // Handle images
      const photoLinks = postView.photoPostView?.photoLinks || []
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

            // Send as file
            try {
              if (e.isGroup) {
                await e.group.sendFile(filePath, fileName)
              } else if (e.friend) {
                await e.friend.sendFile(filePath, fileName)
              } else {
                // fallback to sending as image if sendFile is not supported
                await e.reply(segment.image(filePath))
              }
            } catch (sendErr) {
              logger.error(`[Lofter解析] sendFile 失败，尝试以 Buffer 形式发送图片: ${sendErr.message}`)
              try {
                // Read file to buffer to bypass path issues
                const fileBuffer = fs.readFileSync(filePath)
                await e.reply(segment.image(fileBuffer))
              } catch (bufferErr) {
                logger.error(`[Lofter解析] Buffer 发送失败: ${bufferErr.message}`)
                await e.reply(`图片 ${fileName} 发送失败。`)
              }
            }
          } catch (err) {
            logger.error(`[Lofter解析] 下载或发送图片失败: ${imgUrl}`, err)
            await e.reply(`图片 ${fileName} 发送失败。`)
          } finally {
            // Cleanup
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath)
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
}
