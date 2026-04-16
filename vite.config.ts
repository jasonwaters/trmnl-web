import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    {
      name: 'trmnl-dev-debug-logger',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.method === 'POST' && req.url === '/__trmnl_proxy') {
            const origin = req.headers.origin
            const host = req.headers.host
            const isSameOrigin =
              !!origin &&
              !!host &&
              (origin === `http://${host}` || origin === `https://${host}`)

            if (!isSameOrigin) {
              res.statusCode = 403
              res.end('Forbidden')
              return
            }

            let body = ''
            req.on('data', (chunk) => {
              body += chunk.toString()
            })
            req.on('end', () => {
              let targetUrl = ''
              try {
                const parsed = JSON.parse(body) as { url?: string }
                targetUrl = parsed.url ?? ''
              } catch {
                res.statusCode = 400
                res.end('Invalid JSON payload')
                return
              }

              if (!targetUrl) {
                res.statusCode = 400
                res.end('Missing url in payload')
                return
              }

              let parsedTargetUrl: URL
              try {
                parsedTargetUrl = new URL(targetUrl)
              } catch {
                res.statusCode = 400
                res.end('Invalid target URL')
                return
              }

              if (!['http:', 'https:'].includes(parsedTargetUrl.protocol)) {
                res.statusCode = 400
                res.end('Unsupported protocol')
                return
              }

              void fetch(parsedTargetUrl.toString())
                .then(async (upstreamResponse) => {
                  res.statusCode = upstreamResponse.status
                  const contentType = upstreamResponse.headers.get('content-type')
                  const cacheControl = upstreamResponse.headers.get('cache-control')

                  if (contentType) {
                    res.setHeader('content-type', contentType)
                  }
                  if (cacheControl) {
                    res.setHeader('cache-control', cacheControl)
                  }

                  const bodyBuffer = Buffer.from(await upstreamResponse.arrayBuffer())
                  res.end(bodyBuffer)
                })
                .catch((error: unknown) => {
                  const message =
                    error instanceof Error ? error.message : 'Proxy fetch failed'
                  console.log('[TRMNL DEV] Proxy request failed:', message)
                  res.statusCode = 502
                  res.end(message)
                })
            })
            req.on('error', () => {
              res.statusCode = 500
              res.end()
            })

            return
          }

          if (req.method !== 'POST' || req.url !== '/__trmnl_debug_log') {
            return next()
          }

          let body = ''
          req.on('data', (chunk) => {
            body += chunk.toString()
          })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) as {
                timestamp?: string
                message?: string
                details?: unknown
              }
              const timestamp = parsed.timestamp ?? new Date().toISOString()
              const message = parsed.message ?? 'No message provided.'
              console.log(`[TRMNL DEV ${timestamp}] ${message}`, parsed.details ?? '')
            } catch {
              console.log('[TRMNL DEV] Received malformed debug payload')
            }

            res.statusCode = 204
            res.end()
          })
          req.on('error', () => {
            res.statusCode = 500
            res.end()
          })
        })
      },
    },
  ],
})
