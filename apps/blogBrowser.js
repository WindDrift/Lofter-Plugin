/**
 * @module apps/blogBrowser
 * @description 博主主页浏览插件，处理 #lofter 博主名 和 #lofter下一页 命令
 */

import plugin from '../../../lib/plugins/plugin.js'
import { fetchBlogHomePageByAPI } from '../lib/fetch/fetcher.js'
import { parseBlogHomePageResponse } from '../lib/parse/blogParser.js'
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
        },
        {
          reg: '^#lofter热门$',
          fnc: 'browseBlogHot'
        }
      ]
    })
  }

  /**
   * 从消息中提取博主名、主页 URL 和排序方式
   * @param {string} msg - 消息文本
   * @returns {{blogName: string|null, sort: string}|null}
   */
  extractBlogInput(msg) {
    const match = msg.match(/^#lofter\s+(.+)$/)
    if (!match) return null

    const parts = match[1].trim().split(/\s+/)
    const first = parts[0].trim()

    const urlMatch = first.match(/^https?:\/\/([a-zA-Z0-9-]+)\.lofter\.com\/?$/i)
    const blogName = urlMatch ? urlMatch[1] : first

    const sort = this.resolveSort(parts[1])

    return { blogName, sort }
  }

  /**
   * 将用户输入的排序描述解析为内部排序标识
   * @param {string|undefined} input
   * @returns {string}
   */
  resolveSort(input) {
    if (!input) return 'new'
    const normalized = String(input).trim().toLowerCase()
    if (normalized === 'hot' || normalized === '热度' || normalized === '热门') return 'hot'
    return 'new'
  }

  /**
   * 加载并返回博主主页数据
   * @param {string} blogName
   * @param {string} sort
   * @param {number} offset
   * @param {object} config
   * @returns {Promise<{blogPage: BlogPageExtracted, items: BlogPagePost[]}>}
   */
  async loadBlogPage(blogName, sort, offset, config) {
    const response = await fetchBlogHomePageByAPI(blogName, sort, offset, config)
    const blogPage = parseBlogHomePageResponse(response, blogName)

    const pageSize = config.blogListPageSize || 10
    const items = blogPage.postList.slice(0, pageSize)

    return { blogPage: { ...blogPage, postList: items }, items }
  }

  /**
   * 浏览博主主页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlog(e) {
    const config = loadConfig()
    if (!config) return false

    const input = this.extractBlogInput(e.msg)
    if (!input || !input.blogName) return false

    const { blogName, sort } = input
    logger.info(`[Lofter解析] 浏览博主主页: ${blogName}, 排序: ${sort}`)

    try {
      const { blogPage, items } = await this.loadBlogPage(blogName, sort, 0, config)

      const messages = buildBlogListMessages(blogPage, config, sort)

      setListCache(
        e,
        {
          type: 'blog',
          items,
          pageState: {
            blogName: blogPage.blogger.blogName,
            sort,
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

    const { blogName, sort = 'new', offset = 0 } = cache.pageState
    if (!offset || offset <= 0) {
      await e.reply('已经没有更多内容了')
      return false
    }

    logger.info(`[Lofter解析] 博主主页下一页: ${blogName}, 排序: ${sort}, offset=${offset}`)

    try {
      const { blogPage, items } = await this.loadBlogPage(blogName, sort, offset, config)

      const messages = buildBlogListMessages(blogPage, config, sort)

      setListCache(
        e,
        {
          type: 'blog',
          items,
          pageState: {
            blogName: blogPage.blogger.blogName,
            sort,
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

  /**
   * 博主主页切换热门排序
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseBlogHot(e) {
    const config = loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'blog') {
      await e.reply('请先使用 #lofter 博主名 浏览博主主页')
      return false
    }

    const { blogName } = cache.pageState
    const sort = 'hot'

    logger.info(`[Lofter解析] 博主主页切换热门: ${blogName}`)

    try {
      const { blogPage, items } = await this.loadBlogPage(blogName, sort, 0, config)

      const messages = buildBlogListMessages(blogPage, config, sort)

      setListCache(
        e,
        {
          type: 'blog',
          items,
          pageState: {
            blogName: blogPage.blogger.blogName,
            sort,
            offset: blogPage.offset
          }
        },
        config.listCacheTTL || 600
      )

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 博主主页热门切换失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }
}
