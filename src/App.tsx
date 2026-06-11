import {
  ArrowLeft,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Database,
  Download,
  FileQuestion,
  FlaskConical,
  Home,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Upload,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import questionsData from './data/questions.json'
import './App.css'

type QuestionType = 'choice' | 'judge' | 'short_answer' | 'shell_coding'
type Difficulty = 'easy' | 'medium' | 'hard'
type PracticeMode = 'chapter' | 'type' | 'exam' | 'wrong' | 'smart'
type View = 'dashboard' | 'practice' | 'result' | 'data' | 'lab' | 'notes' | 'import'

type Question = {
  id: string
  type: QuestionType
  difficulty: Difficulty
  chapter: string
  section: string
  question: string
  options: string[]
  answer: string
  explanation: string
  tags: string[]
}

type PracticeRecord = {
  id: string
  questionId: string
  userAnswer: string
  isCorrect: boolean
  timeSpent: number
  practiceMode: PracticeMode
  createdAt: string
}

type SessionAnswer = {
  questionId: string
  answer: string
  isCorrect: boolean
  timeSpent: number
  score?: number
  analysis?: string
  referenceAnswer?: string
}

type PracticeSession = {
  mode: PracticeMode
  title: string
  questions: Question[]
  currentIndex: number
  answers: Record<string, SessionAnswer>
  startedAt: number
  questionStartedAt: number
}

type FsFile = {
  type: 'file'
  mode: number
  content: string
}

type FsDir = {
  type: 'dir'
  mode: number
  children: Record<string, FsNode>
}

type FsNode = FsFile | FsDir

type TerminalLine = {
  kind: 'input' | 'output' | 'error' | 'hint'
  text: string
}

type EditorState = {
  path: string
  content: string
}

class ScriptExit extends Error {
  code: number

  constructor(code: number) {
    super(`exit ${code}`)
    this.code = code
  }
}

const BUILTIN_QUESTIONS = questionsData as Question[]
const RECORDS_KEY = 'linux-mastery:practice-records'
const IMPORTED_QUESTIONS_KEY = 'linux-mastery:imported-questions'
const LAB_STATE_KEY = 'linux-mastery:lab-state'
const AI_REQUEST_TIMEOUT_MS = 65000

const typeLabels: Record<QuestionType, string> = {
  choice: '选择题',
  judge: '判断题',
  short_answer: '简答题',
  shell_coding: 'Shell 编程题',
}

const difficultyLabels: Record<Difficulty, string> = {
  easy: '基础',
  medium: '提升',
  hard: '冲刺',
}

const modeLabels: Record<PracticeMode, string> = {
  chapter: '章节练习',
  type: '题型练习',
  exam: '模拟考试',
  wrong: '错题回顾',
  smart: '智能复习',
}

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [records, setRecords] = useLocalRecords()
  const [importedQuestions, setImportedQuestions] = useLocalQuestions()
  const questions = useMemo(() => [...BUILTIN_QUESTIONS, ...importedQuestions], [importedQuestions])
  const [session, setSession] = useState<PracticeSession | null>(null)
  const [lastSession, setLastSession] = useState<PracticeSession | null>(null)
  const stats = useMemo(() => buildStats(questions, records), [questions, records])

  const startSession = (mode: PracticeMode, pool: Question[], title: string) => {
    const selected = pickQuestions(mode, pool, records)
    if (selected.length === 0) return
    setSession({
      mode,
      title,
      questions: selected,
      currentIndex: 0,
      answers: {},
      startedAt: Date.now(),
      questionStartedAt: Date.now(),
    })
    setView('practice')
  }

  const restartWrong = () => {
    const wrongIds = new Set(
      Object.values(lastSession?.answers ?? {})
        .filter((answer) => !answer.isCorrect)
        .map((answer) => answer.questionId),
    )
    const retry = questions.filter((question) => wrongIds.has(question.id))
    if (retry.length > 0) startSession('wrong', retry, '本轮错题再练')
  }

  return (
    <main className="app-shell">
      <TopBar view={view} setView={setView} />
      {view === 'dashboard' && (
        <Dashboard
          questions={questions}
          importedCount={importedQuestions.length}
          records={records}
          stats={stats}
          startSession={startSession}
          setView={setView}
        />
      )}
      {view === 'practice' && session && (
        <PracticeView
          records={records}
          session={session}
          setRecords={setRecords}
          setSession={setSession}
          finishSession={(finished) => {
            setLastSession(finished)
            setView('result')
          }}
          exit={() => setView('dashboard')}
        />
      )}
      {view === 'result' && lastSession && (
        <ResultView
          records={records}
          session={lastSession}
          restartWrong={restartWrong}
          backHome={() => setView('dashboard')}
        />
      )}
      {view === 'lab' && <LabView backHome={() => setView('dashboard')} />}
      {view === 'notes' && (
        <NotesView questions={questions} records={records} stats={stats} backHome={() => setView('dashboard')} />
      )}
      {view === 'import' && (
        <ImportView
          addQuestions={(items) => setImportedQuestions([...items, ...importedQuestions])}
          backHome={() => setView('dashboard')}
        />
      )}
      {view === 'data' && (
        <DataView
          records={records}
          setRecords={setRecords}
          importedQuestions={importedQuestions}
          setImportedQuestions={setImportedQuestions}
          totalQuestions={questions.length}
          backHome={() => setView('dashboard')}
        />
      )}
    </main>
  )
}

function TopBar({ view, setView }: { view: View; setView: (view: View) => void }) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={() => setView('dashboard')}>
        <span className="brand-mark">
          <Code2 size={20} />
        </span>
        <span>
          <strong>LinuxMastery</strong>
          <small>期末专项训练</small>
        </span>
      </button>
      <nav className="topnav" aria-label="主导航">
        <button className={view === 'dashboard' ? 'active' : ''} type="button" onClick={() => setView('dashboard')}>
          <Home size={18} />
          <span>首页</span>
        </button>
        <button className={view === 'lab' ? 'active' : ''} type="button" onClick={() => setView('lab')}>
          <Terminal size={18} />
          <span>实验室</span>
        </button>
        <button className={view === 'import' ? 'active' : ''} type="button" onClick={() => setView('import')}>
          <Upload size={18} />
          <span>导题</span>
        </button>
      </nav>
    </header>
  )
}

