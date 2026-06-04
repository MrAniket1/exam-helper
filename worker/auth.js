export default async function authHandler(request, env, corsHeaders) {
    const url = new URL(request.url);

    // ==========================================
    // 1. LOGIN ROUTE (Verify ID, Password & Limit)
    // ==========================================
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

        let usersData = await env.USERS_DB.get("users_list", "json") || {};
        const user = usersData[userId];

        // 1. Check if user exists & password matches
        if (!user || user.password !== password) {
            return new Response(JSON.stringify({ success: false, error: "🚫 Invalid User ID or Password." }), { status: 401, headers: corsHeaders });
        }

        // 2. Check Expiry Date
        const today = new Date().toISOString().split('T')[0];
        if (user.expiresAt < today) {
            return new Response(JSON.stringify({ success: false, error: "⏳ Subscription expired! Contact Admin to renew." }), { status: 403, headers: corsHeaders });
        }

        // Initialize active tokens array if it doesn't exist
        if (!user.activeTokens) user.activeTokens = [];

        let currentToken = deviceToken;

        // 3. Smart Device Recognition (Returning User)
        if (currentToken && user.activeTokens.includes(currentToken)) {
            return new Response(JSON.stringify({ success: true, token: currentToken, name: user.name }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        // 4. New Device / Browser Check (Anti-Piracy)
        if (user.activeTokens.length >= user.allowedDevices) {
            return new Response(JSON.stringify({ success: false, error: `📱 Device limit reached! (Max: ${user.allowedDevices}). Please log out from other devices first.` }), { status: 403, headers: corsHeaders });
        }

        // 5. Grant Access: Generate new token and occupy a slot
        currentToken = crypto.randomUUID();
        user.activeTokens.push(currentToken);

        await env.USERS_DB.put("users_list", JSON.stringify(usersData));

        return new Response(JSON.stringify({ success: true, token: currentToken, name: user.name }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // ==========================================
    // 2. LOGOUT ROUTE (Free up the device slot)
    // ==========================================
    if (url.pathname === "/logout" && request.method === "POST") {
        const { userId, deviceToken } = await request.json();
        let usersData = await env.USERS_DB.get("users_list", "json") || {};

        // Agar user ka token list me hai, toh usko delete (filter) kar do
        if (usersData[userId] && usersData[userId].activeTokens) {
            usersData[userId].activeTokens = usersData[userId].activeTokens.filter(t => t !== deviceToken);
            await env.USERS_DB.put("users_list", JSON.stringify(usersData));
        }

        return new Response(JSON.stringify({ success: true, message: "Logged out successfully" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Auth Route Not Found" }), { status: 404, headers: corsHeaders });
}