// 详细定义并且导出了锅巴（Guoba）可视化控制面板中每一项独立配置的表单组件模型（如开关、下拉选择、数字输入框等）及其具体描述说明
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
    field: 'lofter.sendFirstImage',
    label: '发送首图',
    bottomLabel: '解析到有图片时，单独发第一张图到聊天（可做合并转发的预览）',
    component: 'Switch'
  },
  {
    field: 'lofter.forwardTitle',
    label: '转发标题',
    bottomLabel: '合并转发模式下的外显消息标题',
    component: 'Input'
  },
  {
    field: 'lofter.forwardNickname',
    label: '转发昵称',
    bottomLabel: '合并转发模式下的内部发信人昵称（留空则默认Bot名称）',
    component: 'Input'
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
  },
  {
    field: 'lofter.enableImageSizeLimit',
    label: '限制图片大小',
    bottomLabel: '开启后对超出的图片发送链接而不发原图',
    component: 'Switch'
  },
  {
    field: 'lofter.imageSizeLimit',
    label: '大小阈值(MB)',
    bottomLabel: '触发图片大小限制的阈值（默认: 8MB）',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 100
    }
  }
]
