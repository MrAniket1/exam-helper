// worker/handlers/generate.js
import { arrayBufferToBase64Chunked, fetchWithRetry } from '../utils/gemini.js';

export async function handleGenerate(request, env, corsHeaders) {
    const formData = await request.formData();
    const text = formData.get("text");
    const file = formData.get("file");
    const formatType = formData.get("formatType");
    const detailLevel = formData.get("detailLevel");
    const magicTrick = formData.get("magicTrick") === "true";
    const focusArea = formData.get("focusArea") || "";

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

    // Focus Area Instruction
    if (focusArea.trim() !== "") {
        promptInstruction += `\n\nCRITICAL: The user ONLY wants information about: "${focusArea}". Ignore everything else.\n`;
    }

    // Detail Level Instruction
    if (detailLevel === "short") promptInstruction += "Keep it very concise and high-level. ";
    if (detailLevel === "deep") promptInstruction += "Explain in deep detail with examples. ";
    if (magicTrick) promptInstruction += "Include a short, funny acronym or memory trick to remember the main concepts. ";

    // Formatting Instructions
    if (formatType === "Revision Notes") {
        promptInstruction += "Generate structured revision notes with headings and bullet points.";
    } else if (formatType === "Quick Summary") {
        promptInstruction += "Provide a quick, easy-to-read summary in 3-4 paragraphs.";
    } else if (formatType === "Text-based Mindmap") {
        promptInstruction += "Create a Mermaid.js mindmap logic starting with ```mermaid\\nmindmap\\n. Do NOT use emojis, special characters (like ?, !, @, etc), or long sentences inside nodes. Keep node text extremely short (1-3 words).";
    }

    // Handle Text Input
    if (text) {
        contents.push({ role: "user", parts: [{ text: `${promptInstruction}\n\nCONTENT:\n${text}` }] });
    }

    // Handle File Input
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

        if (!res.ok) {
            const errDetails = await res.text();
            throw new Error(`API Error: ${errDetails}`);
        }

        const data = await res.json();
        const aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

        return new Response(JSON.stringify({ success: true, aiResponse: aiResponseText }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Failed to process request." }), { status: 500, headers: corsHeaders });
    }
}