import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { UpdatePrompt } from './components/UpdatePrompt'
import { syncTesterFlagFromUrl } from './lib/testerFlag'

syncTesterFlagFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdatePrompt />
    <App />
  </StrictMode>,
)
