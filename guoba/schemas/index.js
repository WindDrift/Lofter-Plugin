
import lofter from './lofter.js'
import Config from '../../components/Config.js'

const config = new Config()

export const schemas = [
  ...lofter
]

export function getConfigData () {
  return {
    lofter: config.getDefSet('lofter')
  }
}

export function setConfigData (data, { Result }) {
  let lofterConfig = data.lofter

  // Compatibility handling: if data.lofter is undefined, try to match flat structure
  if (!lofterConfig) {
    lofterConfig = {}
    let hasConfig = false
    for (const key in data) {
      if (key.startsWith('lofter.')) {
        lofterConfig[key.replace('lofter.', '')] = data[key]
        hasConfig = true
      }
    }
    
    // If still no config found, check if data itself is the config (no prefix)
    if (!hasConfig && data.autoParse !== undefined) {
      lofterConfig = data
    }
  }
  
  config.set('lofter', lofterConfig)
  
  return Result.ok({}, '保存成功~')
}
