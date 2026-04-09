import express from 'express'
import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
const app = express()
const PORT = 3001

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
          price: q.regularMarketPrice,
          prevClose: q.regularMarketPreviousClose,
          change: q.regularMarketChange,
          changePercent: q.regularMarketChangePercent,
          marketName: q.shortName || q.longName || symbol,
          currency: q.currency || '',
          exchange: q.fullExchangeName || q.exchange || '',
          quoteType: q.quoteType || '',
        }
      } catch (e) {
        console.error(`[${symbol}] 조회 실패:`, e.message)
      }
    })
  )

  res.json(results)
})

app.listen(PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${PORT}`)
})