function Dashboard({
  questions,
  importedCount,
  records,
  stats,
  startSession,
  setView,
}: {
  questions: Question[]
  importedCount: number
  records: PracticeRecord[]
  stats: ReturnType<typeof buildStats>
  startSession: (mode: PracticeMode, pool: Question[], title: string) => void
  setView: (view: View) => void
}) {
  const [chapter, setChapter] = useState(stats.chapters[0] ?? '')
  const [type, setType] = useState<QuestionType>('choice')
  const wrongIds = useMemo(() => getWrongQuestionIds(records), [records])
  const wrongQuestions = questions.filter((question) => wrongIds.has(question.id))
  const chapterQuestions = questions.filter((question) => question.chapter === chapter)
  const typeQuestions = questions.filter((question) => question.type === type)

  return (
    <section className="screen">
      <section className="home-hero">
        <div>
          <p className="eyebrow">Linux Final Training</p>
          <h1>考前冲刺题库</h1>
          <p className="hero-copy">覆盖文件权限、Vim、Shell 脚本、用户管理。练习记录留在本机，AI 用来导题、讲解和生成冲刺笔记。</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary-action" onClick={() => startSession('smart', questions, '智能复习')}>
            <Brain size={18} />
            智能复习
          </button>
          <button type="button" className="secondary-action" onClick={() => startSession('exam', questions, '模拟考试')}>
            <Clock3 size={18} />
            模拟考试
          </button>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="题库总量" value={questions.length} icon={<FileQuestion size={19} />} />
        <StatCard label="导入题目" value={importedCount} icon={<Upload size={19} />} />
        <StatCard label="已练题目" value={stats.practicedCount} icon={<CheckCircle2 size={19} />} />
        <StatCard label="错题待攻克" value={wrongQuestions.length} icon={<RotateCcw size={19} />} />
      </section>

      <SectionTitle title="练习模式" />
      <section className="tool-grid">
        <ToolCard
          icon={<Brain size={28} />}
          tint="blue"
          title="智能复习"
          desc="优先抽未练、错题和 Shell 重点"
          onClick={() => startSession('smart', questions, '智能复习')}
        />
        <ToolCard
          icon={<Clock3 size={28} />}
          tint="purple"
          title="模拟考试"
          desc="随机组卷，按考试节奏刷题"
          onClick={() => startSession('exam', questions, '模拟考试')}
        />
        <ToolCard
          icon={<RotateCcw size={28} />}
          tint="red"
          title="错题回顾"
          desc={wrongQuestions.length > 0 ? `${wrongQuestions.length} 道错题可复盘` : '完成练习后自动生成'}
          disabled={wrongQuestions.length === 0}
          onClick={() => startSession('wrong', wrongQuestions, '错题回顾')}
        />
      </section>

      <section className="selector-grid">
        <div className="panel">
          <SectionTitle title="章节练习" compact />
          <div className="inline-control">
            <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
              {stats.chapters.map((item) => (
                <option key={item} value={item}>
                  {item} · {questions.filter((question) => question.chapter === item).length} 题
                </option>
              ))}
            </select>
            <button type="button" className="primary-action" onClick={() => startSession('chapter', chapterQuestions, `${chapter} 专项`)}>
              <Play size={17} />
              开始
            </button>
          </div>
        </div>
        <div className="panel">
          <SectionTitle title="题型练习" compact />
          <div className="inline-control">
            <select value={type} onChange={(event) => setType(event.target.value as QuestionType)}>
              {(Object.keys(typeLabels) as QuestionType[]).map((item) => (
                <option key={item} value={item}>
                  {typeLabels[item]} · {questions.filter((question) => question.type === item).length} 题
                </option>
              ))}
            </select>
            <button type="button" className="primary-action" onClick={() => startSession('type', typeQuestions, `${typeLabels[type]} 专练`)}>
              <Play size={17} />
              开始
            </button>
          </div>
        </div>
      </section>

      <SectionTitle title="学习工具" />
      <section className="tool-grid two">
        <ToolCard
          icon={<FlaskConical size={30} />}
          tint="purple"
          title="指令实验室"
          desc="仿终端练习，目录、权限、命令输出会真实变化"
          onClick={() => setView('lab')}
        />
        <ToolCard
          icon={<Sparkles size={30} />}
          tint="blue"
          title="冲刺笔记"
          desc="AI 基于错题和薄弱点生成专属备考指南"
          onClick={() => setView('notes')}
        />
      </section>

      <SectionTitle title="题库与进度" />
      <section className="tool-grid two">
        <ToolCard
          icon={<Upload size={30} />}
          tint="green"
          title="导入题库"
          desc="支持 .txt、.md、PNG/JPG 截图 OCR 识别"
          onClick={() => setView('import')}
        />
        <ToolCard
          icon={<Database size={30} />}
          tint="gray"
          title="本地数据"
          desc="导出、导入或清空练习记录"
          onClick={() => setView('data')}
        />
      </section>

      <section className="dashboard-bottom">
        <div className="panel">
          <SectionTitle title="章节覆盖" compact />
          <div className="bar-list">
            {stats.chapterStats.map((item) => (
              <ProgressRow
                key={item.chapter}
                label={item.chapter}
                meta={`${item.practiced}/${item.total}`}
                value={item.total === 0 ? 0 : (item.practiced / item.total) * 100}
              />
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionTitle title="题型分布" compact />
          <div className="pill-grid">
            {stats.typeStats.map((item) => (
              <span key={item.type} className="metric-pill">
                {typeLabels[item.type]}
                <strong>{item.total}</strong>
              </span>
            ))}
          </div>
          <SectionTitle title="薄弱标签" compact />
          <div className="tag-cloud">
            {stats.weakTags.length > 0 ? (
              stats.weakTags.map((tag) => (
                <span key={tag.name} className="tag">
                  {tag.name}
                  <small>{tag.miss} 次</small>
                </span>
              ))
            ) : (
              <p className="empty-copy">完成一轮练习后，这里会显示薄弱点。</p>
            )}
          </div>
        </div>
      </section>
    </section>
  )
}

function PracticeView({
  records,
  session,
  setRecords,
  setSession,
  finishSession,
  exit,
}: {
  records: PracticeRecord[]
  session: PracticeSession
  setRecords: (records: PracticeRecord[]) => void
  setSession: (session: PracticeSession) => void
  finishSession: (session: PracticeSession) => void
  exit: () => void
}) {
  const question = session.questions[session.currentIndex]
  const existing = session.answers[question.id]
  const [draftState, setDraftState] = useState({ questionId: question.id, answer: existing?.answer ?? '' })
  const [elapsed, setElapsed] = useState(0)
  const [grading, setGrading] = useState(false)
  const [gradeError, setGradeError] = useState('')
  const draft = draftState.questionId === question.id ? draftState.answer : (existing?.answer ?? '')
  const isObjective = question.type === 'choice' || question.type === 'judge'

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - session.startedAt) / 1000)), 1000)
    return () => window.clearInterval(interval)
  }, [session.startedAt])

  const submitAnswer = async (answer: string) => {
    setGradeError('')
    setGrading(true)
    let aiResult: Pick<SessionAnswer, 'isCorrect' | 'score' | 'analysis' | 'referenceAnswer'> | null = null
    try {
      if (!isObjective) {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS)
        try {
          const response = await fetch('/api/ai/grade-answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, userAnswer: answer }),
            signal: controller.signal,
          })
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || 'AI 判分失败')
          aiResult = {
            isCorrect: Boolean(data.isCorrect),
            score: Number(data.score || 0),
            analysis: String(data.analysis || ''),
            referenceAnswer: String(data.referenceAnswer || question.answer || ''),
          }
        } finally {
          window.clearTimeout(timeout)
        }
      }
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      setGradeError(
        isAbort
          ? `AI 判分超过 ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} 秒，已取消。本题未记录，可直接重试。`
          : error instanceof Error
            ? `${error.message}。本题未记录，可直接重试。`
            : 'AI 判分失败，本题未记录，可直接重试。',
      )
      setGrading(false)
      return
    } finally {
      setGrading(false)
    }
    const isCorrect = isObjective ? normalizeAnswer(answer) === normalizeAnswer(question.answer) : Boolean(aiResult?.isCorrect)
    const timeSpent = Math.max(1, Math.round((Date.now() - session.questionStartedAt) / 1000))
    const sessionAnswer: SessionAnswer = {
      questionId: question.id,
      answer,
      isCorrect,
      timeSpent,
      score: aiResult?.score,
      analysis: aiResult?.analysis,
      referenceAnswer: aiResult?.referenceAnswer,
    }
    const nextSession = {
      ...session,
      answers: {
        ...session.answers,
        [question.id]: sessionAnswer,
      },
    }
    setSession(nextSession)
    setRecords([
      {
        id: crypto.randomUUID(),
        questionId: question.id,
        userAnswer: answer,
        isCorrect,
        timeSpent,
        practiceMode: session.mode,
        createdAt: new Date().toISOString(),
      },
      ...records,
    ])
  }

  const goNext = () => {
    if (session.currentIndex >= session.questions.length - 1) {
      finishSession(session)
      return
    }
    setSession({ ...session, currentIndex: session.currentIndex + 1, questionStartedAt: Date.now() })
  }

  return (
    <section className="screen narrow-screen">
      <PageHeader title={session.title} subtitle={modeLabels[session.mode]} onBack={exit} right={formatTime(elapsed)} />
      <div className="progress-track">
        <span style={{ width: `${((session.currentIndex + 1) / session.questions.length) * 100}%` }} />
      </div>
      <article className="question-card">
        <div className="question-meta">
          <span>
            {session.currentIndex + 1}/{session.questions.length}
          </span>
          <span>{question.chapter}</span>
          <span>{question.section}</span>
          <span>{typeLabels[question.type]}</span>
          <span>{difficultyLabels[question.difficulty]}</span>
        </div>
        <h1>{question.question}</h1>
        <div className="inline-tags">
          {question.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {isObjective ? (
          <ObjectiveAnswer question={question} existing={existing} onSubmit={(answer) => void submitAnswer(answer)} />
        ) : (
          <SubjectiveAnswer
            draft={draft}
            existing={existing}
            question={question}
            setDraft={(answer) => setDraftState({ questionId: question.id, answer })}
            grading={grading}
            gradeError={gradeError}
            onSubmit={(answer) => void submitAnswer(answer)}
          />
        )}
      </article>
      <div className="practice-footer">
        <button
          type="button"
          className="secondary-action"
          disabled={session.currentIndex === 0}
          onClick={() => setSession({ ...session, currentIndex: session.currentIndex - 1, questionStartedAt: Date.now() })}
        >
          上一题
        </button>
        <button type="button" className="primary-action" onClick={goNext}>
          {session.currentIndex >= session.questions.length - 1 ? '查看结果' : '下一题'}
        </button>
      </div>
    </section>
  )
}

function ObjectiveAnswer({
  question,
  existing,
  onSubmit,
}: {
  question: Question
  existing?: SessionAnswer
  onSubmit: (answer: string) => void
}) {
  const options = question.type === 'judge' && question.options.length === 0 ? ['正确', '错误'] : question.options
  return (
    <div className="answer-area">
      <div className="option-list">
        {options.map((option) => {
          const value = question.type === 'choice' ? option.trim().slice(0, 1) : option
          const selected = existing?.answer === value
          const correct = existing && normalizeAnswer(value) === normalizeAnswer(question.answer)
          const wrong = selected && existing && !existing.isCorrect
          return (
            <button
              key={option}
              type="button"
              className={`option-button ${selected ? 'selected' : ''} ${correct ? 'correct' : ''} ${wrong ? 'wrong' : ''}`}
              disabled={Boolean(existing)}
              onClick={() => onSubmit(value)}
            >
              <span>{option}</span>
              {correct && <CheckCircle2 size={18} />}
              {wrong && <XCircle size={18} />}
            </button>
          )
        })}
      </div>
      {existing && <AnswerReveal question={question} isCorrect={existing.isCorrect} />}
    </div>
  )
}

