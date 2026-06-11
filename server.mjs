import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'

dotenv.config({ path: '.env.local' })
dotenv.config()

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

const PORT = Number(process.env.API_PORT || 8787)
const BASE_URL = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1'
const MODEL = process.env.AGNES_MODEL || 'agnes-2.0-flash'
const AI_TIMEOUT_MS = Number(process.env.AGNES_TIMEOUT_MS || 60000)

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: MODEL, hasKey: Boolean(process.env.AGNES_API_KEY) })
})

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, system } = req.body
    const content = await chat([
      {
        role: 'system',
        content:
          system ||
          '你是一个 Linux 期末复习教练。回答要简洁、准确、面向考试，优先给可执行命令、易错点和记忆法。',
      },
      ...(Array.isArray(messages) ? messages : []),
    ])
    res.json({ content })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/ai/notes', async (req, res) => {
  try {
    const { weakTags = [], wrongQuestions = [], stats = {} } = req.body
    const prompt = `请基于下面的练习数据生成一份 Linux 期末冲刺笔记。

要求：
1. 用中文输出。
2. 按「优先复习」「易错命令」「Shell 脚本模板」「今晚训练安排」四段组织。
3. 内容要短而实用，不要空泛鼓励。

薄弱标签：${JSON.stringify(weakTags)}
错题样例：${JSON.stringify(wrongQuestions).slice(0, 6000)}
统计：${JSON.stringify(stats)}`
    const content = await chat([
      { role: 'system', content: '你是 Linux 课程考前冲刺笔记助手，只输出笔记正文。' },
      { role: 'user', content: prompt },
    ])
    res.json({ content })
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/ai/grade-answer', async (req, res) => {
  try {
    const { question, userAnswer } = req.body
    if (!question || typeof userAnswer !== 'string') throw new Error('缺少题目或作答内容')
    const grade = await gradeAnswerWithAi(question, userAnswer)
    res.json(grade)
  } catch (error) {
    sendError(res, error)
  }
})

