import { useState, useEffect } from 'react'
import { auth, signInWithCustomToken, updateProfile } from './firebase'
import './LoginPage.css'

const REDIRECT_URI = `${window.location.origin}/auth/login/kakao`

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Kakao SDK 초기화
  useEffect(() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      window.Kakao.init(import.meta.env.VITE_KAKAO_APP_KEY)
    }
  }, [])

  // 카카오 리다이렉트 콜백 처리 (URL에 ?code= 파라미터가 있을 때)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')
    if (!code) return

    // URL에서 code 제거
    window.history.replaceState({}, '', window.location.pathname)
    handleKakaoCallback(code)
  }, [])

  async function handleKakaoCallback(code) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri: REDIRECT_URI }),
      })
      if (!res.ok) {
        const text = await res.text()
        let errorMsg = '서버 오류가 발생했습니다'
        try { errorMsg = JSON.parse(text).error || errorMsg } catch { /* HTML 404 등 */ }
        throw new Error(errorMsg)
      }
      const { customToken, nickname } = await res.json()
      await signInWithCustomToken(auth, customToken)
      if (nickname && auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: nickname })
      }
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  function handleKakaoLogin() {
    if (!window.Kakao?.isInitialized()) {
      setError('카카오 SDK가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    // 카카오 OAuth 페이지로 리다이렉트
    window.Kakao.Auth.authorize({ redirectUri: REDIRECT_URI })
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-bold">Stock</span>
          <span className="logo-light">Alerts</span>
        </div>
        <p className="login-desc">
          전일 종가 대비 실시간 변동을 확인하고<br />
        원하는 변동 시 알림을 받으세요
        </p>

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>실시간 주가 추적</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔔</span>
            <span>조건 기반 푸시 알림</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">☁️</span>
            <span>클라우드 자동저장</span>
          </div>
        </div>

        <button
          className="kakao-btn"
          onClick={handleKakaoLogin}
          disabled={loading}
        >
          <img
            src="https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
            alt=""
            width="20"
            height="20"
          />
          {loading ? '로그인 중…' : '카카오 로그인'}
        </button>

        {error && <p className="login-error">{error}</p>}

        <p className="login-notice">
          로그인하면 종목 목록이 계정에 저장되어<br />
          어디서든 동일하게 사용할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
