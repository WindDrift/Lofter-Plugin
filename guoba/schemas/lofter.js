
export default [
  {
    field: 'lofter.autoParse',
    label: '自动解析',
    bottomLabel: '检测到Lofter链接时自动解析',
    component: 'Switch'
  },
  {
    field: 'lofter.sendOriginal',
    label: '发送原图',
    bottomLabel: '是否发送原始图片（可能会增加流量消耗）',
    component: 'Switch'
  },
  {
    field: 'lofter.sendMode',
    label: '发送模式',
    bottomLabel: '选择消息发送的方式',
    component: 'Select',
    componentProps: {
      options: [
        { label: '合并转发', value: 'forward' },
        { label: '逐条发送', value: 'normal' }
      ]
    }
  },
  {
    field: 'lofter.timeout',
    label: '超时时间',
    bottomLabel: '解析请求的超时时间（秒）',
    component: 'InputNumber',
    componentProps: {
      min: 5,
      max: 120
    }
  },
  {
    field: 'lofter.showTags',
    label: '显示标签',
    bottomLabel: '解析结果中是否显示标签',
    component: 'Switch'
  }
]
