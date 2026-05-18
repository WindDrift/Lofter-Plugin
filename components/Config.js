/**
 * @module components/Config
 * @description 配置管理模块
 *
 * 负责读取和管理插件的 YAML 配置文件，支持默认配置与用户自定义配置的合并。
 * 配置文件存放于两个位置：
 * - config/default_config/ — 插件内置的默认配置（随代码发布）
 * - config/config/         — 用户自定义配置（首次运行时自动从默认配置复制）
 *
 * 读取优先级：用户配置 > 默认配置（相同键值用户配置覆盖默认配置）
 */

import YAML from 'yaml'
import fs from 'fs'
import path from 'path'

/** Yunzai-Bot 根目录 */
const _path = process.cwd()

/** 插件标识名，用于构建配置文件路径 */
const plugin = 'lofter-plugin'

export default class Config {
  constructor() {
    /** 用户自定义配置目录 */
    this.configPath = `${_path}/plugins/${plugin}/config/config/`
    /** 默认配置目录 */
    this.defaultPath = `${_path}/plugins/${plugin}/config/default_config/`
    /** 文件监听器缓存（预留热更新支持） */
    this.watcher = {}
  }

  /**
   * 获取配置信息（主要入口）
   * @param {string} name - 配置文件名（不含扩展名），如 'lofter'
   * @returns {object} 合并后的配置对象
   */
  getDefSet(name) {
    return this.get(name)
  }

  /**
   * 获取配置信息（内部实现）
   *
   * 读取流程：
   * 1. 确保用户配置目录存在
   * 2. 读取默认配置文件作为基础
   * 3. 读取用户配置文件并覆盖默认值
   * 4. 若用户配置文件不存在，则从默认配置复制一份作为初始用户配置
   *
   * @param {string} name - 配置文件名（不含扩展名）
   * @returns {object} 合并后的配置对象
   */
  get(name) {
    const file = `${this.configPath}${name}.yaml`
    const defaultFile = `${this.defaultPath}${name}.yaml`

    let config = {}

    // 确保用户配置目录存在
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true })
    }

    // 读取默认配置
    if (fs.existsSync(defaultFile)) {
      try {
        config = YAML.parse(fs.readFileSync(defaultFile, 'utf8'))
      } catch (error) {
        console.error(`[${plugin}] Load default config error: ${error}`)
      }
    }

    // 读取用户配置并合并（用户配置覆盖默认值）
    if (fs.existsSync(file)) {
      try {
        const userConfig = YAML.parse(fs.readFileSync(file, 'utf8'))
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
    }

    return config
  }

  /**
   * 保存用户配置到 YAML 文件
   * @param {string} name - 配置文件名（不含扩展名）
   * @param {object} data - 要保存的配置数据
   * @returns {boolean} 是否保存成功
   */
  set(name, data) {
    const file = `${this.configPath}${name}.yaml`

    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true })
    }

    try {
      if (data === undefined) {
        throw new Error('Data is undefined')
      }
      fs.writeFileSync(file, YAML.stringify(data), 'utf8')
      return true
    } catch (error) {
      console.error(`[${plugin}] Save config error for ${name}: ${error}`)
      return false
    }
  }
}
