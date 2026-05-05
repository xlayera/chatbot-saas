import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const anthropic = new Anthropic(); // Lee ANTHROPIC_API_KEY del entorno

// Caché en memoria para no releer JSONs en cada request
const clientCache = new Map();

function loadClientConfig(clientId) {
  if (clientCache.has(clientId)) return clientCache.get(clientId);

  const filePath = join(__dirname, 'clients', `${clientId}.json`);
  const config = JSON.parse(readFileSync(filePath, 'utf-8'));
  clientCache.set(clientId, config);
  return config;
}

app.use(cors());
app.use(express.json());

// POST /api/chat?client=demo-restaurant
// Body: { messages: [{ role: "user", content: "..." }, ...] }
app.post('/api/chat', async (req, res) => {
  const clientId = req.query.client;

  // Solo letras minúsculas, números y guiones — bloquea path traversal
  if (!clientId || !/^[a-z0-9-]+$/.test(clientId)) {
    return res.status(400).json({ error: 'Client ID inválido' });
  }

  let config;
  try {
    config = loadClientConfig(clientId);
  } catch {
    return res.status(404).json({ error: `Cliente "${clientId}" no encontrado` });
  }

  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Se requiere el campo "messages"' });
  }

  // Validar que cada mensaje tenga role y content como string
  const validRoles = new Set(['user', 'assistant']);
  const allValid = messages.every(
    m => validRoles.has(m.role) && typeof m.content === 'string' && m.content.trim()
  );
  if (!allValid) {
    return res.status(400).json({ error: 'Formato de mensajes inválido' });
  }

  // Limitar historial para evitar abusos (últimas 10 rondas)
  const recentMessages = messages.slice(-20);

  try {
    const response = await anthropic.messages.create({
      model: config.model ?? 'claude-haiku-4-5',
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: config.systemPrompt,
          // El system prompt se cachea — todos los clientes del restaurante
          // comparten el mismo prefijo, reduciendo costo ~90% tras el primer request
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: recentMessages,
    });

    const reply = response.content.find(b => b.type === 'text')?.text ?? '';
    res.json({ reply });
  } catch (err) {
    console.error('Error Anthropic API:', err.message);
    res.status(500).json({ error: 'Error al procesar el mensaje' });
  }
});

// Health check útil para deploys
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
