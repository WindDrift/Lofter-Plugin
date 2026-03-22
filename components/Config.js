
import YAML from 'yaml'
import fs from 'fs'
import path from 'path'

const _path = process.cwd()
const plugin = 'lofter-plugin'

export default class Config {
  constructor() {
    this.configPath = `${_path}/plugins/${plugin}/config/config/`
    this.defaultPath = `${_path}/plugins/${plugin}/config/default_config/`
    this.watcher = {}
  }

  // 获取配置信息（主要入口）
  getDefSet(name) {
    return this.get(name)
  }

  // 获取配置信息（内部具体实现）
  get(name) {
    const file = `${this.configPath}${name}.yaml`
    const defaultFile = `${this.defaultPath}${name}.yaml`
    
    let config = {}
    
    // 如果用户特定的配置目录不存在，则递归创建该目录
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true })
    }

    // 尝试读取并解析默认的配置文件
    if (fs.existsSync(defaultFile)) {
      try {
        config = YAML.parse(fs.readFileSync(defaultFile, 'utf8'))
      } catch (error) {
        console.error(`[${plugin}] Load default config error: ${error}`)
      }
    }

    // 尝试读取用户自定义配置文件，并将其与默认配置进行整合（如果有相同的键将覆盖）
    if (fs.existsSync(file)) {
      try {
        const userConfig = YAML.parse(fs.readFileSync(file, 'utf8'))
        config = { ...config, ...userConfig }
      } catch (error) {
        console.error(`[${plugin}] Load user config error: ${error}`)
      }
    } else if (fs.existsSync(defaultFile)) {
      // 如果用户配置文件尚未创建，则将默认配置文件直接复制一份作为初始的用户配置
      try {
        fs.copyFileSync(defaultFile, file)
      } catch (error) {
        console.error(`[${plugin}] Copy default config error: ${error}`)
      }
    }

    return config
  }

  // 保存用户配置信息至本地 YAML 文件
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
