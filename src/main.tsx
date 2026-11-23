import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './pages/Home.css'
import './pages/OpenPack.css'
import './pages/Collection.css'
import './pages/CardDetail.css'
import './pages/Squad.css'
import './pages/Compare.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
