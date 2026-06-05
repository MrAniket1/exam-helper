export default async function adminHandler(request, env, corsHeaders) {
    const url = new URL(request.url);

    const adminSecret = request.headers.get("admin-secret");
    const MY_SECRET = env.ADMIN_SECRET || "ANIKET_MASTER_77";

    if (adminSecret !== MY_SECRET) {
        return new Response(JSON.stringify({ error: "🚫 Access Denied! You are not the Admin." }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (url.pathname === "/admin/users" && request.method === "GET") {
        let usersObj = {};

        const listed = await env.USERS_DB.list({ prefix: "user:" });
        for (const key of listed.keys) {
            const userId = key.name.split(":")[1];
            usersObj[userId] = await env.USERS_DB.get(key.name, "json");
        }

        let oldUsers = await env.USERS_DB.get("users_list", "json");
        if (oldUsers) {
            for (const [id, user] of Object.entries(oldUsers)) {
                if (!usersObj[id]) {
                    usersObj[id] = user;
                    await env.USERS_DB.put("user:" + id, JSON.stringify(user));
                }
            }
            await env.USERS_DB.delete("users_list");
        }

        return new Response(JSON.stringify({ success: true, users: usersObj }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/admin/user" && (request.method === "POST" || request.method === "PUT")) {
        const body = await request.json();
        const { userId, password, name, mobile, allowedDevices, validityDays, isEdit } = body;

        if (!userId || !password) { return new Response(JSON.stringify({ error: "UserID and Password required!" }), { status: 400, headers: corsHeaders }); }

        let existingUser = await env.USERS_DB.get("user:" + userId, "json");

        if (!isEdit && existingUser) {
            return new Response(JSON.stringify({ error: "🚫 User ID already taken! Choose a unique ID." }), { status: 400, headers: corsHeaders });
        }

        existingUser = existingUser || {};

        let expiryDateStr = existingUser.expiresAt;
        if (validityDays && parseInt(validityDays) > 0) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays));
            expiryDateStr = expiryDate.toISOString().split('T')[0];
        } else if (!existingUser.expiresAt) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);
            expiryDateStr = expiryDate.toISOString().split('T')[0];
        }

        const userData = {
            name: name || existingUser.name || "User",
            password: password, mobile: mobile || existingUser.mobile || "",
            allowedDevices: parseInt(allowedDevices || existingUser.allowedDevices || 1),
            activeTokens: existingUser.activeTokens || [],
            expiresAt: expiryDateStr, isBanned: existingUser.isBanned || false
        };

        await env.USERS_DB.put("user:" + userId, JSON.stringify(userData));
        return new Response(JSON.stringify({ success: true, message: isEdit ? `User ${userId} updated successfully!` : `User ${userId} created!` }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/admin/user" && request.method === "DELETE") {
        const { userId } = await request.json();
        let userExists = await env.USERS_DB.get("user:" + userId);
        if (userExists) {
            await env.USERS_DB.delete("user:" + userId);
            return new Response(JSON.stringify({ success: true, message: "User deleted permanently." }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
        return new Response(JSON.stringify({ error: "User not found!" }), { status: 404, headers: corsHeaders });
    }

    if (url.pathname === "/admin/reset-device" && request.method === "POST") {
        const { userId } = await request.json();
        let user = await env.USERS_DB.get("user:" + userId, "json");

        if (user) {
            user.activeTokens = [];
            await env.USERS_DB.put("user:" + userId, JSON.stringify(user));
            return new Response(JSON.stringify({ success: true, message: "All devices logged out for this user." }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
    }

    if (url.pathname === "/admin/notices" && request.method === "POST") {
        await env.USERS_DB.put("site_notices", JSON.stringify(await request.json()));
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    if (url.pathname === "/admin/notices" && request.method === "GET") {
        return new Response(JSON.stringify(await env.USERS_DB.get("site_notices", "json") || []), { headers: corsHeaders });
    }

    if (url.pathname === "/admin/settings" && request.method === "POST") {
        const body = await request.json();
        await env.USERS_DB.put("app_settings", JSON.stringify({ isPublicMode: body.isPublicMode }));
        return new Response(JSON.stringify({ success: true, message: body.isPublicMode ? "🔓 System Open for All" : "🔒 System Locked" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/admin/ad" && request.method === "POST") {
        const body = await request.json();
        await env.USERS_DB.put("site_ad", JSON.stringify(body));
        return new Response(JSON.stringify({ success: true, message: "Advertisement updated!" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (url.pathname === "/admin/ad" && request.method === "GET") {
        let currentAd = await env.USERS_DB.get("site_ad", "json") || { isActive: false, imageUrl: "", text: "", link: "" };
        return new Response(JSON.stringify(currentAd), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/admin/reviews" && request.method === "GET") {
        let reviews = await env.USERS_DB.get("site_reviews", "json") || [];
        return new Response(JSON.stringify({ reviews }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (url.pathname === "/admin/review-action" && request.method === "POST") {
        const { id, action } = await request.json();
        let reviews = await env.USERS_DB.get("site_reviews", "json") || [];
        if (action === 'delete') reviews = reviews.filter(r => r.id !== id);
        else if (action === 'approve') { let rev = reviews.find(r => r.id === id); if (rev) rev.status = 'approved'; }
        await env.USERS_DB.put("site_reviews", JSON.stringify(reviews));
        return new Response(JSON.stringify({ success: true, message: `Review ${action}d successfully!` }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (url.pathname === "/admin/messages" && request.method === "GET") {
        let messages = await env.USERS_DB.get("site_messages", "json") || [];
        return new Response(JSON.stringify({ messages }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }
    if (url.pathname === "/admin/message-action" && request.method === "POST") {
        const { id, action } = await request.json();
        let messages = await env.USERS_DB.get("site_messages", "json") || [];
        if (action === 'delete') messages = messages.filter(m => m.id !== id);
        else if (action === 'mark_read') { let msg = messages.find(m => m.id === id); if (msg) msg.status = 'read'; }
        await env.USERS_DB.put("site_messages", JSON.stringify(messages));
        return new Response(JSON.stringify({ success: true, message: `Message ${action} successfully!` }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response(JSON.stringify({ error: "Admin Route Not Found" }), { status: 404, headers: corsHeaders });
}