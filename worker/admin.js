export default async function adminHandler(request, env, corsHeaders) {
    const url = new URL(request.url);

    // 🚨 ULTIMATE SECURITY: Admin Secret Key Check
    // Frontend (admin.html) hamesha yeh secret header me bhejega
    const adminSecret = request.headers.get("admin-secret");
    const MY_SECRET = "ANIKET_MASTER_77"; // Isko tum apne hisaab se change kar sakte ho

    if (adminSecret !== MY_SECRET) {
        return new Response(JSON.stringify({ error: "🚫 Access Denied! You are not the Admin." }), {
            status: 403,
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // Database se current users nikalna
    let usersData = await env.USERS_DB.get("users_list", "json") || {};

    // ==========================================
    // 1. READ: Get all users
    // ==========================================
    if (url.pathname === "/admin/users" && request.method === "GET") {
        return new Response(JSON.stringify({ success: true, users: usersData }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // ==========================================
    // 2. CREATE / UPDATE: Add new user or edit existing
    // ==========================================
    if (url.pathname === "/admin/user" && (request.method === "POST" || request.method === "PUT")) {
        const body = await request.json();
        const { userId, password, name, mobile, allowedDevices, validityDays, isEdit } = body;

        if (!userId || !password) {
            return new Response(JSON.stringify({ error: "UserID and Password required!" }), { status: 400, headers: corsHeaders });
        }

        // UNIQUE ID CHECK: Agar naya user bana rahe ho aur ID pehle se hai
        if (!isEdit && usersData[userId]) {
            return new Response(JSON.stringify({ error: "🚫 User ID already taken! Choose a unique ID (like insta)." }), { status: 400, headers: corsHeaders });
        }

        // Preserve existing data if editing
        const existingUser = usersData[userId] || {};

        // Validity Date Calculate karna
        let expiryDateStr = existingUser.expiresAt;
        if (validityDays && parseInt(validityDays) > 0) {
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + parseInt(validityDays));
            expiryDateStr = expiryDate.toISOString().split('T')[0];
        } else if (!existingUser.expiresAt) {
            // Default 30 days for new users if not specified
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);
            expiryDateStr = expiryDate.toISOString().split('T')[0];
        }

        // Create or Update User Object
        usersData[userId] = {
            name: name || existingUser.name || "User",
            password: password,
            mobile: mobile || existingUser.mobile || "", // NAYA FIELD: Mobile Number
            allowedDevices: parseInt(allowedDevices || existingUser.allowedDevices || 1),
            activeTokens: existingUser.activeTokens || [], // Active logins disturb nahi honge
            expiresAt: expiryDateStr,
            isBanned: existingUser.isBanned || false
        };

        await env.USERS_DB.put("users_list", JSON.stringify(usersData));

        return new Response(JSON.stringify({ success: true, message: isEdit ? `User ${userId} updated successfully!` : `User ${userId} created!` }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (url.pathname === "/admin/notices" && request.method === "POST") {
        await env.USERS_DB.put("site_notices", JSON.stringify(await request.json()));
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    if (url.pathname === "/admin/notices" && request.method === "GET") {
        return new Response(JSON.stringify(await env.USERS_DB.get("site_notices", "json") || []), { headers: corsHeaders });
    }

    // ==========================================
    // 3. DELETE / BAN: Remove a user entirely
    // ==========================================
    if (url.pathname === "/admin/user" && request.method === "DELETE") {
        const body = await request.json();
        const { userId } = body;

        if (usersData[userId]) {
            delete usersData[userId];
            await env.USERS_DB.put("users_list", JSON.stringify(usersData));
            return new Response(JSON.stringify({ success: true, message: "User deleted permanently." }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }
        return new Response(JSON.stringify({ error: "User not found!" }), { status: 404, headers: corsHeaders });
    }

    // ==========================================
    // 4. RESET DEVICE: Force logout a user
    // ==========================================
    if (url.pathname === "/admin/reset-device" && request.method === "POST") {
        const body = await request.json();
        const { userId } = body;

        if (usersData[userId]) {
            usersData[userId].activeTokens = []; // Saare active devices clear kar do
            await env.USERS_DB.put("users_list", JSON.stringify(usersData));
            return new Response(JSON.stringify({ success: true, message: "All devices logged out for this user." }), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }
    }

    // ==========================================
    // 5. MASTER TOGGLE: Public vs Private Mode
    // ==========================================
    if (url.pathname === "/admin/settings" && request.method === "POST") {
        const body = await request.json();
        await env.USERS_DB.put("app_settings", JSON.stringify({ isPublicMode: body.isPublicMode }));
        return new Response(JSON.stringify({ success: true, message: body.isPublicMode ? "🔓 System Open for All" : "🔒 System Locked (Login Required)" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // ==========================================
    // 6. ADVERTISEMENT MANAGEMENT
    // ==========================================
    if (url.pathname === "/admin/ad" && request.method === "POST") {
        const body = await request.json();
        // body expect karega: { imageUrl, text, link, isActive }
        await env.USERS_DB.put("site_ad", JSON.stringify(body));
        return new Response(JSON.stringify({ success: true, message: "Advertisement updated!" }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (url.pathname === "/admin/ad" && request.method === "GET") {
        let currentAd = await env.USERS_DB.get("site_ad", "json") || { isActive: false, imageUrl: "", text: "", link: "" };
        return new Response(JSON.stringify(currentAd), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    // ==========================================
    // 7. REVIEW MANAGEMENT (Admin view & action)
    // ==========================================
    if (url.pathname === "/admin/reviews" && request.method === "GET") {
        let reviews = await env.USERS_DB.get("site_reviews", "json") || [];
        return new Response(JSON.stringify({ reviews }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (url.pathname === "/admin/review-action" && request.method === "POST") {
        const { id, action } = await request.json(); // action = 'approve' or 'delete'
        let reviews = await env.USERS_DB.get("site_reviews", "json") || [];

        if (action === 'delete') {
            reviews = reviews.filter(r => r.id !== id);
        } else if (action === 'approve') {
            let rev = reviews.find(r => r.id === id);
            if (rev) rev.status = 'approved';
        }

        await env.USERS_DB.put("site_reviews", JSON.stringify(reviews));
        return new Response(JSON.stringify({ success: true, message: `Review ${action}d successfully!` }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }
    // ==========================================
    // 8. MESSAGES / FEEDBACK MANAGEMENT
    // ==========================================
    if (url.pathname === "/admin/messages" && request.method === "GET") {
        let messages = await env.USERS_DB.get("site_messages", "json") || [];
        return new Response(JSON.stringify({ messages }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    if (url.pathname === "/admin/message-action" && request.method === "POST") {
        const { id, action } = await request.json(); // action = 'delete' or 'mark_read'
        let messages = await env.USERS_DB.get("site_messages", "json") || [];

        if (action === 'delete') {
            messages = messages.filter(m => m.id !== id);
        } else if (action === 'mark_read') {
            let msg = messages.find(m => m.id === id);
            if (msg) msg.status = 'read';
        }

        await env.USERS_DB.put("site_messages", JSON.stringify(messages));
        return new Response(JSON.stringify({ success: true, message: `Message ${action} successfully!` }), {
            headers: { "Content-Type": "application/json", ...corsHeaders }
        });
    }

    return new Response(JSON.stringify({ error: "Admin Route Not Found" }), { status: 404, headers: corsHeaders });
}