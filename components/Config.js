
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

  // Get configuration
  getDefSet(name) {
    return this.get(name)
  }

  // Get configuration (alias)
  get(name) {
    const file = `${this.configPath}${name}.yaml`
    const defaultFile = `${this.defaultPath}${name}.yaml`
    
    let config = {}
    
    // Create config directory if not exists
    if (!fs.existsSync(this.configPath)) {
      fs.mkdirSync(this.configPath, { recursive: true })
    }

    // Load default config
    if (fs.existsSync(defaultFile)) {
      try {
        config = YAML.parse(fs.readFileSync(defaultFile, 'utf8'))
      } catch (error) {
        console.error(`[${plugin}] Load default config error: ${error}`)
      }
    }

    // Load user config and merge
    if (fs.existsSync(file)) {
      try {
        const userConfig = YAML.parse(fs.readFileSync(file, 'utf8'))
        config = { ...config, ...userConfig }
      } catch (error) {
        console.error(`[${plugin}] Load user config error: ${error}`)
      }
    } else if (fs.existsSync(defaultFile)) {
      // Copy default to user config if user config doesn't exist
      try {
        fs.copyFileSync(defaultFile, file)
      } catch (error) {
        console.error(`[${plugin}] Copy default config error: ${error}`)
      }
    }

    return config
  }

  // Save configuration
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
