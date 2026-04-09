import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const THRESHOLDS = [10, 5, 3]
const STORAGE_KEY = 'stock-alerts-stocks'

const DEFAULT_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: '^GSPC', name: 'S&P 500' },
]

function getAlertLevel(absPercent) {
  if (absPercent >= 10) return 'high'
  if (absPercent >= 5) return 'mid'
  if (absPercent >= 3) return 'low'
  return ''
}

async function fetchQuotes(symbols) {
  if (symbols.length === 0) return {}
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}: 서버 응답 오류`)
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  const map = {}
  for (const [symbol, q] of Object.entries(data)) {
    map[symbol] = { ...q, lastUpdated: new Date() }
  }
  return map
}

function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function sendNotification(symbol, name, changePercent, threshold) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const dir = changePercent > 0 ? '▲' : '▼'
  const abs = Math.abs(changePercent).toFixed(2)
  new Notification(`${dir} ${symbol} ${threshold}% 알림`, {
    body: `${name}: 전일 대비 ${dir} ${abs}% 변동`,
    icon: '/favicon.svg',
  })
}

function fmt(val, digits = 2) {
  if (val == null) return '-'
  return val.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtChange(val) {
  if (val == null) return '-'
  const sign = val >= 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}%`
}

function loadStocks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_STOCKS
  } catch {
    return DEFAULT_STOCKS
  }
}

function saveStocks(stockList) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stockList))
}

