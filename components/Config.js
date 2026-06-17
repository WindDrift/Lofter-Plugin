/**
 * @module components/Config
 * @description 配置管理模块（增强版）
 *
 * 增强点（M-04 / P-02）：
 *  - 进程级单例：getInstance() 避免重复实例化
 *  - 内存缓存：首次读取后保留解析结果，避免每条消息重新读盘
 *  - 热重载：fs.watch 监听用户配置文件变更，自动失效缓存
 *
 * 配置文件存放于两个位置：
 *  - config/default_config/ — 插件内置的默认配置
 *  - config/config/         — 用户自定义配置
 *
 * 读取优先级：用户配置 > 默认配置
 */

import YAML from 'yaml'
import fs from 'fs'
import fsp from 'fs/promises'
import { buildDefaultLofterConfig } from '../config/fields.js'

/** Yunzai-Bot 根目录 */
const _path = process.cwd()

/** 插件标识名，用于构建配置文件路径 */
const plugin = 'lofter-plugin'

/** 用户配置目录 */
const configPath = `${_path}/plugins/${plugin}/config/config/`

/** 默认配置目录 */
const defaultPath = `${_path}/plugins/${plugin}/config/default_config/`

/** 进程级单例 */
let singleton = null

/** 简易 debounce */
function debounce(fn, ms) {
  let timer = null
  return (...args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export default class Config {
  constructor() {
    this.configPath = configPath
    this.defaultPath = defaultPath
    /** 内存缓存：name -> { value, mtime } */
    this.cache = new Map()
    /** 文件监听器 */
    this.watchers = new Map()
    /** 是否启用热重载（默认开启） */
    this.hotReload = true
  }

  /**
   * 进程级单例
   * @returns {Config}
   */
  static getInstance() {
    if (!singleton) singleton = new Config()
    return singleton
  }

  /**
   * 获取配置信息（主要入口）
   * @param {string} name
   * @returns {object}
   */
  getDefSet(name) {
    return this.get(name)
  }

  /**
   * 读取并合并配置
   * @param {string} name
   * @returns {object}
   */
  get(name) {
    if (this.cache.has(name)) {
      return this.cache.get(name).value
    }
    const value = this.readFromDisk(name)
    this.cache.set(name, { value, mtime: Date.now() })
    if (this.hotReload) this.setupWatcher(name)
    return value
  }

  /**
   * 从磁盘读取
   * @param {string} name
   * @returns {object}
   */
  readFromDisk(name) {
    const file = `${this.configPath}${name}.yaml`
    const defaultFile = `${this.defaultPath}${name}.yaml`

    // 默认配置以 fields.js 注册表为准（M-01 单一事实源），YAML 作为带注释的可读备份
    let config = buildDefaultLofterConfig()

    // 确保用户配置目录存在
    if (!fs.existsSync(this.configPath)) {
      try {
        fs.mkdirSync(this.configPath, { recursive: true })
      } catch (error) {
        console.error(`[${plugin}] mkdir configPath error: ${error}`)
      }
    }

    // 读取默认配置（若 YAML 存在则覆盖注册表生成的默认值，便于保留仓库注释）
    if (fs.existsSync(defaultFile)) {
      try {
        const yamlDefault = YAML.parse(fs.readFileSync(defaultFile, 'utf8')) || {}
        config = { ...config, ...yamlDefault }
      } catch (error) {
        console.error(`[${plugin}] Load default config error: ${error}`)
      }
    }

    // 读取用户配置并合并
    if (fs.existsSync(file)) {
      try {
        const userConfig = YAML.parse(fs.readFileSync(file, 'utf8')) || {}
        config = { ...config, ...userConfig }
      } catch (error) {
        console.error(`[${plugin}] Load user config error: ${error}`)
      }
    } else if (fs.existsSync(defaultFile)) {
      // 首次运行：将默认配置复制为初始用户配置
      try {
        fs.copyFileSync(defaultFile, file)
      } catch (error) {
        console.error(`[${plugin}] Copy default config error: ${error}`)
      }
    } else {
      // 仓库无 default yaml，使用 fields.js 生成
      try {
        fs.writeFileSync(file, YAML.stringify({ lofter: config }), 'utf8')
      } catch (error) {
        console.error(`[${plugin}] 写入默认配置失败: ${error}`)
      }
    }

    return config
  }

  /**
   * 手动失效指定缓存
   * @param {string} name
   */
  invalidate(name) {
    this.cache.delete(name)
  }

  /**
   * 设置文件监听器（debounce 后失效缓存）
   * @param {string} name
   */
  setupWatcher(name) {
    if (this.watchers.has(name)) return
    const file = `${this.configPath}${name}.yaml`
    if (!fs.existsSync(file)) return

    const invalidate = debounce(() => {
      this.invalidate(name)
      logger.debug?.(`[${plugin}] 配置已热重载: ${name}`)
    }, 300)

    try {
      const watcher = fs.watch(file, () => invalidate())
      this.watchers.set(name, watcher)
    } catch (err) {
      logger.debug?.(`[${plugin}] 监听配置文件失败: ${file}`, err)
    }
  }

  /**
   * 保存用户配置到 YAML 文件
   * @param {string} name
   * @param {object} data
   * @returns {Promise<boolean>}
   */
  async set(name, data) {
    const file = `${this.configPath}${name}.yaml`

    if (!fs.existsSync(this.configPath)) {
      await fsp.mkdir(this.configPath, { recursive: true })
    }

    try {
      if (data === undefined) {
        throw new Error('Data is undefined')
      }
      await fsp.writeFile(file, YAML.stringify(data), 'utf8')
      this.invalidate(name)
      return true
    } catch (error) {
      console.error(`[${plugin}] Save config error for ${name}: ${error}`)
      return false
    }
  }
}
