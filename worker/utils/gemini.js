// worker/utils/gemini.js

// File ko chhote tukdo (chunks) mein base64 banane ka function
function arrayBufferToBase64Chunked(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192; // 8KB chunks
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.slice(i, i + chunkSize));
    }
    return btoa(binary);
}

// Gemini API ko request bhejne aur fail hone par retry karne ka function
export async function fetchWithRetry(url, options, maxRetries = 3) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                // Agar Gemini server overload ho gaya (usually 503 ya 500 error)
                if (res.status >= 500) {
                    throw new Error(`Gemini Server Error (${res.status})`);
                }
                return res; // Agar hamari request galat thi (4xx error), toh seedha return karo
            }
            return res;
        } catch (error) {
            attempt++;
            console.log(`[Gemini API] Attempt ${attempt} failed: ${error.message}`);
            if (attempt >= maxRetries) throw error;
            // Retry karne se pehle thoda wait karo (1s, 2s)
            await new Promise(r => setTimeout(r, attempt * 1000));
        }
    }
}

export { arrayBufferToBase64Chunked };