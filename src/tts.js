// Cloudflare Worker — يعادل مسار /api/tts
// يتصل مباشرة ببروتوكول Microsoft Edge Speech عبر WebSocket الأصلي
// (بدون مكتبة node-edge-tts لأنها تعتمد على fs و ws، وهذول غير متوفرين بـ Workers)

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICE = 'en-GB-RyanNeural';
const RATE = '-8%';
const PITCH = '-15Hz';

function randomHex(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
}

function escapeXml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function synthesize(text) {
    const connectionId = randomHex(32);
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;

    const resp = await fetch(url, {
        headers: { Upgrade: 'websocket' }
    });

    const ws = resp.webSocket;
    if (!ws) {
        throw new Error('Failed to establish WebSocket upgrade with TTS service');
    }
    ws.accept();

    return new Promise((resolve, reject) => {
        const audioChunks = [];
        let settled = false;

        const timeout = setTimeout(() => {
            if (!settled) { settled = true; ws.close(); reject(new Error('TTS timeout')); }
        }, 15000);

        ws.addEventListener('message', (event) => {
            if (typeof event.data === 'string') {
                if (event.data.includes('Path:turn.end')) {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        ws.close();
                        const totalLen = audioChunks.reduce((n, c) => n + c.byteLength, 0);
                        const merged = new Uint8Array(totalLen);
                        let offset = 0;
                        for (const chunk of audioChunks) {
                            merged.set(new Uint8Array(chunk), offset);
                            offset += chunk.byteLength;
                        }
                        resolve(merged);
                    }
                }
            } else {
                const buf = event.data;
                const view = new DataView(buf);
                const headerLen = view.getUint16(0, false);
                const headerText = new TextDecoder().decode(buf.slice(2, 2 + headerLen));
                if (headerText.includes('Path:audio')) {
                    const audioData = buf.slice(2 + headerLen);
                    audioChunks.push(audioData);
                }
            }
        });

        ws.addEventListener('error', () => {
            if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('WebSocket error')); }
        });

        ws.addEventListener('close', () => {
            if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('WebSocket closed early')); }
        });

        const configMsg =
            `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
            JSON.stringify({
                context: {
                    synthesis: {
                        audio: {
                            metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                            outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                        }
                    }
                }
            });
        ws.send(configMsg);

        const requestId = randomHex(32);
        const ssml =
            `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-GB'>` +
            `<voice name='${VOICE}'>` +
            `<prosody pitch='${PITCH}' rate='${RATE}' volume='+0%'>${escapeXml(text)}</prosody>` +
            `</voice></speak>`;

        const ssmlMsg =
            `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
    });
}

export async function handleTTS(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return new Response('Invalid request', { status: 400 });
    }

    const text = (body?.text || '').trim();
    if (!text) return new Response('No text provided', { status: 400 });

    try {
        const audioBytes = await synthesize(text);
        return new Response(audioBytes, {
            headers: { 'Content-Type': 'audio/mpeg' }
        });
    } catch (err) {
        console.log('TTS error:', err.message);
        return new Response('TTS Error', { status: 500 });
    }
}
