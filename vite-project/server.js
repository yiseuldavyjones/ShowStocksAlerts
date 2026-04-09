import 'dotenv/config'
import express from 'express'
import YahooFinance from 'yahoo-finance2'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const yf  = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

// ── 프로덕션: Vite 빌드 정적 파일 서빙 ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')))
}

// ── 주가 조회 ──
app.get('/api/quotes', async (req, res) => {
  const { symbols } = req.query
  if (!symbols) return res.status(400).json({ error: 'symbols 파라미터 필요' })

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean)
  const results = {}

  await Promise.all(
    symbolList.map(async (symbol) => {
      try {
        const q = await yf.quote(symbol)
        results[symbol] = {
          price:         q.regularMarketPrice,
          prevClose:     q.regularMarketPreviousClose,
          change:        q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          marketName:    q.shortName || q.longName || symbol,
          currency:      q.currency || '',
          exchange:      q.fullExchangeName || q.exchange || '',
          quoteType:     q.quoteType || '',
        }
      } catch (e) {
        console.error(`[${symbol}] 조회 실패:`, e.message)
      }
    })
  )

  res.json(results)
})

// ── 프로덕션: SPA 라우팅 폴백 ──
if (process.env.NODE_ENV === 'production') {
  app.get('*', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${PORT}`)
})
