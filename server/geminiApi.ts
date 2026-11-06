import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { MODEL_LIVE, MODEL_STATIC } from '../src/config/constants';
import { isAnalysisResult } from '../src/services/gemini';

// Production adapters MUST supply server-verified authentication and per-user quotas.
// Browser localStorage login is not a server identity. No authorizer means deny all.
export function createGeminiHandler({ getClient, authorize = async () => false, now = Date.now }: {
    getClient: () => GoogleGenAI;
    authorize?: (request: IncomingMessage) => boolean | Promise<boolean>;
    now?: () => number;
}) {
    return async (req: IncomingMessage, res: ServerResponse) => {
        const reply = (status: number, body: object) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            res.end(JSON.stringify(body));
        };
        try {
            if (!await authorize(req)) return reply(403, { error: 'Access denied.' });
            if (!['/api/gemini/snap', '/api/gemini/live-token'].includes(req.url ?? '')) return reply(404, { error: 'Unknown endpoint.' });
            if (req.method !== 'POST') return reply(405, { error: 'POST required.' });
            if (req.headers['content-type']?.split(';')[0] !== 'application/json') return reply(415, { error: 'JSON required.' });
            let raw = '', bytes = 0;
            for await (const chunk of req) {
                bytes += Buffer.byteLength(chunk);
                if (bytes > 3_000_000) return reply(413, { error: 'Image too large.' });
                raw += chunk.toString();
            }
            let body: any;
            try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid JSON.' }); }
            if (!body || Array.isArray(body) || typeof body !== 'object') return reply(400, { error: 'Invalid request.' });
            const signal = AbortSignal.timeout(20_000);
            if (req.url === '/api/gemini/live-token') {
                if (Object.keys(body).length) return reply(400, { error: 'Unexpected fields.' });
                const token = await getClient().authTokens.create({ config: {
                    uses: 1, expireTime: new Date(now() + 10 * 60_000).toISOString(),
                    newSessionExpireTime: new Date(now() + 60_000).toISOString(), abortSignal: signal,
                    liveConnectConstraints: { model: MODEL_LIVE, config: { responseModalities: [Modality.AUDIO] } },
                    lockAdditionalFields: [],
                } });
                if (!token.name?.startsWith('auth_tokens/')) throw new Error('Invalid upstream token');
                return reply(200, { token: token.name });
            }
            if (Object.keys(body).length !== 1 || typeof body.image !== 'string'
                || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(body.image) || body.image.length % 4 !== 0) {
                return reply(400, { error: 'JPEG image required.' });
            }
            const fields = ['chinese', 'pinyin', 'english', 'sentence', 'sentencePinyin', 'sentenceEnglish', 'funFact', 'commonMistake'];
            const response = await getClient().models.generateContent({ model: MODEL_STATIC,
                contents: [{ role: 'user', parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: body.image } },
                    { text: 'Identify the main object. Return simplified Chinese, tone-marked Pinyin, English, a simple business-appropriate example sentence with Pinyin and English, HSK level 1-6, an English cultural funFact and commonMistake, and radicals as an array of Chinese components.' },
                ] }], config: { abortSignal: signal, responseMimeType: 'application/json', responseSchema: {
                    type: Type.OBJECT, required: [...fields, 'hskLevel', 'radicals'],
                    properties: { ...Object.fromEntries(fields.map(k => [k, { type: Type.STRING }])),
                        hskLevel: { type: Type.NUMBER }, radicals: { type: Type.ARRAY, items: { type: Type.STRING } } },
                } },
            });
            const result = JSON.parse(response.text ?? 'null');
            if (!isAnalysisResult(result)) throw new Error('Invalid upstream result');
            return reply(200, result);
        } catch {
            // SDK error messages can contain request details. Never return or log them.
            return reply(502, { error: 'AI service unavailable. Please try again.' });
        }
    };
}

// Development only: reject DNS rebinding, remote clients, missing/foreign origins.
export function authorizeLocalDev(req: IncomingMessage): boolean {
    return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')
        && req.headers.host === 'localhost:3000' && req.headers.origin === 'http://localhost:3000';
}
