/**
 * @module apps/blogBrowser
 * @description 博主主页浏览插件，处理 #lofter 博主名 和 #lofter下一页 命令
 */

import plugin from '../../../lib/plugins/plugin.js'
import { fetchPage } from '../lib/fetch/fetcher.js'
import { parsePageData } from '../lib/parse/parser.js'
import { extractBlogPageInfo } from '../lib/parse/blogParser.js'
import { setListCache, getListCache } from '../lib/fetch/listCache.js'
import { buildBlogListMessages } from '../lib/message/messageBuilder.js'
import { sendListResult } from '../lib/message/sender.js'
import { categorizeError } from '../lib/core/errors.js'
import { loadConfig } from '../lib/core/configLoader.js'

export class BlogBrowser extends plugin {
  constructor() {
    super({
      name: 'Lofter博主浏览',
      dsc: '浏览Lofter博主主页',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#lofter\\s+(.+)$',
          fnc: 'browseBlog'
        },
        {
          reg: '^#lofter下一页$',
          fnc: 'browseBlogNextPage'
        }
      ]
    })
  }

  /**
   * 从消息中提取博主名或主页 URL
   * @param {string} msg - 消息文本
   * @returns {string|null} blogName
   */
  extractBlogName(msg) {
    const match = msg.match(/^#lofter\s+(.+)$/)
    if (!match) return null
    const input = match[1].trim()

    const urlMatch = input.match(/^https?:\/\/([a-zA-Z0-9-]+)\.lofter\.com\/?$/i)
    if (urlMatch) return urlMatch[1]

    return input
  }

  /**
   * 浏览博主主页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlog(e) {
    const config = loadConfig()
    if (!config) return false

    const blogName = this.extractBlogName(e.msg)
    if (!blogName) return false

    logger.info(`[Lofter解析] 浏览博主主页: ${blogName}`)
    const url = `https://${blogName}.lofter.com/`

    try {
      const html = await fetchPage(url, config.timeout || 30, config)
      const dataObj = parsePageData(html)
      const blogPage = extractBlogPageInfo(dataObj, url)

      const pageSize = config.blogListPageSize || 10
      const items = blogPage.postList.slice(0, pageSize)

      const messages = buildBlogListMessages({ ...blogPage, postList: items }, config)

      setListCache(
        e,
        {
          type: 'blog',
          items: items,
          pageState: {
            blogName: blogPage.blogger.blogName,
            offset: blogPage.offset
          }
        },
        config.listCacheTTL || 600
      )

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 博主主页浏览失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 博主主页下一页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlogNextPage(e) {
    const config = loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'blog') {
      await e.reply('请先使用 #lofter 博主名 浏览博主主页')
      return false
    }

    const { blogName, offset } = cache.pageState
    if (!offset || offset <= 0) {
      await e.reply('已经没有更多内容了')
      return false
    }

    logger.info(`[Lofter解析] 博主主页下一页: ${blogName}, offset=${offset}`)
    const url = `https://${blogName}.lofter.com/?offset=${offset}`

    try {
      const html = await fetchPage(url, config.timeout || 30, config)
      const dataObj = parsePageData(html)
      const blogPage = extractBlogPageInfo(dataObj, url)

      const pageSize = config.blogListPageSize || 10
      const items = blogPage.postList.slice(0, pageSize)

      const messages = buildBlogListMessages({ ...blogPage, postList: items }, config)

      setListCache(
        e,
        {
          type: 'blog',
          items: items,
          pageState: {
            blogName: blogPage.blogger.blogName,
            offset: blogPage.offset
          }
        },
        config.listCacheTTL || 600
      )

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 博主主页下一页失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }
}
