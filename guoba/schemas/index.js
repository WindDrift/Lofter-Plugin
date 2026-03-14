
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
  const lofterConfig = data.lofter
  
  // Validate or process config if needed
  
  config.set('lofter', lofterConfig)
  
  return Result.ok({}, '保存成功~')
}
