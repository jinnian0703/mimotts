import type {
  PresetConfig,
  StylePreset,
  TextTagPreset,
  VoiceDesignPreset,
} from "@/lib/types"

export const defaultTextTagPresets: TextTagPreset[] = [
  { label: "短停顿", value: "（停顿片刻）", category: "常用" },
  { label: "长停顿", value: "（长停顿）", category: "常用" },
  { label: "深吸气", value: "（深吸一口气）", category: "常用" },
  { label: "叹气", value: "（叹气）", category: "常用" },
  { label: "轻笑", value: "（轻笑）", category: "常用" },
  { label: "咳嗽", value: "（咳嗽）", category: "常用" },
  { label: "开心", value: "（开心）", category: "情绪" },
  { label: "悲伤", value: "（悲伤）", category: "情绪" },
  { label: "生气", value: "（生气）", category: "情绪" },
  { label: "温柔", value: "（温柔）", category: "情绪" },
  { label: "兴奋", value: "（兴奋）", category: "情绪" },
  { label: "平静", value: "（平静）", category: "情绪" },
  { label: "小声", value: "（小声）", category: "语气" },
  { label: "加快", value: "（语速变快）", category: "语气" },
  { label: "放慢", value: "（语速变慢）", category: "语气" },
  { label: "重读", value: "（重读）", category: "语气" },
  { label: "东北话", value: "（东北话）", category: "方言" },
  { label: "四川话", value: "（四川话）", category: "方言" },
  { label: "河南话", value: "（河南话）", category: "方言" },
  { label: "粤语", value: "（粤语）", category: "方言" },
  { label: "台湾腔", value: "（台湾腔）", category: "方言" },
]

export const defaultStylePresets: StylePreset[] = [
  {
    value: "standard",
    label: "标准播报",
    prompt: "专业、清晰、稳定的播报语气。语句边界明确，停顿自然。",
    delivery_mode: "speech",
  },
  {
    value: "service",
    label: "客服接待",
    prompt: "亲和、克制、耐心的服务语气。重点信息读得清楚，尾音自然收束。",
    delivery_mode: "speech",
  },
  {
    value: "training",
    label: "培训讲解",
    prompt: "讲解式表达，节奏稳健，关键术语略作强调，段落之间保留短暂停顿。",
    delivery_mode: "speech",
  },
  {
    value: "news",
    label: "新闻播报",
    prompt: "正式、客观、清晰的新闻播报语气。语速均衡，不夸张。",
    delivery_mode: "speech",
  },
  {
    value: "commercial",
    label: "活动口播",
    prompt: "积极、有活力的口播语气。重点词轻微强调，节奏紧凑但保持清晰。",
    delivery_mode: "speech",
  },
  {
    value: "singing",
    label: "自然演唱",
    prompt: "以自然、有旋律感的演唱方式表达。气息连贯，咬字清楚，情绪投入，避免播报腔。",
    delivery_mode: "singing",
  },
  {
    value: "singing-pop",
    label: "流行抒情",
    prompt: "以流行抒情歌曲的方式演唱。旋律柔和，情绪真诚，尾音自然延展，副歌部分更饱满。",
    delivery_mode: "singing",
  },
  {
    value: "singing-bright",
    label: "轻快活力",
    prompt: "以轻快、有活力的演唱方式表达。节奏明朗，咬字清晰，情绪积极，适合明亮欢快的旋律。",
    delivery_mode: "singing",
  },
  {
    value: "singing-ballad",
    label: "温柔民谣",
    prompt: "以温柔民谣的方式演唱。声音贴近、气息柔和，节奏舒展，保留细腻的情绪起伏。",
    delivery_mode: "singing",
  },
  {
    value: "singing-dramatic",
    label: "情绪高亢",
    prompt: "以情绪更强的演唱方式表达。层次递进，高潮处更有力量，保持清晰咬字和稳定气息。",
    delivery_mode: "singing",
  },
  {
    value: "director",
    label: "导演模式",
    prompt:
      "角色：专业企业旁白，声线稳定，吐字清晰。\n场景：面向正式产品介绍、培训材料或系统通知。\n指导：中等语速，句尾自然收束，重点词略作强调，段落间保留短暂停顿。",
    delivery_mode: "speech",
  },
]

export const defaultVoiceDesignPresets: VoiceDesignPreset[] = [
  {
    value: "warm-service",
    label: "温柔客服",
    description: "温柔、亲和、清晰的年轻女声，适合客服接待、售前咨询和轻量通知。",
    text: "您好，我是您的专属语音助手，很高兴为您服务。",
    speech_rate: "normal",
    optimize_text_preview: true,
  },
  {
    value: "calm-narrator",
    label: "沉稳旁白",
    description:
      "成熟、稳定、有可信度的旁白声线，吐字清楚，节奏从容，适合产品介绍和纪录片式说明。",
    text: "从这一刻开始，我们将用更清晰的声音传达每一个重要信息。",
    speech_rate: "normal",
    optimize_text_preview: true,
  },
  {
    value: "energetic-host",
    label: "活力主持",
    description:
      "明亮、有感染力的主持声线，节奏积极但不夸张，适合活动口播、短视频开场和促销介绍。",
    text: "欢迎来到今天的精彩内容，让我们马上开始。",
    speech_rate: "fast",
    optimize_text_preview: true,
  },
  {
    value: "training-teacher",
    label: "培训讲师",
    description:
      "专业、耐心、条理清晰的讲师音色，重点词自然强调，段落边界明确。",
    text: "接下来我们分步骤讲解这个功能的使用方法。",
    speech_rate: "normal",
    optimize_text_preview: true,
  },
  {
    value: "magnetic-male",
    label: "磁性男声",
    description: "低沉、温暖、富有质感的男声，适合品牌片、深夜电台和情绪化文案。",
    text: "声音可以穿过时间，把此刻的情绪完整留下。",
    speech_rate: "slow",
    optimize_text_preview: true,
  },
]

export const defaultPresetConfig: PresetConfig = {
  text_tags: defaultTextTagPresets,
  style_presets: defaultStylePresets,
  voice_design_presets: defaultVoiceDesignPresets,
  source: "default",
  has_personal: false,
}

export function normalizePresetConfig(config?: Partial<PresetConfig> | null): PresetConfig {
  return {
    text_tags: config?.text_tags ?? config?.textTags ?? defaultTextTagPresets,
    style_presets: config?.style_presets ?? config?.stylePresets ?? defaultStylePresets,
    voice_design_presets:
      config?.voice_design_presets ??
      config?.voiceDesignPresets ??
      defaultVoiceDesignPresets,
    source: config?.source ?? "default",
    has_personal: config?.has_personal ?? config?.hasPersonal ?? false,
  }
}

export function stylePresetDeliveryMode(preset: StylePreset) {
  return preset.delivery_mode ?? preset.deliveryMode ?? "speech"
}

export function voiceDesignSpeechRate(preset: VoiceDesignPreset) {
  return preset.speech_rate ?? preset.speechRate ?? "normal"
}

export function voiceDesignOptimizeTextPreview(preset: VoiceDesignPreset) {
  return preset.optimize_text_preview ?? preset.optimizeTextPreview ?? true
}
