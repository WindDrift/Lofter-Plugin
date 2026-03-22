import fs from 'node:fs'

// 读取 apps 目录下的所有插件文件，过滤出以 .js 结尾的文件
const files = fs.readdirSync('./plugins/Lofter-Plugin/apps').filter(file => file.endsWith('.js'))

let ret = []
// 遍历所有找到的 .js 文件，并将导入的 Promise 存入 ret 数组
files.forEach((file) => {
  ret.push(import(`./apps/${file}`))
})
// 等待所有的模块异步导入完成，无论成功还是失败
ret = await Promise.allSettled(ret)

let apps = {}
// 遍历加载完成的结果，提取成功加载的模块
for (let i in files) {
  let name = files[i].replace('.js', '') // 移除后缀，提取插件名称
  // 如果当前模块没有成功加载（状态不是 fulfilled）
  if (ret[i].status !== 'fulfilled') {
    logger.error(`[Lofter解析] 载入插件错误：${name}`)
    logger.error(ret[i].reason) // 打印错误原因
    continue // 跳过当前模块，继续下一个
  }
  // 将成功加载的模块对象存入 apps 中，使用 Object.keys 获取其导出的第一个属性
  apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
}

logger.mark('[Lofter解析] 插件已就绪')

// 导出所有成功加载的插件对象
export { apps }
