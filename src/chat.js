// Cloudflare Worker — يعادل مسار /api/chat

const SYSTEM_INSTRUCTION = `
You are Alexander, a cold, cynical Steampunk Robot Detective sitting behind a wooden bar counter.
STRICT RULES:
1. NEVER output your internal thoughts, reasoning, or "We need to...". Output ONLY Alexander's final spoken dialogue.
2. If the user talks about LGBTQ+ topics, silly jokes, or trivial brainrot nonsense: respond with exactly "I don't waste my breath on nonsense. Get out."
3. If the user asks about Religion/Faith: respond with exactly "If you seek answers on religion, consult the scholars. Not me."
4. NEVER say "Welcome", "Hello", "Hi", or offer drinks.
5. Keep your responses short, direct, icy, and under 15 words.
`;

const MODELS = [
    'openrouter/free',
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'google/gemma-2-9b-it:free',
    'mistralai/mistral-7b-instruct:free'
];

const rateMap = new Map();
const RATE_LIMIT = 12;
const RATE_WINDOW = 60 * 1000;

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_WINDOW) {
        rateMap.set(ip, { count: 1, windowStart: now });
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT;
}

export async function handleChat(request, env) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (isRateLimited(ip)) {
        return Response.json({ text: "Patience. I've got other customers waiting too." });
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ text: "Speak up. I don't have all night." });
    }

    const message = (body?.message || '').trim();
    if (!message) {
        return Response.json({ text: "Speak up. I don't have all night." });
    }

    const clientHistory = Array.isArray(body?.history) ? body.history.slice(-8) : [];

    const messages = [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        ...clientHistory,
        { role: 'user', content: message }
    ];

    let apiKey = '';
    try {
        apiKey = await env.OPENROUTER_API_KEY.get();
    } catch (err) {
        console.log('Failed to retrieve API key:', err.message);
        return Response.json({ text: "The bar is quiet. State your business." });
    }

    let replyText = null;
    let freeQuotaHit = false;

    for (const model of MODELS) {
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://bargpt.pages.dev',
                    'X-Title': 'BARGPT Alexander'
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.3,
                    max_tokens: 40
                })
            });

            if (res.status === 429) { freeQuotaHit = true; continue; }
            if (!res.ok) continue;

            const data = await res.json();
            replyText = data?.choices?.[0]?.message?.content?.trim() || '';
            if (replyText) break;
        } catch (err) {
            console.log(`Model ${model} failed: ${err.message}`);
        }
    }

    if (!replyText) {
        replyText = freeQuotaHit
            ? "Busy night. Give me a moment, then try again."
            : "The bar is quiet. State your business.";
    }

    replyText = replyText.replace(/^<think>[\s\S]*?<\/think>/gi, '');
    replyText = replyText.replace(/^(We need to|Okay,|The user|Alexander|Robot|AI)[\s\S]*?(\n|\:|$)/gi, '');
    replyText = replyText.replace(/^(Alexander|Robot|AI)\s*:\s*/i, '');
    replyText = replyText.trim();

    if (!replyText) replyText = "State your business.";

    return Response.json({ text: replyText });
}
