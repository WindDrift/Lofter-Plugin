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

    // 从触发的聊天消息中，利用正则提取出可能存在的 Lofter 链接 URL
    const urlMatch = e.msg.match(/(https?:\/\/[a-zA-Z0-9-]+\.lofter\.com\/post\/[a-zA-Z0-9_]+)/i)
    if (!urlMatch) return false

    const url = urlMatch[1]
    logger.info(`[Lofter解析] 检测到链接: ${url}`)
    
    let prepMsg = null

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
      
      // 解析目标页面的 HTML 内容，提取包含页面核心数据的 window.__initialize_data__ 对象
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
      const photoLinks = postView.photoPostView?.photoLinks || []
      const hasImages = photoLinks.length > 0

      // 发送准备解析的提示消息，告知用户系统已经开始正在处理请求
      try {
        const msgType = hasImages ? '图文' : '纯文'
        prepMsg = await e.reply(`收到${msgType} Lofter 链接 ${url}，准备解析...`)
      } catch (err) {
        logger.error('[Lofter解析] 发送准备消息失败', err)
      }

      let digest = ''
      if (!hasImages && postView.textPostView?.content) {
        digest = postView.textPostView.content
      } else {
        digest = postView.digest || ''
      }

      // 将 HTML 换行标签以及段落标签替换为真实的换行符，为后续纯文本输出做准备
      digest = digest.replace(/<\/p>/ig, '\n')
      digest = digest.replace(/<br[^>]*>/ig, '\n')
      // 移除其余所有的 HTML 特殊标签内容，达到清洗纯文本摘要的目的
      digest = digest.replace(/<[^>]+>/g, '')
      digest = digest.replace(/&times;/g, '×')
      digest = digest.replace(/&nbsp;/g, ' ')
      digest = digest.replace(/&lt;/g, '<')
      digest = digest.replace(/&gt;/g, '>')
      digest = digest.replace(/&amp;/g, '&')
      digest = digest.replace(/&quot;/g, '"')
      digest = digest.replace(/&#39;/g, "'")
      let paragraphs = digest.split('\n').map(line => line.trim()).filter(line => line)

      const tags = postView.tagList ? postView.tagList.join(', ') : '无'
      
      const responseCount = postCount.responseCount || 0
      const favoriteCount = postCount.favoriteCount || 0
      const shareCount = postCount.shareCount || 0
      const subscribeCount = postCount.subscribeCount || 0
      const hotCount = postCount.hotCount || 0

      const publishDateStr = this.formatDate(publishTime)
      const publishDateTimeStr = this.formatDateTime(publishTime)

      let textMessages = []

      // 1. 组织并格式化博主的基础信息（昵称、博客名、Lofter ID）
      let bloggerInfo = `${nickname}\n${blogName}.lofter.com\nID：${blogId}`
      textMessages.push(bloggerInfo)

      // 2. 组织博文的关键信息（原链接、发布日期时间、文章独立ID及标签）
      let postInfo = `博文链接：${url}\n发布时间：${publishDateTimeStr}\nID：${postId}`
      if (config.showTags) {
        postInfo += `\n标签：${tags}`
      }
      textMessages.push(postInfo)

      // 3. 组织博文的正文标题与清洗后的文本摘要内容
      // 单消息/多消息/图片模式处理逻辑
      const pureTextSendMode = config.pureTextSendMode || 'single'
      let imageModeImagePath = null

      if (!hasImages && pureTextSendMode === 'image') {
        try {
          // 动态导入云崽的 puppeteer 支持
          const puppeteer = (await import('../../../lib/puppeteer/puppeteer.js')).default
          // 提取头像链接
          const avatarUrl = blogInfo?.bigAvaImg || ''
          
          let renderData = {
            tplFile: './plugins/Lofter-Plugin/resources/html/lofter/text-post.html',
            plugin: 'Lofter-Plugin',
            title: title,
            nickname: nickname,
            publishTime: publishDateTimeStr,
            blogId: blogId,
            avatar: avatarUrl,
            paragraphs: paragraphs,
            config: config,
            // 截图尺寸与清晰度
            pageGotoParams: { waitUntil: 'networkidle0' },
            viewPort: {
              width: config.imageWidth || 800,
              height: 100,
              deviceScaleFactor: config.imageDeviceScale || 2
            }
          }
          
          let imgRes = await puppeteer.screenshot('lofter-plugin', renderData)
          if (imgRes) {
             textMessages.push(imgRes)
             imageModeImagePath = imgRes
          } else {
             textMessages.push(`${title}\n\n${paragraphs.join('\n\n')}`)
          }
        } catch (e) {
          logger.error('[Lofter解析] 生成纯文本长图失败：', e)
          textMessages.push(`${title}\n\n${paragraphs.join('\n\n')}`) // 回退为文字模式
        }
      }
      else if (!hasImages && pureTextSendMode === 'multi' && config.sendMode === 'forward') {
        textMessages.push(title)
        paragraphs.forEach(p => {
          textMessages.push(p)
        })
      } else {
        // 单消息模式，或含图状态，或未开启合并转发：遇换行加空白段落提升可读性
        let digestToSend = paragraphs.join('\n\n')
        let contentInfo = `${title}\n\n${digestToSend}`
        textMessages.push(contentInfo)
      }

      // 4. 汇总该篇博文的各项社区互动数据（回复、点赞、推荐、收藏及热度）
      let interactInfo = `回复: ${responseCount}\n点赞: ${favoriteCount}\n推荐: ${shareCount}\n收藏: ${subscribeCount}\n热度: ${hotCount}`
      textMessages.push(interactInfo)

      // 5. 遍历并拼接出每一张包含内文照片的原图直链信息
      if (hasImages) {
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

      // 判断当前发送模式，若不是合并转发模式（forward），则先将以上整理好的文本消息逐条独立发送
      if (config.sendMode !== 'forward') {
        for (let msg of textMessages) {
          await e.reply(msg)
        }
      }

      let msgList = [...textMessages]
      let firstImagePath = null
      let isImageSizeLimitTriggered = false

      // 额外：如果在图片模式下，本身就相当于生成了一张“伪原图”，把它置为首图使其支持配置的外部预览
      if (imageModeImagePath) {
         firstImagePath = imageModeImagePath
      }

      // 核心业务逻辑：当文章包含图片时，开始处理图片的下载与发送流程
      if (hasImages) {
        const tempDir = path.join(process.cwd(), 'temp', 'lofter')
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true })
        }

        for (let i = 0; i < photoLinks.length; i++) {
          // 图片链接策略：优先使用 'orign' 字段获取原始大图，如果为空则回退使用 'raw' 字段。
          // 优化原因：'raw' 常常指向容易返回 403 禁止访问的网易云存储，而 'orign' 地址通常更加稳定可靠。
          let imgUrl = photoLinks[i].orign || photoLinks[i].raw
          if (!imgUrl) continue

          // 过滤掉 URL 中问号及其后的查询限制参数，确保获取到的是完整的原图链接
          imgUrl = imgUrl.split('?')[0]

          // 进而剔除 URL 参数以提取最准确干净的文件扩展名（如 jpg, png），以供保存使用
          const cleanUrl = imgUrl
          const extMatch = cleanUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)
          const ext = extMatch ? extMatch[1] : 'jpg'
          
          // 净化并格式化文件名：将博主名称中一切操作系统路径不允许的特殊字符（如斜杠、星号等）全部替换为下划线，以防本地文件创建失败
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
            
            // 严谨性校验：验证从网络上下载的临时图片文件是否被成功持久化创建，并且判断其文件大小是否不为 0（排除无效空文件）
            if (!fs.existsSync(filePath)) {
              throw new Error('File download failed (file not found)')
            }
            const stats = fs.statSync(filePath)
            if (stats.size === 0) {
              throw new Error('File download failed (empty file)')
            }
            
            logger.info(`[Lofter解析] 图片下载成功: ${filePath}, 大小: ${stats.size} bytes`)

            let skipImage = false
            const enableLimit = config.enableImageSizeLimit ?? true
            const sizeLimitMB = config.imageSizeLimit ?? 8
            const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2)

            if (enableLimit && fileSizeMB > sizeLimitMB) {
              skipImage = true
              isImageSizeLimitTriggered = true
              const limitMsg = `图${i + 1}大小(${fileSizeMB}MB)超过设定限制(${sizeLimitMB}MB)，请点击链接获取图片：${imgUrl}`
              if (config.sendMode === 'forward') {
                msgList.push(limitMsg)
              } else {
                await e.reply(limitMsg)
              }
            }

            if (!skipImage) {
              if (config.sendMode === 'forward') {
                msgList.push(segment.image(filePath))
                if (!firstImagePath) {
                  firstImagePath = filePath
                }
              } else {
                // 根据配置文件中 'sendOriginal' 选项及当前聊天类型，决定是以独立的源文件形式还是以渲染图片的格式发送
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
            }
          } catch (err) {
            logger.error(`[Lofter解析] 下载或发送图片失败: ${imgUrl}`, err)
            if (config.sendMode !== 'forward') {
              await e.reply(`图片 ${fileName} 发送失败。`)
            } else {
              msgList.push(`图片 ${fileName} 下载失败。`)
            }
          } finally {
            // 文件清理策略与生命周期管理：
            // 如果是合并转发模式，那么临时文件在这里必须保留以供最终统一构建图文并茂的转发日志。普通模式下由于图片已发送，便可随下随删。
            if (config.sendMode !== 'forward') {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
              }
            }
          }
        }
      }

      if (isImageSizeLimitTriggered) {
        const tipMsg = '要调整/关闭图片大小限制功能，请前往锅巴面板配置。'
        if (config.sendMode === 'forward') {
          msgList.push(tipMsg)
        } else {
          await e.reply(tipMsg)
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
            // 异常回退策略：一旦由于不可控因素导致合并转发的高级消息结构体构建失败或被服务器拒收，则降级为逐条单独发送纯文本与图片组成的小消息矩阵
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
          // 集中清理流程：一旦走到合并转发（无论成功或降级），都代表当前图文数据已被 QQ 协议层接收处理完毕，此时需扫尾清理此次分配下载产生的临时目录空间
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
    
    // 流程收尾：在完成全部解析并投递数据之后，主动撤回最初发出的“准备解析中”的系统提示消息，减少聊天界面干扰
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
