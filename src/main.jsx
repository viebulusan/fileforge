// NOTE: no <StrictMode> — its dev double-mount race breaks @paypal/react-paypal-js
// button rendering (buttons silently never attach).
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
