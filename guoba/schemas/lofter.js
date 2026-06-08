/**
 * @module guoba/schemas/lofter
 * @description Lofter 配置的锅巴面板表单结构定义（由 config/fields.js 自动生成）
 *
 * 增强点（M-01）：不再手工维护 schema，转为由 config/fields.js 自动产出
 * 新增配置项 = 改 fields.js 一处即可
 */

import { LOFTER_FIELDS } from '../../config/fields.js'

/** type → 锅巴 component 映射 */
const COMPONENT_MAP = {
  switch: 'Switch',
  input: 'Input',
  number: 'InputNumber',
  select: 'Select'
}

/**
 * 将字段定义转换为锅巴 schema 项
 * @param {object} field
 * @returns {object}
 */
function toSchemaItem(field) {
  if (field.type === 'divider') {
    return { component: 'Divider', label: field.label }
  }
  const item = {
    field: `lofter.${field.key}`,
    label: field.label,
    bottomLabel: field.bottomLabel || '',
    component: COMPONENT_MAP[field.type] || 'Input'
  }
  if (field.options) item.componentProps = { options: field.options }
  if (field.type === 'number') {
    item.componentProps = {
      ...(item.componentProps || {}),
      min: field.min,
      max: field.max
    }
    if (field.step !== undefined) item.componentProps.step = field.step
  }
  if (field.default !== undefined) item.defaultValue = field.default
  return item
}

/** 按 group → order 排序后展开为 schema 数组，组间插入 Divider */
const schemas = []
const grouped = new Map()
for (const f of LOFTER_FIELDS) {
  if (!grouped.has(f.group)) grouped.set(f.group, [])
  grouped.get(f.group).push(f)
}
for (const [group, fields] of grouped) {
  fields.sort((a, b) => a.order - b.order)
  schemas.push({ component: 'Divider', label: group })
  for (const f of fields) schemas.push(toSchemaItem(f))
}

export default schemas
