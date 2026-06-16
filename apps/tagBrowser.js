/**
 * @module apps/tagBrowser
 * @description 标签页浏览插件，处理 #lofter标签、#lofter标签下一页、#lofter标签热门 命令
 */

import plugin from '../../../lib/plugins/plugin.js'
import { fetchPage, fetchTagPageByDWR } from '../lib/fetch/fetcher.js'
import { parsePageData } from '../lib/parse/parser.js'
import { extractTagPageInfo, parseDWRResponse } from '../lib/parse/tagParser.js'
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
        },
        {
          reg: '^#lofter标签月榜\\s+(.+)$',
          fnc: 'browseTagMonth'
        },
        {
          reg: '^#lofter标签周榜\\s+(.+)$',
          fnc: 'browseTagWeek'
        },
        {
          reg: '^#lofter标签日榜\\s+(.+)$',
          fnc: 'browseTagDate'
        },
        {
          reg: '^#lofter标签总榜\\s+(.+)$',
          fnc: 'browseTagTotal'
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
   * 从榜单消息中提取标签名
   * @param {string} msg - 消息文本
   * @param {string} rankName - 榜单名称
   * @returns {string|null} 标签名
   */
  extractRankTagName(msg, rankName) {
    const match = msg.match(new RegExp(`^#lofter标签${rankName}\\s+(.+)$`))
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
      const dwrText = await fetchTagPageByDWR(tagName, sort, 20, 0, null, config)
      const { items } = parseDWRResponse(dwrText, tagName, sort)

      const tag = {
        name: tagName,
        postCount: 0
      }

      const pageSize = config.tagListPageSize || 20
      const pageItems = items.slice(0, pageSize)

      const messages = buildTagListMessages({ tag, items: pageItems, page: 1, sort }, config)

      setListCache(e, {
        type: 'tag',
        items: pageItems,
        pageState: {
          tag: tagName,
          page: 1,
          sort: sort,
          gotNum: pageItems.length,
          lastTimestamp: Date.now()
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

  async browseTagMonth(e) {
    return this.browseTagRank(e, '月榜', 'month')
  }

  async browseTagWeek(e) {
    return this.browseTagRank(e, '周榜', 'week')
  }

  async browseTagDate(e) {
    return this.browseTagRank(e, '日榜', 'date')
  }

  async browseTagTotal(e) {
    return this.browseTagRank(e, '总榜', 'total')
  }

  /**
   * 浏览标签榜单页
   * @param {object} e - 消息事件对象
   * @param {string} rankName - 榜单名称
   * @param {string} sort - 排序路径
   * @returns {Promise<boolean>}
   */
  async browseTagRank(e, rankName, sort) {
    const config = loadConfig()
    if (!config) return false

    const tagName = this.extractRankTagName(e.msg, rankName)
    if (!tagName) return false

    logger.info(`[Lofter解析] 浏览标签${rankName}: ${tagName}`)

    try {
      const dwrText = await fetchTagPageByDWR(tagName, sort, 20, 0, null, config)
      const { items } = parseDWRResponse(dwrText, tagName, sort)

      const tag = {
        name: tagName,
        postCount: 0
      }

      const pageSize = config.tagListPageSize || 20
      const pageItems = items.slice(0, pageSize)

      const messages = buildTagListMessages({ tag, items: pageItems, page: 1, sort }, config)

      setListCache(e, {
        type: 'tag',
        items: pageItems,
        pageState: {
          tag: tagName,
          page: 1,
          sort: sort,
          gotNum: pageItems.length,
          lastTimestamp: Date.now()
        }
      }, config.listCacheTTL || 600)

      await sendListResult(e, messages, config)

      return true
    } catch (err) {
      const { category, hint } = categorizeError(err)
      logger.error(`[Lofter解析] [${category}] 标签${rankName}浏览失败: ${err.message}`)
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

    const { tag, page, sort, gotNum = 0, lastTimestamp } = cache.pageState
    const nextPage = page + 1

    logger.info(`[Lofter解析] 标签页下一页: ${tag}, page=${nextPage}, sort=${sort}`)

    try {
      const dwrText = await fetchTagPageByDWR(tag, sort, 20, gotNum, lastTimestamp, config)
      const { items, lastTimestamp: newLastTimestamp } = parseDWRResponse(dwrText, tag, sort)

      const tagInfo = {
        name: tag,
        postCount: 0
      }

      const pageSize = config.tagListPageSize || 20
      const pageItems = items.slice(0, pageSize)

      const messages = buildTagListMessages({ tag: tagInfo, items: pageItems, page: nextPage, sort }, config)

      setListCache(e, {
        type: 'tag',
        items: pageItems,
        pageState: {
          tag: tag,
          page: nextPage,
          sort: sort,
          gotNum: gotNum + pageItems.length,
          lastTimestamp: newLastTimestamp || lastTimestamp
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
      const dwrText = await fetchTagPageByDWR(tag, sort, 20, 0, null, config)
      const { items } = parseDWRResponse(dwrText, tag, sort)

      const tagInfo = {
        name: tag,
        postCount: 0
      }

      const pageSize = config.tagListPageSize || 20
      const pageItems = items.slice(0, pageSize)

      const messages = buildTagListMessages({ tag: tagInfo, items: pageItems, page: 1, sort }, config)

      setListCache(e, {
        type: 'tag',
        items: pageItems,
        pageState: {
          tag: tag,
          page: 1,
          sort: sort,
          gotNum: pageItems.length,
          lastTimestamp: Date.now()
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
