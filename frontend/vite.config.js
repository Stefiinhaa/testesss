import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const redirectLoginPlugin = () => ({
  name: 'redirect-login-html',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/login' || req.url === '/login/') {
        res.statusCode = 302
        res.setHeader('Location', '/login.html')
        res.end()
        return
      }
      next()
    })
  },
})

export default defineConfig({
  plugins: [
    // redirectLoginPlugin(), // Removido para permitir React Router controlar /login
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['full-educa-icone.svg'],
      manifest: {
        name: 'FullEduca ERP',
        short_name: 'FullEduca',
        description: 'Sistema de Gestão Educacional Modular',
        theme_color: '#ef4f8b',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'full-educa-icone.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'full-educa-icone.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable' // Adicionado para garantir conformidade PWA
          }
        ]
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Unifica políticas de cache para redes externas (evita chave duplicada)
        runtimeCaching: [
          {
            // Bloqueia o Service Worker de tentar cachear scripts de redes sociais (regex)
            urlPattern: /^https:\/\/(accounts\.google\.com|connect\.facebook\.net|appleid\.cdn-apple\.com)/,
            handler: 'NetworkOnly'
          },
          {
            // Cobertura alternativa com função para mais controle (domínios adicionais)
            urlPattern: ({ url }) => url.origin.includes('facebook.net') ||
                                     url.origin.includes('google.com') ||
                                     url.origin.includes('appleid.cdn-apple.com'),
            handler: 'NetworkOnly'
          }
        ],
        // Adicionado woff2 para fontes e suporte a subpastas
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 5000000
      }
    })
  ],
  server: {
    port: 3000,
    host: true,
    // Mantém o modo dev local coerente com o mapeamento publicado em 3000.
    allowedHosts: ['frontend', 'localhost'],
    watch: {
      usePolling: true,
    },
    hmr: {
      clientPort: 3000
    }
  },
  // Remove os erros de "Failed to load source map" do Toastify nos logs
  css: {
    devSourcemap: false
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        login: path.resolve(__dirname, 'login.html'),
        register: path.resolve(__dirname, 'register.html'),
        forgotPassword: path.resolve(__dirname, 'forgot-password.html'),
        resetPassword: path.resolve(__dirname, 'reset-password.html'),
        offline: path.resolve(__dirname, 'offline.html'),
      },
    },
  }
})