function SubjectiveAnswer({
  draft,
  existing,
  question,
  setDraft,
  grading,
  gradeError,
  onSubmit,
}: {
  draft: string
  existing?: SessionAnswer
  question: Question
  setDraft: (draft: string) => void
  grading: boolean
  gradeError: string
  onSubmit: (answer: string) => void
}) {
  if (existing) {
    return (
      <div className="answer-area">
        <div className="answer-reveal">
          <strong>你的作答</strong>
          <pre>{existing.answer || '未填写，直接自评'}</pre>
        </div>
        <AnswerReveal question={question} isCorrect={existing.isCorrect} answer={existing} />
      </div>
    )
  }
  return (
    <div className="answer-area">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={question.type === 'shell_coding' ? '在这里写 Shell 脚本或关键命令，AI 会按语法和逻辑判分...' : '先自己作答，AI 会判断关键点是否覆盖...'}
      />
      <div className="self-check">
        <button type="button" className="primary-action" onClick={() => onSubmit(draft)} disabled={grading || !draft.trim()}>
          {grading ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
          {grading ? 'AI 正在对照判分' : 'AI 对照标准答案判分'}
        </button>
      </div>
      {gradeError && <p className="grade-error">{gradeError}</p>}
      {question.answer ? (
        <details className="reference-box">
          <summary>先看参考答案</summary>
          <AnswerReveal question={question} />
        </details>
      ) : (
        <p className="empty-copy">这道导入题没有标准答案，提交后 AI 会同时生成参考答案和判分分析。</p>
      )}
    </div>
  )
}

function AnswerReveal({ question, isCorrect, answer }: { question: Question; isCorrect?: boolean; answer?: SessionAnswer }) {
  return (
    <div className="answer-reveal">
      {typeof isCorrect === 'boolean' && (
        <div className={`answer-status ${isCorrect ? 'ok' : 'bad'}`}>
          {isCorrect ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {isCorrect ? '回答正确' : '需要复盘'}
        </div>
      )}
      {typeof answer?.score === 'number' && (
        <>
          <strong>AI 评分</strong>
          <p>{answer.score} 分</p>
        </>
      )}
      {answer?.analysis && (
        <>
          <strong>对照解析</strong>
          <p>{answer.analysis}</p>
        </>
      )}
      <strong>标准答案</strong>
      <pre>{answer?.referenceAnswer || question.answer || '暂无标准答案，建议以 AI 分析为准。'}</pre>
      {question.explanation && (
        <>
          <strong>解析</strong>
          <p>{question.explanation}</p>
        </>
      )}
    </div>
  )
}

function ResultView({
  session,
  records,
  restartWrong,
  backHome,
}: {
  session: PracticeSession
  records: PracticeRecord[]
  restartWrong: () => void
  backHome: () => void
}) {
  const answers = Object.values(session.answers)
  const correct = answers.filter((answer) => answer.isCorrect).length
  const wrongQuestions = session.questions.filter((question) => answers.some((answer) => answer.questionId === question.id && !answer.isCorrect))
  const accuracy = session.questions.length === 0 ? 0 : Math.round((correct / session.questions.length) * 100)
  return (
    <section className="screen narrow-screen">
      <section className="result-hero">
        <p className="eyebrow">{session.title}</p>
        <h1>{accuracy >= 80 ? '这轮很稳，继续保持。' : '薄弱点已经露出来了。'}</h1>
        <p>完成 {answers.length}/{session.questions.length} 题，正确率 {accuracy}%。</p>
      </section>
      <section className="stat-grid">
        <StatCard label="正确率" value={`${accuracy}%`} icon={<BarChart3 size={19} />} />
        <StatCard label="正确题数" value={correct} icon={<CheckCircle2 size={19} />} />
        <StatCard label="本轮错题" value={wrongQuestions.length} icon={<XCircle size={19} />} />
        <StatCard label="错题池" value={getWrongQuestionIds(records).size} icon={<RotateCcw size={19} />} />
      </section>
      <div className="panel">
        <SectionTitle title="本轮错题" compact />
        {wrongQuestions.length === 0 ? (
          <p className="empty-copy">本轮没有错题，可以开下一轮模拟考试。</p>
        ) : (
          <div className="review-list">
            {wrongQuestions.map((question) => (
              <div key={question.id} className="review-item">
                <span>{question.chapter}</span>
                <strong>{question.question}</strong>
                <small>{question.tags.join(' / ')}</small>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="practice-footer">
        <button type="button" className="secondary-action" onClick={backHome}>
          回到首页
        </button>
        <button type="button" className="primary-action" disabled={wrongQuestions.length === 0} onClick={restartWrong}>
          再练错题
        </button>
      </div>
    </section>
  )
}

function LabView({ backHome }: { backHome: () => void }) {
  const savedLab = readLabState()
  const [fs, setFs] = useState<FsDir>(() => savedLab?.fs ?? initialFs())
  const [cwd, setCwd] = useState(savedLab?.cwd ?? ['home', 'student'])
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<TerminalLine[]>([
    { kind: 'hint', text: 'Linux 指令实验室已启动。输入 help 查看可用命令。当前环境会真实维护目录、文件内容和权限。' },
  ])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [aiHelp, setAiHelp] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [lines])

  const run = (raw: string) => {
    const command = raw.trim()
    if (!command) return
    if (command === 'clear') {
      setLines([])
      setInput('')
      return
    }
    const nextFs = cloneFs(fs)
    const editTarget = getEditorTarget(nextFs, cwd, command)
    if (editTarget) {
      setEditor(editTarget)
      setLines((items) => [...items, { kind: 'input', text: `student@linux:${pathText(cwd)}$ ${command}` }, { kind: 'hint', text: `已打开 ${editTarget.path}，编辑后点击保存。` }])
      setInput('')
      setHistory((items) => [...items, command])
      setHistoryIndex(null)
      return
    }
    const result = runCommand(nextFs, cwd, command)
    const enhancedLines = result.lines.some((line) => line.kind === 'error')
      ? [...result.lines, { kind: 'hint' as const, text: explainCommandError(command, result.lines.map((line) => line.text).join('\n')) }]
      : result.lines
    setFs(nextFs)
    setCwd(result.cwd)
    setLines((items) => [...items, { kind: 'input', text: `student@linux:${pathText(cwd)}$ ${command}` }, ...enhancedLines])
    setInput('')
    setHistory((items) => [...items, command])
    setHistoryIndex(null)
  }

  const saveState = () => {
    localStorage.setItem(LAB_STATE_KEY, JSON.stringify({ fs, cwd }))
    setLines((items) => [...items, { kind: 'hint', text: '当前实验室状态已保存。' }])
  }

  const resetState = () => {
    const fresh = initialFs()
    setFs(fresh)
    setCwd(['home', 'student'])
    localStorage.removeItem(LAB_STATE_KEY)
    setLines([{ kind: 'hint', text: '实验室已重置。' }])
  }

  const completeTasks = labTaskStatus(fs)

  const applyCompletion = () => {
    const completed = completeInput(fs, cwd, input)
    if (completed !== input) setInput(completed)
  }

  const handleHistoryKey = (key: string) => {
    if (history.length === 0) return
    if (key === 'ArrowUp') {
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(next)
      setInput(history[next])
    }
    if (key === 'ArrowDown') {
      if (historyIndex === null) return
      const next = historyIndex + 1
      if (next >= history.length) {
        setHistoryIndex(null)
        setInput('')
      } else {
        setHistoryIndex(next)
        setInput(history[next])
      }
    }
  }

  const askAi = async () => {
    setLoadingAi(true)
    setAiHelp('')
    try {
      const recent = lines
        .slice(-12)
        .map((line) => line.text)
        .join('\n')
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `请解释下面 Linux 终端练习记录里命令为什么这样输出，并指出考试易错点：\n${recent}`,
            },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI 请求失败')
      setAiHelp(data.content)
    } catch (error) {
      setAiHelp(error instanceof Error ? error.message : 'AI 请求失败')
    } finally {
      setLoadingAi(false)
    }
  }

  return (
    <section className="screen">
      <PageHeader title="指令实验室" subtitle="仿真实 Linux 终端练习" onBack={backHome} />
      <div className="lab-layout">
        <section className="terminal-panel">
          <div className="terminal-head">
            <span />
            <span />
            <span />
            <strong>student@linux</strong>
          </div>
          <div className="terminal-body">
            {lines.map((line, index) => (
              <pre key={`${line.kind}-${index}`} className={`terminal-line ${line.kind}`}>
                {line.text}
              </pre>
            ))}
            <form
              className="terminal-input"
              onSubmit={(event) => {
                event.preventDefault()
                run(input)
              }}
            >
              <span>student@linux:{pathText(cwd)}$</span>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Tab') {
                    event.preventDefault()
                    applyCompletion()
                  }
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    handleHistoryKey(event.key)
                  }
                }}
                autoFocus
                spellCheck={false}
              />
              <button type="submit">运行</button>
            </form>
            <div ref={endRef} />
          </div>
        </section>
        <aside className="panel lab-side">
          <SectionTitle title="文件树" compact />
          <div className="tree-current">当前目录：{pathText(cwd)}</div>
          <pre className="tree-view">{fileTreeView(fs, cwd)}</pre>
          <SectionTitle title="环境说明" compact />
          <p className="empty-copy">支持 pwd、ls、cd、mkdir、touch、cat、echo、chmod、rm、cp、mv、stat、tree、bash/sh、./脚本。文件系统在当前页面内变化，刷新后重置。</p>
          <div className="quick-commands">
            {[
              'pwd',
              'ls -l',
              'bash script.sh',
              './script.sh',
              'chmod +x script.sh',
              './script.sh',
              'mkdir test',
              'touch test/a.txt',
              'echo hello > test/a.txt',
              'stat test/a.txt',
              'rm -r test',
            ].map(
              (command) => (
                <button key={command} type="button" onClick={() => run(command)}>
                  {command}
                </button>
              ),
            )}
          </div>
          <button type="button" className="secondary-action" onClick={askAi} disabled={loadingAi}>
            {loadingAi ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
            解释最近命令
          </button>
          <div className="data-actions lab-actions">
            <button type="button" className="secondary-action" onClick={saveState}>
              保存状态
            </button>
            <button type="button" className="secondary-action" onClick={resetState}>
              重置环境
            </button>
          </div>
          <SectionTitle title="新手任务" compact />
          <div className="task-list">
            {completeTasks.map((task) => (
              <span key={task.label} className={task.done ? 'done' : ''}>
                {task.done ? '✓' : '○'} {task.label}
              </span>
            ))}
          </div>
          {aiHelp && <div className="ai-box">{aiHelp}</div>}
        </aside>
      </div>
      {editor && (
        <div className="editor-backdrop">
          <section className="editor-modal">
            <div className="page-header">
              <div>
                <h1>编辑 {editor.path}</h1>
                <p>简化 vi/nano：修改内容后保存，文件系统立即更新。</p>
              </div>
            </div>
            <textarea value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} />
            <div className="practice-footer">
              <button type="button" className="secondary-action" onClick={() => setEditor(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  const nextFs = cloneFs(fs)
                  writeFileContent(nextFs, ['home', 'student'], editor.path, editor.content)
                  setFs(nextFs)
                  setLines((items) => [...items, { kind: 'hint', text: `${editor.path} 已保存。` }])
                  setEditor(null)
                }}
              >
                保存
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function NotesView({
  questions,
  records,
  stats,
  backHome,
}: {
  questions: Question[]
  records: PracticeRecord[]
  stats: ReturnType<typeof buildStats>
  backHome: () => void
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const wrongIds = getWrongQuestionIds(records)
  const wrongQuestions = questions.filter((question) => wrongIds.has(question.id)).slice(0, 12)

  const generate = async () => {
    setLoading(true)
    setContent('')
    try {
      const response = await fetch('/api/ai/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weakTags: stats.weakTags, wrongQuestions, stats }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI 请求失败')
      setContent(data.content)
    } catch (error) {
      setContent(error instanceof Error ? error.message : 'AI 请求失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="screen narrow-screen">
      <PageHeader title="冲刺笔记" subtitle="AI 基于练习记录生成" onBack={backHome} />
      <div className="panel">
        <p className="empty-copy">会读取本地错题、薄弱标签和章节覆盖，生成短版复习指南。没有上传任何个人账号记录。</p>
        <button type="button" className="primary-action" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
          生成冲刺笔记
        </button>
        {content && <pre className="notes-output">{content}</pre>}
      </div>
    </section>
  )
}

function ImportView({ addQuestions, backHome }: { addQuestions: (items: Question[]) => void; backHome: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Question[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const upload = async (file: File) => {
    setLoading(true)
    setMessage('')
    setParsed([])
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch('/api/ai/import-questions', { method: 'POST', body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'AI 导题失败')
      setParsed(data.questions)
      setMessage(`识别到 ${data.questions.length} 道题，确认后会加入本地题库。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导题失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="screen narrow-screen">
      <PageHeader title="导入题库" subtitle="上传题目文件，AI 自动识别结构并批量导入" onBack={backHome} />
      <div className="import-card">
        <div className="step-title">
          <span>1</span>
          <strong>上传题目文件</strong>
        </div>
        <button type="button" className="drop-zone" onClick={() => fileRef.current?.click()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={42} /> : <Upload size={42} />}
          <strong>{loading ? 'AI 正在识别...' : '拖拽文件到这里，或点击选择'}</strong>
          <small>支持 .txt · .md · 图片（PNG/JPG）</small>
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".txt,.md,image/png,image/jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            event.target.value = ''
          }}
        />
        <div className="format-tip">
          <strong>文件格式建议</strong>
          <p>文本：直接粘贴题目文本，每道题之间空行分隔。</p>
          <p>图片：截图或拍照的题目，AI 会先 OCR 识别文字再解析。</p>
        </div>
        {message && <p className="message">{message}</p>}
      </div>
      {parsed.length > 0 && (
        <div className="panel">
          <SectionTitle title="识别结果预览" compact />
          <div className="review-list">
            {parsed.slice(0, 8).map((question) => (
              <div key={question.id} className="review-item">
                <span>
                  {question.chapter} · {typeLabels[question.type]}
                </span>
                <strong>{question.question}</strong>
                <small>{question.answer ? `答案：${question.answer}` : '答案需人工补充'}</small>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => {
              addQuestions(parsed)
              setParsed([])
              setMessage('已加入本地题库，可在首页开始练习。')
            }}
          >
            加入本地题库
          </button>
        </div>
      )}
    </section>
  )
}

function DataView({
  records,
  setRecords,
  importedQuestions,
  setImportedQuestions,
  totalQuestions,
  backHome,
}: {
  records: PracticeRecord[]
  setRecords: (records: PracticeRecord[]) => void
  importedQuestions: Question[]
  setImportedQuestions: (questions: Question[]) => void
  totalQuestions: number
  backHome: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), records, importedQuestions }
    downloadJson(payload, `linux-mastery-data-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      if (Array.isArray(parsed.records)) setRecords(parsed.records.filter(isPracticeRecord))
      if (Array.isArray(parsed.importedQuestions)) setImportedQuestions(parsed.importedQuestions.filter(isQuestion))
      setMessage('本地数据已导入')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败')
    }
  }

  return (
    <section className="screen narrow-screen">
      <PageHeader title="数据管理" subtitle="本地题库和练习记录" onBack={backHome} />
      <div className="data-grid">
        <div className="panel">
          <SectionTitle title="本地状态" compact />
          <div className="stat-grid compact">
            <StatCard label="题库题数" value={totalQuestions} icon={<FileQuestion size={18} />} />
            <StatCard label="导入题目" value={importedQuestions.length} icon={<Upload size={18} />} />
            <StatCard label="记录条数" value={records.length} icon={<ListChecks size={18} />} />
          </div>
          <p className="empty-copy">练习记录键：{RECORDS_KEY}；导入题库键：{IMPORTED_QUESTIONS_KEY}。</p>
        </div>
        <div className="panel">
          <SectionTitle title="导入导出" compact />
          <div className="data-actions">
            <button type="button" className="secondary-action" onClick={exportData}>
              <Download size={17} />
              导出数据
            </button>
            <button type="button" className="secondary-action" onClick={() => fileRef.current?.click()}>
              <Upload size={17} />
              导入数据
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importData(file)
                event.target.value = ''
              }}
            />
          </div>
          {message && <p className="message">{message}</p>}
        </div>
        <div className="panel danger-zone">
          <SectionTitle title="清空" compact />
          <div className="data-actions">
            <button type="button" className="danger-action" onClick={() => setRecords([])} disabled={records.length === 0}>
              清空练习记录
            </button>
            <button
              type="button"
              className="danger-action"
              onClick={() => setImportedQuestions([])}
              disabled={importedQuestions.length === 0}
            >
              清空导入题目
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function PageHeader({ title, subtitle, onBack, right }: { title: string; subtitle: string; onBack: () => void; right?: string }) {
  return (
    <div className="page-header">
      <button type="button" className="back-button" onClick={onBack} aria-label="返回">
        <ArrowLeft size={22} />
      </button>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {right && <span className="header-chip">{right}</span>}
    </div>
  )
}

function SectionTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  return <h2 className={compact ? 'section-title compact' : 'section-title'}>{title}</h2>
}

function ToolCard({
  icon,
  tint,
  title,
  desc,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  tint: 'purple' | 'blue' | 'green' | 'red' | 'gray'
  title: string
  desc: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="tool-card" disabled={disabled} onClick={onClick}>
      <span className={`tool-icon ${tint}`}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{desc}</small>
      </span>
      <ChevronRight size={22} />
    </button>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="stat-card">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function ProgressRow({ label, meta, value }: { label: string; meta: string; value: number }) {
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <small>{meta}</small>
      </div>
      <div className="mini-track">
        <span style={{ width: `${Math.max(3, value)}%` }} />
      </div>
    </div>
  )
}

function useLocalRecords() {
  const [records, setRecordsState] = useState<PracticeRecord[]>(() => readLocalArray(RECORDS_KEY).filter(isPracticeRecord))
  const setRecords = (next: PracticeRecord[]) => {
    setRecordsState(next)
    localStorage.setItem(RECORDS_KEY, JSON.stringify(next))
  }
  return [records, setRecords] as const
}

function useLocalQuestions() {
  const [items, setItemsState] = useState<Question[]>(() => readLocalArray(IMPORTED_QUESTIONS_KEY).filter(isQuestion))
  const setItems = (next: Question[]) => {
    setItemsState(next)
    localStorage.setItem(IMPORTED_QUESTIONS_KEY, JSON.stringify(next))
  }
  return [items, setItems] as const
}

function buildStats(allQuestions: Question[], records: PracticeRecord[]) {
  const practicedIds = new Set(records.map((record) => record.questionId))
  const correct = records.filter((record) => record.isCorrect).length
  const chapters = Array.from(new Set(allQuestions.map((question) => question.chapter))).sort(compareChapter)
  const chapterStats = chapters.map((chapter) => {
    const chapterQuestions = allQuestions.filter((question) => question.chapter === chapter)
    return {
      chapter,
      total: chapterQuestions.length,
      practiced: chapterQuestions.filter((question) => practicedIds.has(question.id)).length,
    }
  })
  const typeStats = (Object.keys(typeLabels) as QuestionType[]).map((type) => ({
    type,
    total: allQuestions.filter((question) => question.type === type).length,
  }))
  const misses = new Map<string, number>()
  records
    .filter((record) => !record.isCorrect)
    .forEach((record) => {
      const question = allQuestions.find((item) => item.id === record.questionId)
      question?.tags.forEach((tag) => misses.set(tag, (misses.get(tag) ?? 0) + 1))
    })
  return {
    practicedCount: practicedIds.size,
    accuracy: records.length === 0 ? 0 : Math.round((correct / records.length) * 100),
    chapters,
    chapterStats,
    typeStats,
    weakTags: Array.from(misses.entries())
      .map(([name, miss]) => ({ name, miss }))
      .sort((a, b) => b.miss - a.miss)
      .slice(0, 10),
  }
}

function pickQuestions(mode: PracticeMode, pool: Question[], records: PracticeRecord[]) {
  const shuffled = shuffle(pool)
  if (mode === 'exam') return shuffled.slice(0, Math.min(35, shuffled.length))
  if (mode === 'smart') {
    const wrongIds = getWrongQuestionIds(records)
    const practicedIds = new Set(records.map((record) => record.questionId))
    return shuffled
      .sort((a, b) => scoreSmartQuestion(b, wrongIds, practicedIds, records) - scoreSmartQuestion(a, wrongIds, practicedIds, records))
      .slice(0, Math.min(30, shuffled.length))
  }
  return shuffled.slice(0, Math.min(40, shuffled.length))
}

function scoreSmartQuestion(question: Question, wrongIds: Set<string>, practicedIds: Set<string>, records: PracticeRecord[]) {
  let score = 0
  if (wrongIds.has(question.id)) score += 80
  if (!practicedIds.has(question.id)) score += 55
  score += records.filter((record) => record.questionId === question.id && !record.isCorrect).length * 20
  if (question.type === 'shell_coding') score += 10
  if (question.difficulty === 'hard') score += 8
  return score
}

function getWrongQuestionIds(records: PracticeRecord[]) {
  const latest = new Map<string, PracticeRecord>()
  records
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .forEach((record) => {
      if (!latest.has(record.questionId)) latest.set(record.questionId, record)
    })
  return new Set(Array.from(latest.values()).filter((record) => !record.isCorrect).map((record) => record.questionId))
}

function runCommand(fs: FsDir, cwd: string[], raw: string): { cwd: string[]; lines: TerminalLine[] } {
  const expandedRaw = expandRuntimeVariables(raw)
  const args = tokenize(expandedRaw)
  const command = args[0]
  if (!command) return { cwd, lines: [] }
  try {
    if (command === 'bash' || command === 'sh') return ok(cwd, bashCommand(fs, cwd, args))
    if (command.startsWith('./')) return ok(cwd, executePathCommand(fs, cwd, command, args.slice(1)))
    switch (command) {
      case 'help':
        return ok(cwd, 'pwd ls cd mkdir touch cat echo chmod rm cp mv stat tree bash sh ./script.sh vi nano clear help')
      case 'pwd':
        return ok(cwd, pathText(cwd))
      case 'ls':
        return ok(cwd, lsCommand(fs, cwd, args))
      case 'cd':
        return { cwd: cdCommand(fs, cwd, args[1] || '/home/student'), lines: [] }
      case 'mkdir':
        return ok(cwd, mkdirCommand(fs, cwd, args))
      case 'touch':
        return ok(cwd, touchCommand(fs, cwd, args))
      case 'cat':
        return ok(cwd, catCommand(fs, cwd, args))
      case 'echo':
        return ok(cwd, echoCommand(fs, cwd, args))
      case 'chmod':
        return ok(cwd, chmodCommand(fs, cwd, args))
      case 'rm':
        return ok(cwd, rmCommand(fs, cwd, args))
      case 'cp':
        return ok(cwd, cpCommand(fs, cwd, args))
      case 'mv':
        return ok(cwd, mvCommand(fs, cwd, args))
      case 'stat':
        return ok(cwd, statCommand(fs, cwd, args))
      case 'tree':
        return ok(cwd, treeCommand(fs, cwd, args[1]))
      default:
        return err(cwd, `${command}: command not found`)
    }
  } catch (error) {
    return err(cwd, error instanceof Error ? error.message : 'command failed')
  }
}

function ok(cwd: string[], text: string) {
  return { cwd, lines: text ? [{ kind: 'output' as const, text }] : [] }
}

function err(cwd: string[], text: string) {
  return { cwd, lines: [{ kind: 'error' as const, text }] }
}

function lsCommand(fs: FsDir, cwd: string[], args: string[]) {
  const long = args.includes('-l')
  const target = args.find((arg) => !arg.startsWith('-') && arg !== 'ls')
  const node = getNode(fs, resolvePath(cwd, target || '.'))
  if (!node) throw new Error(`ls: cannot access '${target}': No such file or directory`)
  if (node.type === 'file') return long ? `${modeText(node)} student student ${node.content.length} ${target}` : target || ''
  const names = Object.keys(node.children).sort()
  if (!long) return names.join('  ')
  return names
    .map((name) => {
      const child = node.children[name]
      return `${modeText(child)} student student ${child.type === 'file' ? child.content.length : 4096} ${name}${child.type === 'dir' ? '/' : ''}`
    })
    .join('\n')
}

function cdCommand(fs: FsDir, cwd: string[], target: string) {
  const next = resolvePath(cwd, target)
  const node = getNode(fs, next)
  if (!node) throw new Error(`cd: ${target}: No such file or directory`)
  if (node.type !== 'dir') throw new Error(`cd: ${target}: Not a directory`)
  return next
}

function mkdirCommand(fs: FsDir, cwd: string[], args: string[]) {
  const recursive = args.includes('-p')
  const targets = args.filter((arg) => arg !== 'mkdir' && arg !== '-p')
  if (targets.length === 0) throw new Error('mkdir: missing operand')
  targets.forEach((target) => {
    const path = resolvePath(cwd, target)
    const parent = ensureParent(fs, path, recursive)
    const name = path.at(-1)
    if (!name) throw new Error(`mkdir: cannot create directory '${target}'`)
    if (parent.children[name]) {
      if (!recursive) throw new Error(`mkdir: cannot create directory '${target}': File exists`)
      return
    }
    parent.children[name] = { type: 'dir', mode: 0o755, children: {} }
  })
  return ''
}

function touchCommand(fs: FsDir, cwd: string[], args: string[]) {
  const targets = args.slice(1)
  if (targets.length === 0) throw new Error('touch: missing file operand')
  targets.forEach((target) => {
    const path = resolvePath(cwd, target)
    const parent = ensureParent(fs, path, false)
    const name = path.at(-1)
    if (!name) throw new Error(`touch: cannot touch '${target}'`)
    parent.children[name] ||= { type: 'file', mode: 0o644, content: '' }
  })
  return ''
}

function catCommand(fs: FsDir, cwd: string[], args: string[]) {
  const targets = args.slice(1)
  if (targets.length === 0) throw new Error('cat: missing file operand')
  return targets
    .map((target) => {
      const node = getNode(fs, resolvePath(cwd, target))
      if (!node) throw new Error(`cat: ${target}: No such file or directory`)
      if (node.type !== 'file') throw new Error(`cat: ${target}: Is a directory`)
      return node.content
    })
    .join('\n')
}

function echoCommand(fs: FsDir, cwd: string[], args: string[]) {
  const redirectIndex = args.findIndex((arg) => arg === '>' || arg === '>>')
  if (redirectIndex === -1) return args.slice(1).join(' ')
  const append = args[redirectIndex] === '>>'
  const target = args[redirectIndex + 1]
  if (!target) throw new Error('echo: missing redirect target')
  const content = args.slice(1, redirectIndex).join(' ')
  const path = resolvePath(cwd, target)
  const parent = ensureParent(fs, path, false)
  const name = path.at(-1)
  if (!name) throw new Error(`echo: ${target}: invalid target`)
  const existing = parent.children[name]
  if (existing && existing.type === 'dir') throw new Error(`echo: ${target}: Is a directory`)
  parent.children[name] = {
    type: 'file',
    mode: existing?.mode ?? 0o644,
    content: append && existing?.type === 'file' ? `${existing.content}${content}\n` : `${content}\n`,
  }
  return ''
}

function chmodCommand(fs: FsDir, cwd: string[], args: string[]) {
  const mode = args[1]
  const target = args[2]
  if (!mode || !target) throw new Error('chmod: missing operand')
  const node = getNode(fs, resolvePath(cwd, target))
  if (!node) throw new Error(`chmod: cannot access '${target}': No such file or directory`)
  if (/^[0-7]{3}$/.test(mode)) {
    node.mode = Number.parseInt(mode, 8)
  } else if (mode === '+x' || mode === 'u+x') {
    node.mode |= 0o100
  } else if (mode === 'o-w') {
    node.mode &= ~0o002
  } else {
    throw new Error(`chmod: unsupported mode '${mode}' in lab`)
  }
  return ''
}

function rmCommand(fs: FsDir, cwd: string[], args: string[]) {
  const recursive = args.includes('-r') || args.includes('-rf')
  const force = args.includes('-f') || args.includes('-rf')
  const targets = args.filter((arg) => arg !== 'rm' && arg !== '-r' && arg !== '-f' && arg !== '-rf')
  if (targets.length === 0) throw new Error('rm: missing operand')
  targets.forEach((target) => {
    const path = resolvePath(cwd, target)
    const parent = getNode(fs, path.slice(0, -1))
    const name = path.at(-1)
    if (!name || !parent || parent.type !== 'dir' || !parent.children[name]) {
      if (force) return
      throw new Error(`rm: cannot remove '${target}': No such file or directory`)
    }
    if (parent.children[name].type === 'dir' && !recursive) throw new Error(`rm: cannot remove '${target}': Is a directory`)
    delete parent.children[name]
  })
  return ''
}

function cpCommand(fs: FsDir, cwd: string[], args: string[]) {
  const [source, target] = args.slice(1)
  if (!source || !target) throw new Error('cp: missing file operand')
  const src = getNode(fs, resolvePath(cwd, source))
  if (!src) throw new Error(`cp: cannot stat '${source}': No such file or directory`)
  if (src.type === 'dir') throw new Error(`cp: -r not implemented for directory '${source}'`)
  const targetPath = resolvePath(cwd, target)
  const parent = ensureParent(fs, targetPath, false)
  const name = targetPath.at(-1)
  if (!name) throw new Error(`cp: invalid target '${target}'`)
  parent.children[name] = { ...src }
  return ''
}

function mvCommand(fs: FsDir, cwd: string[], args: string[]) {
  const [source, target] = args.slice(1)
  if (!source || !target) throw new Error('mv: missing file operand')
  cpCommand(fs, cwd, ['cp', source, target])
  rmCommand(fs, cwd, ['rm', '-r', source])
  return ''
}

function statCommand(fs: FsDir, cwd: string[], args: string[]) {
  const target = args[1]
  if (!target) throw new Error('stat: missing operand')
  const node = getNode(fs, resolvePath(cwd, target))
  if (!node) throw new Error(`stat: cannot stat '${target}': No such file or directory`)
  return `File: ${target}\nType: ${node.type}\nSize: ${node.type === 'file' ? node.content.length : 4096}\nAccess: (${node.mode.toString(8).padStart(3, '0')}/${modeText(node)})`
}

function treeCommand(fs: FsDir, cwd: string[], target = '.') {
  const path = resolvePath(cwd, target)
  const node = getNode(fs, path)
  if (!node) throw new Error(`tree: ${target}: No such file or directory`)
  const walk = (item: FsNode, name: string, depth: number): string[] => {
    if (item.type === 'file') return [`${'  '.repeat(depth)}${name}`]
    return [
      `${'  '.repeat(depth)}${name}/`,
      ...Object.entries(item.children)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([childName, child]) => walk(child, childName, depth + 1)),
    ]
  }
  return walk(node, target === '.' ? pathText(path) : target, 0).join('\n')
}

function fileTreeView(fs: FsDir, cwd: string[]) {
  const currentPath = pathText(cwd)
  const walk = (item: FsNode, name: string, path: string[], depth: number): string[] => {
    const absolute = pathText(path)
    const prefix = absolute === currentPath ? '→ ' : '  '
    const indent = '  '.repeat(depth)
    const suffix = item.type === 'dir' ? '/' : ''
    if (item.type === 'file') return [`${indent}${prefix}${name}${suffix}`]
    return [
      `${indent}${prefix}${name}${suffix}`,
      ...Object.entries(item.children)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([childName, child]) => walk(child, childName, [...path, childName], depth + 1)),
    ]
  }
  return walk(fs, '/', [], 0).join('\n')
}

function getEditorTarget(fs: FsDir, cwd: string[], command: string): EditorState | null {
  const args = tokenize(command)
  if (args[0] !== 'vi' && args[0] !== 'vim' && args[0] !== 'nano') return null
  const target = args[1]
  if (!target) throw new Error(`${args[0]}: missing file name`)
  const path = resolvePath(cwd, target)
  const existing = getNode(fs, path)
  if (existing && existing.type === 'dir') throw new Error(`${args[0]}: ${target}: Is a directory`)
  return { path: pathText(path), content: existing?.type === 'file' ? existing.content : '' }
}

function writeFileContent(fs: FsDir, cwd: string[], target: string, content: string) {
  const path = resolvePath(cwd, target)
  const parent = ensureParent(fs, path, false)
  const name = path.at(-1)
  if (!name) throw new Error(`cannot write '${target}'`)
  parent.children[name] = { type: 'file', mode: parent.children[name]?.mode ?? 0o644, content }
}

function completeInput(fs: FsDir, cwd: string[], input: string) {
  const commands = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo', 'chmod', 'rm', 'cp', 'mv', 'stat', 'tree', 'bash', 'sh', 'vi', 'vim', 'nano']
  const parts = tokenize(input)
  if (parts.length <= 1 && !input.endsWith(' ')) {
    const hit = commands.find((command) => command.startsWith(parts[0] || ''))
    return hit ? hit : input
  }
  const prefix = parts.at(-1) || ''
  const dirPath = prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) || '/' : '.'
  const filePrefix = prefix.includes('/') ? prefix.slice(prefix.lastIndexOf('/') + 1) : prefix
  const dir = getNode(fs, resolvePath(cwd, dirPath))
  if (!dir || dir.type !== 'dir') return input
  const hit = Object.keys(dir.children).find((name) => name.startsWith(filePrefix))
  if (!hit) return input
  const completed = prefix.includes('/') ? `${prefix.slice(0, prefix.lastIndexOf('/') + 1)}${hit}` : hit
  return `${input.slice(0, input.length - prefix.length)}${completed}${dir.children[hit].type === 'dir' ? '/' : ''}`
}

function labTaskStatus(fs: FsDir) {
  const home = getNode(fs, ['home', 'student'])
  const demo = getNode(fs, ['home', 'student', 'test'])
  const script = getNode(fs, ['home', 'student', 'script.sh'])
  return [
    { label: '查看当前目录 pwd', done: true },
    { label: '创建 test 目录', done: Boolean(demo && demo.type === 'dir') },
    { label: '创建 test/a.txt', done: Boolean(getNode(fs, ['home', 'student', 'test', 'a.txt'])) },
    { label: '给 script.sh 加执行权限', done: Boolean(script && script.mode & 0o111) },
    { label: '用 vi/nano 编辑文件', done: Boolean(home && home.type === 'dir' && Object.values(home.children).some((node) => node.type === 'file' && node.content.length > 24)) },
  ]
}

function readLabState() {
  try {
    const raw = localStorage.getItem(LAB_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.fs && Array.isArray(parsed.cwd) ? (parsed as { fs: FsDir; cwd: string[] }) : null
  } catch {
    return null
  }
}

function explainCommandError(command: string, message: string) {
  const name = tokenize(command)[0] || ''
  const commands = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo', 'chmod', 'rm', 'cp', 'mv', 'stat', 'tree', 'bash', 'sh', 'vi', 'vim', 'nano']
  const suggestion = commands.find((item) => levenshtein(name, item) <= 2)
  if (message.includes('Permission denied')) return '提示：权限不足。脚本用 ./script.sh 执行前通常需要 chmod +x script.sh。'
  if (message.includes('No such file')) return '提示：路径不存在。先用 pwd、ls 或 tree 确认当前目录和文件名。'
  if (suggestion && suggestion !== name) return `提示：是否想输入 ${suggestion}？可按 Tab 自动补全命令或路径。`
  return '提示：输入 help 查看支持的命令。'
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

function bashCommand(fs: FsDir, cwd: string[], args: string[]) {
  const script = args[1]
  if (!script) throw new Error(`${args[0]}: missing script file`)
  const node = getNode(fs, resolvePath(cwd, script))
  if (!node) throw new Error(`${args[0]}: ${script}: No such file or directory`)
  if (node.type !== 'file') throw new Error(`${args[0]}: ${script}: Is a directory`)
  return runScript(fs, cwd, node.content, args.slice(2))
}

function executePathCommand(fs: FsDir, cwd: string[], command: string, args: string[]) {
  const node = getNode(fs, resolvePath(cwd, command))
  if (!node) throw new Error(`${command}: No such file or directory`)
  if (node.type !== 'file') throw new Error(`${command}: Is a directory`)
  if ((node.mode & 0o111) === 0) throw new Error(`${command}: Permission denied`)
  if (!node.content.startsWith('#!')) throw new Error(`${command}: cannot execute binary file`)
  return runScript(fs, cwd, node.content, args)
}

function runScript(fs: FsDir, cwd: string[], source: string, scriptArgs: string[]) {
  const env: Record<string, string> = { '0': 'script.sh' }
  scriptArgs.forEach((value, index) => {
    env[String(index + 1)] = value
  })
  env['#'] = String(scriptArgs.length)
  const lines = normalizeScriptLines(source)
  const output: string[] = []
  try {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const cForMatch = line.match(/^for\s*\(\(\s*(.+?)\s*;\s*(.+?)\s*;\s*(.+?)\s*\)\)\s*(?:do)?$/)
      if (cForMatch) {
        const body: string[] = []
        index += 1
        if (lines[index] === 'do') index += 1
        while (index < lines.length && lines[index] !== 'done') {
          body.push(lines[index])
          index += 1
        }
        runArithmeticStatement(cForMatch[1], env)
        let guard = 0
        while (evaluateCondition(cForMatch[2], env)) {
          body.forEach((bodyLine) => runScriptLine(fs, cwd, bodyLine, env, output))
          runArithmeticStatement(cForMatch[3], env)
          guard += 1
          if (guard > 10000) throw new Error('bash: loop exceeded lab limit')
        }
        continue
      }
      const whileMatch = line.match(/^while\s+(.+?)(?:\s+do)?$/)
      if (whileMatch) {
        const body: string[] = []
        index += 1
        if (lines[index] === 'do') index += 1
        while (index < lines.length && lines[index] !== 'done') {
          body.push(lines[index])
          index += 1
        }
        let guard = 0
        while (evaluateShellCondition(whileMatch[1], env)) {
          body.forEach((bodyLine) => runScriptLine(fs, cwd, bodyLine, env, output))
          guard += 1
          if (guard > 10000) throw new Error('bash: loop exceeded lab limit')
        }
        continue
      }
      const ifMatch = line.match(/^if\s+(.+?)(?:\s+then)?$/)
      if (ifMatch) {
        const thenBody: string[] = []
        const elseBody: string[] = []
        let currentBody = thenBody
        index += 1
        if (lines[index] === 'then') index += 1
        while (index < lines.length && lines[index] !== 'fi') {
          if (lines[index] === 'else') {
            currentBody = elseBody
            index += 1
            continue
          }
          currentBody.push(lines[index])
          index += 1
        }
        const chosenBody = evaluateShellCondition(ifMatch[1], env) ? thenBody : elseBody
        chosenBody.forEach((bodyLine) => runScriptLine(fs, cwd, bodyLine, env, output))
        continue
      }
      const forMatch = line.match(/^for\s+(\w+)\s+in\s+(.+?)(?:\s+do)?$/)
      if (forMatch) {
        const body: string[] = []
        index += 1
        if (lines[index] === 'do') index += 1
        while (index < lines.length && lines[index] !== 'done') {
          body.push(lines[index])
          index += 1
        }
        const [, variable, valuesText] = forMatch
        const values = expandForValues(valuesText, env)
        values.forEach((value) => {
          env[variable] = value
          body.forEach((bodyLine) => runScriptLine(fs, cwd, bodyLine, env, output))
        })
        continue
      }
      runScriptLine(fs, cwd, line, env, output)
    }
  } catch (error) {
    if (!(error instanceof ScriptExit)) throw error
  }
  return output.join('\n')
}

function normalizeScriptLines(source: string) {
  return source
    .replace(/\r/g, '')
    .split('\n')
    .flatMap((rawLine) => {
      const withoutComment = rawLine.replace(/\s+#.*$/, '').trim()
      if (!withoutComment || withoutComment.startsWith('#!') || withoutComment.startsWith('#')) return []
      const normalized = withoutComment
        .replace(/;\s*do\s*$/, '\ndo')
        .replace(/;\s*then\s*$/, '\nthen')
        .replace(/^\s*do\s*$/, 'do')
        .replace(/^\s*then\s*$/, 'then')
      return normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    })
}

function runScriptLine(fs: FsDir, cwd: string[], line: string, env: Record<string, string>, output: string[]) {
  const exitMatch = line.match(/^exit(?:\s+(.+))?$/)
  if (exitMatch) {
    const codeText = exitMatch[1] ? expandShell(evaluateArithmetic(exitMatch[1], env), env) : '0'
    env['?'] = String(Number(codeText) || 0)
    throw new ScriptExit(Number(codeText) || 0)
  }
  const assignment = line.match(/^([A-Za-z_]\w*)=(.*)$/)
  if (assignment && !line.startsWith('echo ')) {
    env[assignment[1]] = stripQuotes(expandShell(evaluateArithmetic(expandCommandSubstitution(assignment[2], env), env), env))
    return
  }
  if (/^\(\(.+\)\)$/.test(line) || line.startsWith('let ')) {
    runArithmeticStatement(line.replace(/^let\s+/, '').replace(/^\(\(|\)\)$/g, ''), env)
    return
  }
  if (line.startsWith('echo ')) {
    output.push(echoCommand(fs, cwd, tokenize(expandShell(evaluateArithmetic(expandCommandSubstitution(line, env), env), env))))
    return
  }
  if (line.startsWith('cat ') || line.startsWith('pwd') || line.startsWith('ls ')) {
    const result = runCommand(fs, cwd, expandShell(expandCommandSubstitution(line, env), env)).lines.map((item) => item.text).join('\n')
    if (result) output.push(result)
    return
  }
  if (line.includes('read ')) {
    return
  }
  output.push(`[lab] skipped unsupported script line: ${line}`)
}

function expandForValues(valuesText: string, env: Record<string, string>) {
  const expanded = expandShell(expandCommandSubstitution(valuesText, env), env).trim()
  const braceMatch = expanded.match(/^\{(-?\d+)\.\.(-?\d+)(?:\.\.(-?\d+))?\}$/)
  if (braceMatch) return numberRange(Number(braceMatch[1]), Number(braceMatch[2]), braceMatch[3] ? Number(braceMatch[3]) : undefined).map(String)
  return tokenize(expanded)
}

function expandCommandSubstitution(text: string, env: Record<string, string>) {
  return text
    .replace(/\$\(seq\s+([^)]+)\)/g, (_, argsText: string) => seqCommand(tokenize(expandShell(argsText, env))).join(' '))
    .replace(/`seq\s+([^`]+)`/g, (_, argsText: string) => seqCommand(tokenize(expandShell(argsText, env))).join(' '))
}

function seqCommand(args: string[]) {
  const numbers = args.map(Number).filter((value) => Number.isFinite(value))
  if (numbers.length === 1) return numberRange(1, numbers[0])
  if (numbers.length === 2) return numberRange(numbers[0], numbers[1])
  if (numbers.length >= 3) return numberRange(numbers[0], numbers[2], numbers[1])
  return []
}

function numberRange(start: number, end: number, step?: number) {
  const actualStep = step ?? (start <= end ? 1 : -1)
  if (actualStep === 0) return []
  const result: number[] = []
  if (actualStep > 0) {
    for (let value = start; value <= end; value += actualStep) result.push(value)
  } else {
    for (let value = start; value >= end; value += actualStep) result.push(value)
  }
  return result
}

function expandShell(text: string, env: Record<string, string>) {
  return expandVariablesOutsideSingleQuotes(text, env)
}

function expandRuntimeVariables(text: string) {
  const env: Record<string, string> = {
    HOME: '/home/student',
    USER: 'student',
    SHELL: '/bin/bash',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    PWD: '/home/student',
  }
  return expandVariablesOutsideSingleQuotes(text, env)
}

function expandVariablesOutsideSingleQuotes(text: string, env: Record<string, string>) {
  let result = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '\\' && text[index + 1] === '$') {
      result += '$'
      index += 1
      continue
    }
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      result += char
      continue
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      result += char
      continue
    }
    if (char === '$' && !inSingleQuote) {
      if (text[index + 1] === '{') {
        const end = text.indexOf('}', index + 2)
        if (end !== -1) {
          const name = text.slice(index + 2, end)
          result += env[name] ?? ''
          index = end
          continue
        }
      }
      const match = text.slice(index + 1).match(/^([A-Za-z_]\w*)/)
      if (match) {
        result += env[match[1]] ?? ''
        index += match[1].length
        continue
      }
      if (text[index + 1] === '#' || text[index + 1] === '?') {
        result += env[text[index + 1]] ?? ''
        index += 1
        continue
      }
    }
    result += char
  }
  return result
}

function evaluateArithmetic(text: string, env: Record<string, string>) {
  return text.replace(/\$\(\(\s*([^)]+?)\s*\)\)/g, (_, expr: string) => {
    return String(evaluateArithmeticExpression(expr, env))
  })
}

function runArithmeticStatement(statement: string, env: Record<string, string>) {
  const trimmed = statement.trim()
  const increment = trimmed.match(/^([A-Za-z_]\w*)(\+\+|--)$/)
  if (increment) {
    const current = Number(env[increment[1]] || 0)
    env[increment[1]] = String(current + (increment[2] === '++' ? 1 : -1))
    return
  }
  const assignment = trimmed.match(/^([A-Za-z_]\w*)\s*([+\-*/%]?=)\s*(.+)$/)
  if (!assignment) return
  const [, name, operator, expr] = assignment
  const current = Number(env[name] || 0)
  const value = evaluateArithmeticExpression(expr, env)
  if (operator === '=') env[name] = String(value)
  if (operator === '+=') env[name] = String(current + value)
  if (operator === '-=') env[name] = String(current - value)
  if (operator === '*=') env[name] = String(current * value)
  if (operator === '/=') env[name] = String(Math.trunc(current / value))
  if (operator === '%=') env[name] = String(current % value)
}

function evaluateCondition(condition: string, env: Record<string, string>) {
  const expanded = expandArithmeticVariables(condition, env)
  if (!/^[\d+\-*/% ().<>=!&|]+$/.test(expanded)) return false
  try {
    return Boolean(Function(`"use strict"; return (${expanded})`)())
  } catch {
    return false
  }
}

function evaluateShellCondition(condition: string, env: Record<string, string>) {
  const trimmed = condition.trim()
  const arithmetic = trimmed.match(/^\(\((.+)\)\)$/)
  if (arithmetic) return evaluateCondition(arithmetic[1], env)
  const bracket = trimmed.match(/^\[\s*(.+)\s*\]$/) || trimmed.match(/^\[\[\s*(.+)\s*\]\]$/)
  const expression = bracket ? bracket[1] : trimmed
  const parts = tokenize(expandShell(evaluateArithmetic(expression, env), env)).map(stripQuotes)
  if (parts.length === 1) return parts[0].length > 0
  if (parts.length === 2) {
    if (parts[0] === '-n') return parts[1].length > 0
    if (parts[0] === '-z') return parts[1].length === 0
  }
  if (parts.length >= 3) {
    const [left, operator, right] = parts
    const leftNumber = Number(left)
    const rightNumber = Number(right)
    const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    if (operator === '=' || operator === '==') return left === right
    if (operator === '!=') return left !== right
    if (!numeric) return false
    if (operator === '-eq') return leftNumber === rightNumber
    if (operator === '-ne') return leftNumber !== rightNumber
    if (operator === '-lt') return leftNumber < rightNumber
    if (operator === '-le') return leftNumber <= rightNumber
    if (operator === '-gt') return leftNumber > rightNumber
    if (operator === '-ge') return leftNumber >= rightNumber
  }
  return evaluateCondition(expression, env)
}

function evaluateArithmeticExpression(expr: string, env: Record<string, string>) {
  const expanded = expandArithmeticVariables(expr, env)
  if (!/^[\d+\-*/% ().]+$/.test(expanded)) return 0
  try {
    const result = Function(`"use strict"; return (${expanded})`)()
    return Number.isFinite(Number(result)) ? Math.trunc(Number(result)) : 0
  } catch {
    return 0
  }
}

function expandArithmeticVariables(expr: string, env: Record<string, string>) {
  return expr.replace(/[A-Za-z_]\w*/g, (name) => env[name] ?? '0')
}

function stripQuotes(value: string) {
  return value.replace(/^["']|["']$/g, '')
}

function initialFs(): FsDir {
  return {
    type: 'dir',
    mode: 0o755,
    children: {
      home: {
        type: 'dir',
        mode: 0o755,
        children: {
          student: {
            type: 'dir',
            mode: 0o755,
            children: {
              'README.md': { type: 'file', mode: 0o644, content: 'Welcome to LinuxMastery lab.\nTry: ls -l, mkdir demo, touch demo/a.txt\n' },
              'script.sh': { type: 'file', mode: 0o644, content: '#!/bin/bash\necho hello\n' },
              data: {
                type: 'dir',
                mode: 0o755,
                children: {
                  'score.txt': { type: 'file', mode: 0o644, content: '88\n92\n76\n' },
                },
              },
            },
          },
        },
      },
      etc: {
        type: 'dir',
        mode: 0o755,
        children: {
          passwd: { type: 'file', mode: 0o644, content: 'root:x:0:0:root:/root:/bin/bash\nstudent:x:1000:1000:student:/home/student:/bin/bash\n' },
        },
      },
      tmp: { type: 'dir', mode: 0o777, children: {} },
    },
  }
}

function cloneFs(fs: FsDir) {
  return structuredClone(fs)
}

function getNode(fs: FsDir, path: string[]): FsNode | undefined {
  let node: FsNode = fs
  for (const segment of path) {
    if (!segment) continue
    if (node.type !== 'dir') return undefined
    node = node.children[segment]
    if (!node) return undefined
  }
  return node
}

function ensureParent(fs: FsDir, path: string[], recursive: boolean) {
  let node: FsNode = fs
  for (const segment of path.slice(0, -1)) {
    if (node.type !== 'dir') throw new Error(`${segment}: Not a directory`)
    if (!node.children[segment]) {
      if (!recursive) throw new Error(`${segment}: No such file or directory`)
      node.children[segment] = { type: 'dir', mode: 0o755, children: {} }
    }
    node = node.children[segment]
  }
  if (node.type !== 'dir') throw new Error('Not a directory')
  return node
}

function resolvePath(cwd: string[], target: string) {
  const base = target.startsWith('/') ? [] : [...cwd]
  target.split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') base.pop()
    else base.push(part)
  })
  return base
}

function pathText(path: string[]) {
  return `/${path.join('/')}`
}

function modeText(node: FsNode) {
  const bits = node.mode
  const chars = ['r', 'w', 'x']
  const groups = [bits >> 6, bits >> 3, bits].map((part) =>
    chars.map((char, index) => (part & (4 >> index) ? char : '-')).join(''),
  )
  return `${node.type === 'dir' ? 'd' : '-'}${groups.join('')}`
}

function tokenize(input: string) {
  return [...input.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3])
}

function readLocalArray(key: string) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function isPracticeRecord(value: unknown): value is PracticeRecord {
  const item = value as PracticeRecord
  return Boolean(item && typeof item.id === 'string' && typeof item.questionId === 'string' && typeof item.isCorrect === 'boolean')
}

function isQuestion(value: unknown): value is Question {
  const item = value as Question
  return Boolean(item && typeof item.id === 'string' && typeof item.question === 'string' && Array.isArray(item.options) && Array.isArray(item.tags))
}

function normalizeAnswer(answer: string) {
  return answer.trim().replace(/[.。]/g, '').toUpperCase()
}

function compareChapter(a: string, b: string) {
  return Number(a.match(/\d+/)?.[0] ?? 999) - Number(b.match(/\d+/)?.[0] ?? 999)
}

function shuffle<T>(items: T[]) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item)
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function downloadJson(payload: unknown, name: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export default App
