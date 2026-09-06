import { linkPreviewPlugin } from './linkPreviewServer.ts'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), linkPreviewPlugin()],
})
