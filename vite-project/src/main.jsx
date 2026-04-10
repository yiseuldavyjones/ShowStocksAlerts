import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LoginPage from './LoginPage.jsx'
import { auth, onAuthStateChanged } from './firebase'

function Root() {
  const [user, setUser] = useState(undefined) // undefined = 인증 상태 확인 중

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u ?? null))
  }, [])

  if (user === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: '1rem' }}>
        로딩 중…
      </div>
    )
  }
  if (!user) return <LoginPage />
  return <App user={user} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
