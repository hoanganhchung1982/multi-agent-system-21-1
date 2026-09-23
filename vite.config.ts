import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import geminiHandler from './api/gemini';

export default defineConfig(({ mode }) => {
  // Nạp toàn bộ biến môi trường từ file .env.local
  const env = loadEnv(mode, process.cwd(), '');

  // Đảm bảo gán API Key trực tiếp vào process.env của Node.js Server
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
  process.env.GEMINI_API_KEY = apiKey;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      {
        name: 'gemini-api-dev-server',
        configureServer(server) {
          // Bắt các request gửi đến /api/gemini
          server.middlewares.use((req, res, next) => {
            // Kiểm tra đúng endpoint /api/gemini
            if (req.url?.startsWith('/api/gemini')) {
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Method Not Allowed' }));
                return;
              }

              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const parsedBody = body ? JSON.parse(body) : {};
                  
                  // Đảm bảo cập nhật lại process.env trước khi gọi handler
                  process.env.GEMINI_API_KEY = apiKey;

                  const vercelReq: any = {
                    method: req.method,
                    body: parsedBody,
                    headers: req.headers,
                    query: {}
                  };

                  const vercelRes: any = {
                    status(code: number) {
                      res.statusCode = code;
                      return this;
                    },
                    json(data: any) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                    },
                    send(data: any) {
                      res.end(data);
                    },
                    end() {
                      res.end();
                    }
                  };

                  await geminiHandler(vercelReq, vercelRes);
                } catch (err: any) {
                  console.error("Lỗi Middleware Gemini Dev Server:", err);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err?.message || 'Server error' }));
                }
              });
              return;
            }
            next();
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});