export default function App() {
  const [stocks, setStocks]       = useState(loadStocks)
  const [priceData, setPriceData] = useState({})
  const [alertLog, setAlertLog]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [intervalMin, setIntervalMin] = useState(5)
  const [notifyPerm, setNotifyPerm]   = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const alertedRef = useRef({})

  const [deleteTarget, setDeleteTarget] = useState(null)

  const [newSymbol, setNewSymbol]     = useState('')
  const [newName, setNewName]         = useState('')
  const [preview, setPreview]         = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [showHelp, setShowHelp]       = useState(false)

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const timer = setTimeout(() => { alertedRef.current = {} }, midnight - now)
    return () => clearTimeout(timer)
  }, [])

  const poll = useCallback(async () => {
    if (stocks.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchQuotes(stocks.map((s) => s.symbol))
      setPriceData(data)
      const newAlerts = []
      for (const stock of stocks) {
        const q = data[stock.symbol]
        if (!q) continue
        const abs = Math.abs(q.changePercent)
        for (const threshold of THRESHOLDS) {
          const key = `${stock.symbol}_${threshold}`
          if (abs >= threshold && !alertedRef.current[key]) {
            alertedRef.current[key] = true
            const displayName = stock.name || q.marketName
            sendNotification(stock.symbol, displayName, q.changePercent, threshold)
            newAlerts.push({
              id: `${Date.now()}_${stock.symbol}_${threshold}`,
              symbol: stock.symbol,
              name: displayName,
              changePercent: q.changePercent,
              threshold,
              time: new Date(),
            })
          }
        }
      }
      if (newAlerts.length > 0) {
        setAlertLog((prev) => [...newAlerts, ...prev].slice(0, 100))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [stocks])

  useEffect(() => {
    requestNotifyPermission()
    poll()
    const id = setInterval(poll, intervalMin * 60 * 1000)
    return () => clearInterval(id)
  }, [poll, intervalMin])

  async function lookupSymbol(e) {
    e.preventDefault()
    const sym = newSymbol.trim().toUpperCase()
    if (!sym) return
    if (stocks.some((s) => s.symbol === sym)) {
      setLookupError(`"${sym}"은(는) 이미 추가된 종목입니다`)
      return
    }
    setLookupLoading(true)
    setLookupError(null)
    setPreview(null)
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(sym)}`)
      if (!res.ok) throw new Error('서버 오류가 발생했습니다')
      const data = await res.json()
      const q = data[sym]
      if (!q || q.price == null) {
        throw new Error(`"${sym}" 심볼을 찾을 수 없습니다. Yahoo Finance에서 심볼을 확인해주세요.`)
      }
      setPreview({ symbol: sym, ...q })
      setNewName(q.marketName || sym)
    } catch (e) {
      setLookupError(e.message)
    } finally {
      setLookupLoading(false)
    }
  }

  function confirmAdd() {
    if (!preview) return
    const next = [...stocks, { symbol: preview.symbol, name: newName.trim() || preview.marketName }]
    setStocks(next)
    saveStocks(next)
    setPreview(null)
    setNewSymbol('')
    setNewName('')
    setLookupError(null)
  }

  function cancelAdd() {
    setPreview(null)
    setNewSymbol('')
    setNewName('')
    setLookupError(null)
  }

  function removeStock(symbol) {
    const stock = stocks.find((s) => s.symbol === symbol)
    setDeleteTarget({ symbol, name: stock?.name || symbol })
  }

  function confirmDelete() {
    const { symbol } = deleteTarget
    const next = stocks.filter((s) => s.symbol !== symbol)
    setStocks(next)
    saveStocks(next)
    setPriceData((prev) => { const n = { ...prev }; delete n[symbol]; return n })
    Object.keys(alertedRef.current).forEach((k) => {
      if (k.startsWith(symbol + '_')) delete alertedRef.current[k]
    })
    setDeleteTarget(null)
  }

  async function requestPermission() {
    const perm = await Notification.requestPermission()
    setNotifyPerm(perm)
  }

  const lastUpdated = Object.values(priceData)[0]?.lastUpdated
  const alertCount = alertLog.length
  const upCount = Object.values(priceData).filter((q) => q.changePercent > 0).length
  const downCount = Object.values(priceData).filter((q) => q.changePercent < 0).length

  return (
    <div className="app">
      {/* ── 헤더 ── */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-bold">Stock</span>
          <span className="logo-light">Alerts</span>
          <span className="logo-tag">주식 전일 종가 대비 알림</span>
        </div>
        <div className="header-controls">
          <label className="control-label">
            폴링 주기
            <select value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))}>
              <option value={1}>1분</option>
              <option value={5}>5분</option>
              <option value={10}>10분</option>
              <option value={30}>30분</option>
            </select>
          </label>
          <button className="btn btn-primary" onClick={poll} disabled={loading}>
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* ── 오류 배너 ── */}
        {error && (
          <div className="banner-error">
            {error}
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}
        {notifyPerm === 'denied' && (
          <div className="banner-warn">브라우저 알림이 차단되어 있습니다. 브라우저 설정에서 허용해주세요.</div>
        )}

        {/* ── 요약 카드 3개 ── */}
        <div className="summary-row">
          <div className="summary-card">
            <span className="sc-label">모니터링 종목</span>
            <span className="sc-value">
              {stocks.length}
              <span className="sc-unit">개</span>
            </span>
            <div className="sc-bar-wrap">
              <div className="sc-bar up" style={{ flex: upCount }} />
              <div className="sc-bar down" style={{ flex: downCount }} />
              <div className="sc-bar flat" style={{ flex: Math.max(0, stocks.length - upCount - downCount) }} />
            </div>
            <div className="sc-sub">
              <span className="up-text">▲ {upCount}</span>&nbsp;&nbsp;
              <span className="down-text">▼ {downCount}</span>
            </div>
          </div>

          <div className="summary-card">
            <span className="sc-label">알림 기준</span>
            <span className="sc-value">3단계</span>
            <div className="threshold-pills">
              <span className="pill low">3%</span>
              <span className="pill mid">5%</span>
              <span className="pill high">10%</span>
            </div>
            <div className="sc-sub">전일 종가 대비 변동률</div>
          </div>

          <div className="summary-card">
            <span className="sc-label">오늘 알림 발생</span>
            <span className={`sc-value ${alertCount > 0 ? 'alert-active' : ''}`}>
              {alertCount}
              <span className="sc-unit">건</span>
            </span>
            <div className="sc-sub">
              마지막 업데이트: {lastUpdated ? lastUpdated.toLocaleTimeString('ko-KR') : '-'}
            </div>
          </div>
        </div>

        {/* ── 종목 추가 ── */}
        <section className="section-card">
          <div className="section-header">
            <h2 className="section-title">종목 추가</h2>
            <button className="help-toggle" onClick={() => setShowHelp((v) => !v)}>
              {showHelp ? '도움말 닫기 ✕' : '? 심볼 찾는 방법'}
            </button>
          </div>

          {showHelp && (
            <div className="help-box">
              <p className="help-desc">
                <a href="https://finance.yahoo.com" target="_blank" rel="noopener">Yahoo Finance</a>
                에서 원하는 종목을 검색한 뒤 URL 또는 종목 페이지 상단에 표시된 <strong>심볼</strong>을 복사해 입력하세요.
              </p>
              <div className="help-grid">
                <div className="help-row">
                  <span className="help-market">🇺🇸 미국 주식</span>
                  <div className="help-chips">
                    {['AAPL', 'MSFT', 'TSLA', 'NVDA', 'AMZN'].map((s) => (
                      <button key={s} className="sym-chip" onClick={() => { setNewSymbol(s); setPreview(null); setLookupError(null) }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-market">🇰🇷 한국 주식</span>
                  <div className="help-chips">
                    {[['005930.KS', '삼성전자'], ['000660.KS', 'SK하이닉스'], ['035420.KS', 'NAVER']].map(([s, n]) => (
                      <button key={s} className="sym-chip" onClick={() => { setNewSymbol(s); setPreview(null); setLookupError(null) }} title={n}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-market">📊 지수</span>
                  <div className="help-chips">
                    {[['^GSPC', 'S&P500'], ['^IXIC', '나스닥'], ['^KS11', '코스피'], ['^N225', '닛케이']].map(([s, n]) => (
                      <button key={s} className="sym-chip" onClick={() => { setNewSymbol(s); setPreview(null); setLookupError(null) }} title={n}>{s}</button>
                    ))}
                  </div>
                </div>
                <div className="help-row">
                  <span className="help-market">💱 환율</span>
                  <div className="help-chips">
                    {['USDKRW=X', 'EURUSD=X', 'USDJPY=X'].map((s) => (
                      <button key={s} className="sym-chip" onClick={() => { setNewSymbol(s); setPreview(null); setLookupError(null) }}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="add-area">
            {!preview ? (
              <form className="add-form" onSubmit={lookupSymbol}>
                <input
                  className="form-input"
                  placeholder="심볼 입력 (예: AAPL, 005930.KS, ^GSPC)"
                  value={newSymbol}
                  onChange={(e) => { setNewSymbol(e.target.value); setLookupError(null) }}
                />
                <button className="btn btn-primary" type="submit" disabled={lookupLoading || !newSymbol.trim()}>
                  {lookupLoading ? '검색 중…' : '검색'}
                </button>
              </form>
            ) : (
              <div className="preview-wrap">
                <div className="preview-card">
                  <div className="preview-left">
                    <span className="preview-symbol">{preview.symbol}</span>
                    <span className="preview-exchange">
                      {preview.exchange}{preview.quoteType ? ` · ${preview.quoteType}` : ''}
                    </span>
                  </div>
                  <div className="preview-center">
                    <span className="preview-name">{preview.marketName}</span>
                    <span className="preview-price">
                      {fmt(preview.price)}<span className="currency"> {preview.currency}</span>
                    </span>
                  </div>
                  <div className={`preview-pct ${preview.changePercent >= 0 ? 'up' : 'down'}`}>
                    {preview.changePercent >= 0 ? '▲' : '▼'} {Math.abs(preview.changePercent).toFixed(2)}%
                  </div>
                </div>
                <div className="add-form">
                  <input className="form-input" placeholder="표시 이름 (비워두면 Yahoo 이름 사용)" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button className="btn btn-primary" onClick={confirmAdd}>+ 추가</button>
                  <button className="btn btn-outline" onClick={cancelAdd}>취소</button>
                </div>
              </div>
            )}
            {lookupError && <p className="lookup-error">{lookupError}</p>}
          </div>
        </section>

        {/* ── 모니터링 테이블 ── */}
        <section className="section-card">
          <div className="section-header">
            <h2 className="section-title">
              모니터링 종목
              <span className="count-badge">{stocks.length}</span>
            </h2>
            <div className="legend">
              <span className="leg-dot low" /> 주의 3%+
              <span className="leg-dot mid" /> 경보 5%+
              <span className="leg-dot high" /> 급변 10%+
            </div>
          </div>

          {stocks.length === 0 ? (
            <p className="empty-msg">위 폼에서 종목을 추가하세요.</p>
          ) : (
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th className="col-symbol">종목</th>
                    <th className="col-price">현재가</th>
                    <th className="col-change">등락</th>
                    <th className="col-pct">등락률</th>
                    <th className="col-prev">전일 종가</th>
                    <th className="col-alert">알림</th>
                    <th className="col-del" />
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock) => {
                    const q = priceData[stock.symbol]
                    const abs = q ? Math.abs(q.changePercent) : 0
                    const level = q ? getAlertLevel(abs) : ''
                    const isUp = q?.changePercent >= 0

                    return (
                      <tr key={stock.symbol} className={`stock-row ${level ? `row-${level}` : ''}`}>
                        <td className="col-symbol">
                          <span className="sym-text">{stock.symbol}</span>
                          <span className="sym-name">{stock.name || q?.marketName || ''}</span>
                        </td>
                        <td className="col-price num">
                          {q ? fmt(q.price) : <span className="muted">{loading ? '…' : '-'}</span>}
                          {q?.currency && <span className="currency"> {q.currency}</span>}
                        </td>
                        <td className={`col-change num ${q ? (isUp ? 'up' : 'down') : ''}`}>
                          {q ? `${isUp ? '+' : ''}${fmt(q.change)}` : '-'}
                        </td>
                        <td className={`col-pct num ${q ? (isUp ? 'up' : 'down') : ''}`}>
                          {q ? (
                            <span className={`pct-badge ${isUp ? 'up' : 'down'}`}>
                              {isUp ? '▲' : '▼'} {fmtChange(q.changePercent)}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="col-prev num muted">{q ? fmt(q.prevClose) : '-'}</td>
                        <td className="col-alert">
                          {level
                            ? <span className={`alert-chip ${level}`}>{abs >= 10 ? '급변' : abs >= 5 ? '경보' : '주의'}</span>
                            : <span className="muted small">-</span>}
                        </td>
                        <td className="col-del">
                          <button className="del-btn" onClick={() => removeStock(stock.symbol)} title="삭제">×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 알림 기록 ── */}
        {alertLog.length > 0 && (
          <section className="section-card">
            <div className="section-header">
              <h2 className="section-title">
                알림 기록
                <span className="count-badge">{alertLog.length}</span>
              </h2>
              <button className="btn btn-outline btn-sm" onClick={() => { alertedRef.current = {}; setAlertLog([]) }}>
                초기화
              </button>
            </div>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>종목</th>
                    <th>변동률</th>
                    <th>초과 기준</th>
                  </tr>
                </thead>
                <tbody>
                  {alertLog.map((a) => {
                    const level = getAlertLevel(Math.abs(a.changePercent))
                    const isUp = a.changePercent >= 0
                    return (
                      <tr key={a.id} className={`stock-row row-${level}`}>
                        <td className="muted small">{a.time.toLocaleTimeString('ko-KR')}</td>
                        <td>
                          <span className="sym-text">{a.symbol}</span>
                          <span className="sym-name">{a.name}</span>
                        </td>
                        <td className={`num ${isUp ? 'up' : 'down'}`}>
                          <span className={`pct-badge ${isUp ? 'up' : 'down'}`}>
                            {isUp ? '▲' : '▼'} {fmtChange(a.changePercent)}
                          </span>
                        </td>
                        <td>
                          <span className={`alert-chip ${level}`}>{a.threshold}% 초과</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <footer className="app-footer">
        <span>데이터 제공: Yahoo Finance</span>
        <span>폴링 주기 {intervalMin}분 · {lastUpdated ? lastUpdated.toLocaleTimeString('ko-KR') : '-'} 기준</span>
      </footer>

      {/* ── 삭제 확인 모달 ── */}
      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-icon">🗑️</span>
              <h3>종목 삭제</h3>
            </div>
            <p className="modal-body">
              <strong>{deleteTarget.symbol}</strong>
              {deleteTarget.name !== deleteTarget.symbol && <span className="modal-name"> ({deleteTarget.name})</span>}
              을(를) 삭제하시겠습니까?
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>취소</button>
              <button className="btn btn-danger" onClick={confirmDelete}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
