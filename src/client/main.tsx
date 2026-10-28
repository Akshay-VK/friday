import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { applyTheme } from './theme.ts'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Friday shell is missing its root element')

applyTheme('system')
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
