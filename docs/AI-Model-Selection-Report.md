# NIHPLOD AI护肤顾问 - 大模型配置选型报告

> 报告日期：2025年12月6日  
> 项目：NIHPLOD 旎柏 AI智能护肤顾问系统

---

## 一、概述

NIHPLOD AI护肤顾问系统需要配置两类大模型：

1. **视觉分析模型（Vision Model）** - 用于面部照片的肌肤状态检测
2. **文本分析模型（Text Model）** - 用于问卷分析和个性化护肤建议生成

本报告汇总全球主流大模型服务商及其产品，供选型参考。

---

## 二、视觉分析模型（支持图像识别）

### 2.1 国际服务商

| 服务商 | 模型名称 | 图像能力 | 响应速度 | 价格（USD/M tokens） | API稳定性 |
|--------|----------|----------|----------|----------------------|-----------|
| **OpenAI** | GPT-4o | ⭐⭐⭐⭐⭐ | 快 | $5 (输入) / $15 (输出) | 高 |
| **OpenAI** | GPT-4o-mini | ⭐⭐⭐⭐ | 极快 | $0.15 / $0.6 | 高 |
| **Anthropic** | Claude 3.5 Sonnet | ⭐⭐⭐⭐⭐ | 快 | $3 / $15 | 高 |
| **Anthropic** | Claude 3 Opus | ⭐⭐⭐⭐⭐ | 中 | $15 / $75 | 高 |
| **Google** | Gemini 2.0 Flash | ⭐⭐⭐⭐ | 极快 | 免费额度高 | 中 |
| **Google** | Gemini 1.5 Pro | ⭐⭐⭐⭐⭐ | 快 | $1.25 / $5 | 中 |
| **Mistral** | Pixtral Large | ⭐⭐⭐⭐ | 快 | €2 / €6 | 高 |

### 2.2 国内服务商

| 服务商 | 模型名称 | 图像能力 | 响应速度 | 价格（CNY/千tokens） | 备注 |
|--------|----------|----------|----------|----------------------|------|
| **通义千问** | Qwen-VL-Max | ⭐⭐⭐⭐⭐ | 快 | ¥0.02 | 阿里云，稳定 |
| **通义千问** | Qwen-VL-Plus | ⭐⭐⭐⭐ | 极快 | ¥0.008 | 性价比高 |
| **智谱AI** | GLM-4V-Plus | ⭐⭐⭐⭐ | 快 | ¥0.01 | 清华系 |
| **腾讯混元** | Hunyuan-Vision | ⭐⭐⭐⭐ | 快 | ¥0.018 | 腾讯云 |
| **百度文心** | ERNIE-4.0-8K | ⭐⭐⭐⭐ | 中 | ¥0.12 | 百度云 |
| **字节豆包** | Doubao-Vision | ⭐⭐⭐⭐ | 快 | ¥0.003 | 极便宜 |
| **讯飞星火** | Spark-4.0-Ultra | ⭐⭐⭐ | 中 | ¥0.05 | 科大讯飞 |

---

## 三、文本分析模型

### 3.1 国际服务商

| 服务商 | 模型名称 | 推理能力 | 中文能力 | 价格（USD/M tokens） | 特点 |
|--------|----------|----------|----------|----------------------|------|
| **OpenAI** | GPT-4o | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $2.5 / $10 | 综合最强 |
| **OpenAI** | GPT-4o-mini | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $0.15 / $0.6 | 性价比高 |
| **OpenAI** | o1 / o1-mini | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $15 / $60 | 深度推理 |
| **Anthropic** | Claude 3.5 Sonnet | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $3 / $15 | 安全可靠 |
| **Anthropic** | Claude 3.5 Haiku | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $0.25 / $1.25 | 快速便宜 |
| **Google** | Gemini 1.5 Pro | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $1.25 / $5 | 长上下文 |
| **Mistral** | Mistral Large | ⭐⭐⭐⭐ | ⭐⭐⭐ | €2 / €6 | 欧洲模型 |

### 3.2 国内服务商

| 服务商 | 模型名称 | 推理能力 | 中文能力 | 价格（CNY/千tokens） | 特点 |
|--------|----------|----------|----------|----------------------|------|
| **DeepSeek** | DeepSeek-V3 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥1 / ¥2 | 性价比之王 |
| **DeepSeek** | DeepSeek-R1 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥4 / ¥16 | 深度推理 |
| **通义千问** | Qwen-Max | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.02 / ¥0.06 | 阿里云 |
| **通义千问** | Qwen-Plus | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.0008 / ¥0.002 | 极便宜 |
| **智谱AI** | GLM-4-Plus | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.05 | 清华系 |
| **智谱AI** | GLM-4-Flash | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 免费 | 免费额度大 |
| **月之暗面** | Moonshot-v1-128k | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.012 | 超长上下文 |
| **字节豆包** | Doubao-Pro-32k | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.0008 | 极便宜 |
| **百川智能** | Baichuan4 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.1 | 中文优化 |
| **MiniMax** | abab6.5s | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ¥0.01 | 对话流畅 |
| **零一万物** | Yi-Large | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.02 | 李开复团队 |
| **阶跃星辰** | Step-2 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ¥0.038 | 新锐模型 |

