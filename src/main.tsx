import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { bootstrapApplication, createFatalElement } from './app/bootstrap'

const container = document.getElementById('root')
if (!container) throw new Error('Missing Markzen root element')

const result = await bootstrapApplication()
createRoot(container).render(<StrictMode>{result.ok ? result.element : createFatalElement(result)}</StrictMode>)
