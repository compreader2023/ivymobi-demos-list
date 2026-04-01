import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "未授权" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const { user_id, name, phone, password, role } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "缺少用户ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check target user
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", user_id)
      .single();

    const isSuperadmin = callerProfile?.role === "superadmin";
    const isSelf = caller.id === user_id;

    // Non-superadmin can only edit self, and cannot edit superadmin
    if (!isSelf && !isSuperadmin) {
      return new Response(JSON.stringify({ error: "权限不足" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (targetProfile?.role === "superadmin" && !isSuperadmin) {
      return new Response(JSON.stringify({ error: "无法修改超管信息" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (name) profileUpdate.name = name;
    if (phone) profileUpdate.phone = phone;
    if (role && isSuperadmin) profileUpdate.role = role;

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("user_id", user_id);

      if (profileError) {
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update password if provided
    if (password) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password,
      });
      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update email if phone changed
    if (phone) {
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        email: `${phone}@demo.internal`,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
