import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UpdatePrompt } from './components/UpdatePrompt'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdatePrompt />
    <App />
  </StrictMode>,
)
