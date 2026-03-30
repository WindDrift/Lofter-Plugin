// 详细定义并且导出了锅巴（Guoba）可视化控制面板中每一项独立配置的表单组件模型（如开关、下拉选择、数字输入框等）及其具体描述说明
export default [

  // ===================== 通用设置 =====================
  {
    component: 'Divider',
    label: '通用设置'
  },
  {
    field: 'lofter.autoParse',
    label: '自动解析',
    bottomLabel: '检测到Lofter链接时自动解析',
    component: 'Switch'
  },
  {
    field: 'lofter.smartIndent',
    label: '智能首行缩进',
    bottomLabel: '如果段落没有缩进，自动在开头加两个全角空格',
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
    field: 'lofter.pureTextSendMode',
    label: '纯文发送模式',
    bottomLabel: '无图博文的纯文本分段组织方式',
    component: 'Select',
    componentProps: {
      options: [
        { label: '单消息 (每段空一行)', value: 'single' },
        { label: '多消息 (每段拆分一条，限合并转发)', value: 'multi' },
        { label: '图片模式 (转为渲染长图)', value: 'image' }
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

  // ===================== 发送设置 =====================
  {
    component: 'Divider',
    label: '发送设置'
  },
  {
    field: 'lofter.tagLinks',
    label: '标签链接',
    bottomLabel: '解析结果中显示带链接的标签列表消息',
    component: 'Switch'
  },
  {
    field: 'lofter.sendOriginal',
    label: '发送原图',
    bottomLabel: '是否发送原始图片（可能会增加流量消耗）',
    component: 'Switch'
  },
  {
    field: 'lofter.sendFirstImage',
    label: '发送首图',
    bottomLabel: '解析到有图片时，单独发第一张图到聊天（可做合并转发的预览）',
    component: 'Switch'
  },
  {
    field: 'lofter.enableImageSizeLimit',
    label: '限制图片大小',
    bottomLabel: '开启后对超出阈值的图片发送链接而不发原图',
    component: 'Switch'
  },
  {
    field: 'lofter.imageSizeLimit',
    label: '大小阈值 (MB)',
    bottomLabel: '触发图片大小限制的阈值（默认：8MB）',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 100
    }
  },

  // ===================== 纯文图片模式设置 =====================
  {
    component: 'Divider',
    label: '纯文图片模式设置'
  },
  {
    field: 'lofter.imageFont',
    label: '正文字体',
    bottomLabel: '填入系统字体名称。或放入字体文件到 resources/fonts 目录（优先读取）',
    component: 'Input'
  },
  {
    field: 'lofter.imageBgColor',
    label: '背景颜色',
    bottomLabel: '图片模式的全局背景颜色（HEX 色值，如 #FFFFFF）',
    component: 'Input'
  },
  {
    field: 'lofter.imageFontColor',
    label: '正文字体颜色',
    bottomLabel: '图片模式中正文文字的颜色（HEX 色值）',
    component: 'Input'
  },
  {
    field: 'lofter.imageFontSize',
    label: '正文字号 (px)',
    bottomLabel: '正文基础字号，单位 px，默认 26',
    component: 'InputNumber',
    componentProps: {
      min: 10,
      max: 36
    }
  },
  {
    field: 'lofter.imageLineHeight',
    label: '正文行高',
    bottomLabel: '数字倍数，如 1.5，控制行间距',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 3,
      step: 0.1
    }
  },
  {
    field: 'lofter.imageTitleColor',
    label: '标题颜色',
    bottomLabel: '图片模式中标题文字的颜色（HEX 色值）',
    component: 'Input'
  },
  {
    field: 'lofter.imageTitleSize',
    label: '标题字号 (px)',
    bottomLabel: '标题字号，单位 px，默认 32',
    component: 'InputNumber',
    componentProps: {
      min: 12,
      max: 48
    }
  },
  {
    field: 'lofter.imagePadding',
    label: '全局内边距 (px)',
    bottomLabel: '控制图片四周的留白大小，默认 40px',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 120
    }
  },
  {
    field: 'lofter.imageWidth',
    label: '图片宽度 (px)',
    bottomLabel: '布局基础宽度，默认 800px',
    component: 'InputNumber',
    componentProps: {
      min: 400,
      max: 2000
    }
  },
  {
    field: 'lofter.imageDeviceScale',
    label: '渲染倍率',
    bottomLabel: '无头浏览器渲染偏差系数：1 = 正常，2 = 2x 清晰，默认 2',
    component: 'InputNumber',
    componentProps: {
      min: 1,
      max: 4
    }
  },
  {
    field: 'lofter.imageTextLimit',
    label: '文本数量限制',
    bottomLabel: '长文本超过此字数将自动分页渲染为多张图片（0为不限制）',
    component: 'InputNumber',
    componentProps: {
      min: 0,
      max: 10000
    }
  },

  // ===================== 合并转发设置 =====================
  {
    component: 'Divider',
    label: '合并转发设置'
  },
  {
    field: 'lofter.forwardTitle',
    label: '转发标题',
    bottomLabel: '合并转发模式下聊天列表中显示的外显标题',
    component: 'Input'
  },
  {
    field: 'lofter.forwardNickname',
    label: '转发昵称',
    bottomLabel: '合并转发内部的发信人昵称（留空则默认使用 Bot 名称）',
    component: 'Input'
  }
]
