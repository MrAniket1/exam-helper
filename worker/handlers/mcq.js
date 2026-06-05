// worker/handlers/mcq.js
import { arrayBufferToBase64Chunked, fetchWithRetry } from '../utils/gemini.js';

export async function handleMCQ(request, env, corsHeaders) {
    const formData = await request.formData();
    const text = formData.get("text");
    const file = formData.get("file");
    const focusArea = formData.get("focusArea") || "";
    const language = formData.get("language") || "English"; // NAYA FEATURE: Language Selector

    // Auth Check
    const isPublicMode = JSON.parse(await env.USERS_DB.get("app_settings") || "{}").isPublicMode;
    if (!isPublicMode) {
        const userId = formData.get("userId");
        const deviceToken = formData.get("deviceToken");
        let user = await env.USERS_DB.get("user:" + userId, "json");
        if (!user || !user.activeTokens || !user.activeTokens.includes(deviceToken)) {
            return new Response(JSON.stringify({ error: "Session Expired! Please login again." }), { status: 401, headers: corsHeaders });
        }
    }

    const geminiKey = env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    let contents = [];
    let promptInstruction = "Analyze the provided text/file. ";

    if (focusArea.trim() !== "") {
        promptInstruction += `\n\nCRITICAL: The user ONLY wants MCQs from this specific topic: "${focusArea}". Ignore everything else.\n`;
    }

    // Language ko prompt me add kiya gaya hai
    promptInstruction += ` Generate exactly 10 multiple choice questions in strict JSON format. 
    RESPONSE RULES:
    1. Output MUST be a valid JSON array. 
    2. Do NOT wrap in markdown, no backticks, no text before or after JSON.
    3. Every object MUST have "question", "options" (array of 4 strings), "answer" (integer 0-3), and "explanation" (string).
    
    CRITICAL LANGUAGE INSTRUCTION: The questions, options, and explanations MUST be generated in ${language} language.`;

    if (text) {
        contents.push({ role: "user", parts: [{ text: `${promptInstruction}\n\nCONTENT:\n${text}` }] });
    }

    if (file && file.size > 0) {
        const buffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64Chunked(buffer);
        const mimeType = file.type || "application/pdf";
        contents.push({
            role: "user",
            parts: [
                { text: promptInstruction },
                { inlineData: { mimeType: mimeType, data: base64Data } }
            ]
        });
    }

    try {
        const res = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents })
        });

        if (!res.ok) throw new Error("API failed to generate MCQs.");

        const data = await res.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

        // Clean JSON response
        let cleanedJSON = aiResponseText.replace(/```json/g, "").replace(/```/g, "").trim();

        // Verify JSON validity
        const parsedQuiz = JSON.parse(cleanedJSON);

        return new Response(JSON.stringify({ success: true, questions: parsedQuiz }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: "AI generated invalid quiz structure or timed out. Please try again." }), { status: 500, headers: corsHeaders });
    }
}