---

## 四、推荐配置方案

### 方案A：性价比优先（推荐首选）

```env
# 文本分析 - DeepSeek（国产最强性价比）
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat
DEEPSEEK_API_KEY=sk-xxxxx
DEEPSEEK_API_URL=https://api.deepseek.com/v1

# 视觉分析 - OpenAI GPT-4o-mini（便宜且够用）
AI_VISION_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
```

**月成本估算**：约 $10-30/月（1000次分析）

---

### 方案B：全能体验（效果最佳）

```env
# 文本分析 - GPT-4o
AI_PROVIDER=openai
AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-xxxxx

# 视觉分析 - GPT-4o
AI_VISION_PROVIDER=openai
```

**月成本估算**：约 $50-150/月（1000次分析）

---

### 方案C：国内稳定访问（无需翻墙）

```env
# 文本分析 - 通义千问
AI_PROVIDER=qwen
AI_MODEL=qwen-max
DASHSCOPE_API_KEY=sk-xxxxx

# 视觉分析 - 通义千问
AI_VISION_PROVIDER=qwen
AI_VISION_MODEL=qwen-vl-max
```

**月成本估算**：约 ¥20-50/月（1000次分析）

---

### 方案D：极致低成本

```env
# 文本分析 - 智谱GLM-4-Flash（有免费额度）
AI_PROVIDER=zhipu
AI_MODEL=glm-4-flash
ZHIPU_API_KEY=xxxxx

# 视觉分析 - 豆包（极便宜）
AI_VISION_PROVIDER=doubao
AI_VISION_MODEL=doubao-vision-pro
DOUBAO_API_KEY=xxxxx
```

**月成本估算**：约 ¥5-15/月（1000次分析）

---

## 五、各服务商 API 端点汇总

| 服务商 | API Base URL | 文档链接 |
|--------|--------------|----------|
| OpenAI | https://api.openai.com/v1 | https://platform.openai.com/docs |
| Anthropic | https://api.anthropic.com/v1 | https://docs.anthropic.com |
| Google | https://generativelanguage.googleapis.com | https://ai.google.dev/docs |
| DeepSeek | https://api.deepseek.com/v1 | https://platform.deepseek.com/docs |
| 通义千问 | https://dashscope.aliyuncs.com/api/v1 | https://help.aliyun.com/zh/dashscope |
| 智谱AI | https://open.bigmodel.cn/api/paas/v4 | https://open.bigmodel.cn/dev/api |
| 月之暗面 | https://api.moonshot.cn/v1 | https://platform.moonshot.cn/docs |
| 字节豆包 | https://ark.cn-beijing.volces.com/api/v3 | https://www.volcengine.com/docs/82379 |
| 百川智能 | https://api.baichuan-ai.com/v1 | https://platform.baichuan-ai.com/docs |
| MiniMax | https://api.minimax.chat/v1 | https://www.minimaxi.com/document |
| 腾讯混元 | https://hunyuan.tencentcloudapi.com | https://cloud.tencent.com/document/product/1729 |
| 百度文心 | https://aip.baidubce.com/rpc/2.0/ai_custom | https://cloud.baidu.com/doc/WENXINWORKSHOP |

---

## 六、当前项目已支持的模型

根据代码分析，项目当前已集成：

| 功能 | 已支持服务商 | 配置环境变量 |
|------|--------------|--------------|
| 视觉分析 | OpenAI (GPT-4o), Anthropic (Claude) | `AI_VISION_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` |
| 文本分析 | OpenAI, Anthropic, DeepSeek | `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` |

---

## 七、扩展建议

如需添加更多国产模型支持，需修改以下文件：

1. `src/lib/ai.ts` - 添加新服务商的 API 调用逻辑
2. `src/app/api/advisor/face-analyze/route.ts` - 添加视觉模型调用
3. `src/app/(admin)/admin/settings/page.tsx` - 管理后台添加选项
4. `.env.example` - 添加新环境变量说明

---

## 八、总结建议

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| **初期测试** | 方案D（智谱+豆包） | 成本极低，可快速验证 |
| **正式上线** | 方案A（DeepSeek+GPT-4o-mini） | 性价比最优 |
| **高端用户** | 方案B（全GPT-4o） | 效果最佳 |
| **国内访问优先** | 方案C（通义千问） | 无需翻墙，稳定可靠 |

---

*报告完毕 - NIHPLOD Tech Team*

