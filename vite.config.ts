import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import geminiHandler from './api/gemini';

export default defineConfig(({ mode }) => {
  // Nạp toàn bộ biến môi trường từ file .env.local
  const env = loadEnv(mode, process.cwd(), '');

  // Cấu hình nạp 4 API Keys cho hệ thống QUAD-CORE MAS
  const k1 = env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
  const k2 = env.GEMINI_API_KEY_2 || '';
  const k3 = env.GEMINI_API_KEY_3 || '';
  const k4 = env.GEMINI_API_KEY_4 || '';

  // Gán trực tiếp vào process.env của Node.js Server môi trường Dev
  process.env.GEMINI_API_KEY_1 = k1;
  process.env.GEMINI_API_KEY_2 = k2;
  process.env.GEMINI_API_KEY_3 = k3;
  process.env.GEMINI_API_KEY_4 = k4;

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
          // Bắt các request gửi đến /api/gemini ở môi trường dev local
          server.middlewares.use((req, res, next) => {
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
                  
                  // Đảm bảo duy trì 4 Keys trong process.env trước khi gọi Handler
                  process.env.GEMINI_API_KEY_1 = k1;
                  process.env.GEMINI_API_KEY_2 = k2;
                  process.env.GEMINI_API_KEY_3 = k3;
                  process.env.GEMINI_API_KEY_4 = k4;

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
      'process.env.GEMINI_API_KEY_1': JSON.stringify(k1),
      'process.env.GEMINI_API_KEY_2': JSON.stringify(k2),
      'process.env.GEMINI_API_KEY_3': JSON.stringify(k3),
      'process.env.GEMINI_API_KEY_4': JSON.stringify(k4),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
