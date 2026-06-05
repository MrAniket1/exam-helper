export default async function authHandler(request, env, corsHeaders) {
    const url = new URL(request.url);

    if (url.pathname === "/login" && request.method === "POST") {
        let body;
        try {
            body = await request.json();
        } catch (err) {
            return new Response(JSON.stringify({ error: "Invalid JSON format" }), { status: 400, headers: corsHeaders });
        }

        const { userId, password, deviceToken } = body;

        if (!userId || !password) {
            return new Response(JSON.stringify({ success: false, error: "Please enter User ID and Password." }), { status: 400, headers: corsHeaders });
        }

        let user = await env.USERS_DB.get("user:" + userId, "json");

        if (!user || user.password !== password) {
            return new Response(JSON.stringify({ success: false, error: "🚫 Invalid User ID or Password." }), { status: 401, headers: corsHeaders });
        }

        const today = new Date().toISOString().split('T')[0];
        if (user.expiresAt < today) {
            return new Response(JSON.stringify({ success: false, error: "⏳ Subscription expired! Contact Admin to renew." }), { status: 403, headers: corsHeaders });
        }

        if (!user.activeTokens) user.activeTokens = [];
        let currentToken = deviceToken;

        if (currentToken && user.activeTokens.includes(currentToken)) {
            return new Response(JSON.stringify({ success: true, token: currentToken, name: user.name }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        if (user.activeTokens.length >= user.allowedDevices) {
            return new Response(JSON.stringify({ success: false, error: `📱 Device limit reached! (Max: ${user.allowedDevices}). Please log out from other devices first.` }), { status: 403, headers: corsHeaders });
        }

        currentToken = crypto.randomUUID();
        user.activeTokens.push(currentToken);

        await env.USERS_DB.put("user:" + userId, JSON.stringify(user));

        return new Response(JSON.stringify({ success: true, token: currentToken, name: user.name }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/logout" && request.method === "POST") {
        const { userId, deviceToken } = await request.json();

        let user = await env.USERS_DB.get("user:" + userId, "json");

        if (user && user.activeTokens) {
            user.activeTokens = user.activeTokens.filter(t => t !== deviceToken);
            await env.USERS_DB.put("user:" + userId, JSON.stringify(user));
        }

        return new Response(JSON.stringify({ success: true, message: "Logged out successfully" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Auth Route Not Found" }), { status: 404, headers: corsHeaders });
}