app.post('/api/ai/import-questions', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('没有收到文件')
    const mime = req.file.mimetype || ''
    const fileName = req.file.originalname || 'upload'
    const isImage = mime.startsWith('image/')
    const prompt = questionImportPrompt(fileName)
    const userContent = isImage
      ? [
          { type: 'text', text: `${prompt}\n\n这是一张题目截图，请先 OCR，再解析为题库 JSON。` },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${req.file.buffer.toString('base64')}`,
            },
          },
        ]
      : `${prompt}\n\n文件内容：\n${req.file.buffer.toString('utf8')}`

    const raw = await chat([
      { role: 'system', content: '你是题库结构化助手。必须只输出合法 JSON 数组，不能输出 Markdown。' },
      { role: 'user', content: userContent },
    ])
    const questions = parseJsonArray(raw).map(normalizeQuestion)
    res.json({ questions, rawCount: questions.length })
  } catch (error) {
    sendError(res, error)
  }
})

async function chat(messages) {
  if (!process.env.AGNES_API_KEY) throw new Error('缺少 AGNES_API_KEY，请在 .env.local 中配置')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS)
  try {
    const response = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.AGNES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Agnes API ${response.status}: ${text.slice(0, 500)}`)
    const data = JSON.parse(text)
    return data.choices?.[0]?.message?.content || ''
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Agnes API 请求超过 ${Math.round(AI_TIMEOUT_MS / 1000)} 秒，已自动取消`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function gradeAnswerWithAi(question, userAnswer) {
  const raw = await chat([
    {
      role: 'system',
      content:
        '你是 Linux 课程阅卷老师。你只根据题目、标准答案和学生答案判分。重点输出对照分析：学生命中了什么、遗漏了什么、哪里错误、如何改成满分答案。必须只输出 JSON，不要 Markdown。',
    },
    { role: 'user', content: gradePrompt(question, userAnswer) },
  ])
  const parsed = await parseGradeJson(raw)
  return normalizeGrade(parsed, question)
}

function gradePrompt(question, userAnswer) {
  const reference = String(question.answer || '').trim()
  const explanation = String(question.explanation || '').trim()
  return `请批改下面这道 Linux 复习题。

题型：${question.type || ''}
章节：${question.chapter || ''} ${question.section || ''}
题目：
${question.question || ''}

标准答案：
${reference || '本题没有预置标准答案，请你先基于 Linux 正确知识生成参考答案，再判分。'}

原题解析：
${explanation || '无'}

学生答案：
${userAnswer}

输出要求：
只输出一个合法 JSON 对象，字段固定为：
{
  "isCorrect": true,
  "score": 0,
  "analysis": "先给一句结论，再对照标准答案说明：命中的点、遗漏的点、错误的点、考试应如何表述。中文，具体，不要空话。",
  "referenceAnswer": "标准答案或你生成的参考答案"
}

判分规则：
- 有标准答案时，必须以标准答案为主要依据，允许同义表达。
- 简答题看关键点覆盖率，不要求逐字一致。
- Shell 编程题看命令/脚本是否能实现题意，指出语法、路径、权限、变量、循环和重定向等问题。
- score 取 0-100；80 分及以上算 isCorrect=true，否则 false。
- analysis 必须直接评价学生答案，不能只复述知识点。`
}

async function parseGradeJson(raw) {
  try {
    return parseJsonObject(raw)
  } catch {
    const repaired = await chat([
      { role: 'system', content: '你是 JSON 修复器。把输入改写为一个合法 JSON 对象，只输出 JSON。字段必须包含 isCorrect、score、analysis、referenceAnswer。' },
      { role: 'user', content: raw },
    ])
    return parseJsonObject(repaired)
  }
}

function normalizeGrade(json, question) {
  const score = clampScore(json.score)
  const hasBoolean = typeof json.isCorrect === 'boolean'
  return {
    isCorrect: hasBoolean ? json.isCorrect : score >= 80,
    score,
    analysis: String(json.analysis || 'AI 已完成判分，但没有返回详细分析。'),
    referenceAnswer: String(json.referenceAnswer || question.answer || ''),
  }
}

function clampScore(value) {
  const score = Number(value)
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function questionImportPrompt(fileName) {
  return `从文件「${fileName}」中识别 Linux 题目，输出 JSON 数组。

每项字段固定为：
- id: 空字符串即可
- type: choice / judge / short_answer / shell_coding
- difficulty: easy / medium / hard
- chapter: 如「第2章」，无法判断填「未分类」
- section: 小节号，无法判断填空字符串
- question: 题干
- options: 选项数组；非选择题为空数组
- answer: 正确答案；选择题填 A/B/C/D，判断题填 正确/错误
- explanation: 简短解析
- tags: 知识点标签数组

规则：
- 只输出 JSON 数组，不要解释。
- 图片里如果有多题就全部识别。
- 无法确定答案时 answer 填空字符串，explanation 说明「无标准答案，练习时将由 AI 根据题目判分」。
- Shell 脚本、命令、路径要保持原样。`
}

function parseJsonArray(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error(`AI 没有返回 JSON 数组：${raw.slice(0, 300)}`)
  const parsed = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('AI 返回的不是 JSON 数组')
  return parsed
}

function parseJsonObject(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error(`AI 没有返回 JSON 对象：${raw.slice(0, 300)}`)
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeQuestion(question, index) {
  const typeSet = new Set(['choice', 'judge', 'short_answer', 'shell_coding'])
  const difficultySet = new Set(['easy', 'medium', 'hard'])
  return {
    id: question.id || `imported-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    type: typeSet.has(question.type) ? question.type : inferType(question),
    difficulty: difficultySet.has(question.difficulty) ? question.difficulty : 'medium',
    chapter: String(question.chapter || '未分类'),
    section: String(question.section || ''),
    question: String(question.question || '').trim(),
    options: Array.isArray(question.options) ? question.options.map(String) : [],
    answer: String(question.answer || '').trim(),
    explanation: String(question.explanation || ''),
    tags: Array.isArray(question.tags) ? question.tags.map(String) : [],
  }
}

function inferType(question) {
  if (Array.isArray(question.options) && question.options.length > 0) return 'choice'
  const text = `${question.question || ''}\n${question.answer || ''}`.toLowerCase()
  if (text.includes('shell') || text.includes('#!/bin/bash')) return 'shell_coding'
  return 'short_answer'
}

function sendError(res, error) {
  const message = error instanceof Error ? error.message : '未知错误'
  res.status(500).json({ error: message })
}

app.listen(PORT, () => {
  console.log(`LinuxMastery AI API listening on http://127.0.0.1:${PORT}`)
})
