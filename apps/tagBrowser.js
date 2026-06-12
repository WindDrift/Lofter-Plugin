/**
 * @module apps/tagBrowser
 * @description 标签页浏览插件，处理 #lofter标签、#lofter标签下一页、#lofter标签热门 命令
 */

import plugin from '../../../lib/plugins/plugin.js'
import { fetchPage } from '../lib/fetch/fetcher.js'
import { parsePageData } from '../lib/parse/parser.js'
import { extractTagPageInfo } from '../lib/parse/tagParser.js'
import { setListCache, getListCache } from '../lib/fetch/listCache.js'
import { buildTagListMessages } from '../lib/message/messageBuilder.js'
import { sendListResult } from '../lib/message/sender.js'
import { categorizeError } from '../lib/core/errors.js'
import { loadConfig } from '../lib/core/configLoader.js'

export class TagBrowser extends plugin {
  constructor() {
    super({
      name: 'Lofter标签浏览',
      dsc: '浏览Lofter标签页',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#lofter标签\\s+(.+)$',
          fnc: 'browseTag'
        },
        {
          reg: '^#lofter标签下一页$',
          fnc: 'browseTagNextPage'
        },
        {
          reg: '^#lofter标签热门$',
          fnc: 'browseTagHot'
        }
      ]
    })
  }

  /**
   * 从消息中提取标签名
   * @param {string} msg - 消息文本
   * @returns {string|null} 标签名
   */
  extractTagName(msg) {
    const match = msg.match(/^#lofter标签\s+(.+)$/)
    return match ? match[1].trim() : null
  }

  /**
   * 浏览标签页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTag(e) {
    const config = loadConfig()
    if (!config) return false

    const tagName = this.extractTagName(e.msg)
    if (!tagName) return false

    const sort = config.tagDefaultSort || 'new'
    logger.info(`[Lofter解析] 浏览标签页: ${tagName}, 排序: ${sort}`)

    try {
      const encodedTag = encodeURIComponent(tagName)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=1`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      const messages = buildTagListMessages({ ...tagPage, items }, config)

      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tagName,
          page: 1,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页浏览失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 标签页下一页
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTagNextPage(e) {
    const config = loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'tag') {
      await e.reply('请先使用 #lofter标签 标签名 浏览标签页')
      return false
    }

    const { tag, page, sort } = cache.pageState
    const nextPage = page + 1

    logger.info(`[Lofter解析] 标签页下一页: ${tag}, page=${nextPage}, sort=${sort}`)

    try {
      const encodedTag = encodeURIComponent(tag)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=${nextPage}`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      const messages = buildTagListMessages({ ...tagPage, items }, config)

      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tag,
          page: nextPage,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页下一页失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }

  /**
   * 标签页切换热门排序
   * @param {object} e - 消息事件对象
   * @returns {Promise<boolean>}
   */
  async browseTagHot(e) {
    const config = loadConfig()
    if (!config) return false

    const cache = getListCache(e)
    if (!cache || cache.type !== 'tag') {
      await e.reply('请先使用 #lofter标签 标签名 浏览标签页')
      return false
    }

    const { tag } = cache.pageState
    const sort = 'hot'

    logger.info(`[Lofter解析] 标签页切换热门: ${tag}`)

    try {
      const encodedTag = encodeURIComponent(tag)
      const url = `https://www.lofter.com/tag/${encodedTag}/${sort}?page=1`
      const html = await fetchPage(url, config.timeout || 30)
      const dataObj = parsePageData(html)
      const tagPage = extractTagPageInfo(dataObj, url, sort)

      const pageSize = config.tagListPageSize || 20
      const items = tagPage.items.slice(0, pageSize)

      const messages = buildTagListMessages({ ...tagPage, items }, config)

      setListCache(e, {
        type: 'tag',
        items: items,
        pageState: {
          tag: tag,
          page: 1,
          sort: sort
        }
      }, config.listCacheTTL || 600)

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签页热门切换失败: ${err.message}`)
      await e.reply(hint)
      return false
    }
  }
}
