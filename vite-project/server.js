import 'dotenv/config'
import express from 'express'
import YahooFinance from 'yahoo-finance2'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Firebase Admin 초기화 ──
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

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

// ── 카카오 로그인: 인가 코드 → Firebase 커스텀 토큰 ──
app.post('/api/auth/kakao', async (req, res) => {
  const { code, redirectUri } = req.body
  if (!code || !redirectUri) {
    return res.status(400).json({ error: 'code, redirectUri 파라미터 필요' })
  }

  try {
    // 1. 카카오 액세스 토큰 교환
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     process.env.KAKAO_REST_API_KEY,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        redirect_uri:  redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[kakao] 토큰 교환 실패:', tokenData)
      return res.status(400).json({ error: tokenData.error_description || '카카오 인증 실패' })
    }

    // 2. 카카오 사용자 정보 조회
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const userInfo = await userRes.json()
    if (!userInfo.id) {
      return res.status(400).json({ error: '카카오 사용자 정보 조회 실패' })
    }

    // 3. Firebase 커스텀 토큰 발급
    const uid      = `kakao:${userInfo.id}`
    const nickname = userInfo.kakao_account?.profile?.nickname
                  || userInfo.properties?.nickname
                  || ''
    const customToken = await admin.auth().createCustomToken(uid, { provider: 'kakao', nickname })

    res.json({ customToken, nickname })
  } catch (e) {
    console.error('[kakao auth] 오류:', e)
    res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다' })
  }
})

// ── 프로덕션: SPA 라우팅 폴백 ──
if (process.env.NODE_ENV === 'production') {
  app.get('/{*path}', (_req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${PORT}`)
})
