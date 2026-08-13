// نقطة الدخول الرئيسية لـ Worker — يوجّه طلبات /api/* للدوال المناسبة،
// وأي طلب ثاني (index.html, css, js, صور, فيديو) يمرّره تلقائياً لملفات public/ الثابتة

import { handleChat } from './chat.js';
import { handleTTS } from './tts.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/api/chat' && request.method === 'POST') {
            return handleChat(request, env);
        }

        if (url.pathname === '/api/tts' && request.method === 'POST') {
            return handleTTS(request);
        }

        // أي مسار ثاني: قدّم الملف الثابت المطابق من public/ (index.html, css, js, bg.png, ...)
        return env.ASSETS.fetch(request);
    }
};
