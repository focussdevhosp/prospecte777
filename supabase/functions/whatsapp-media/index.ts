import {
  assertOwnsInstance,
  checkRateLimit,
  corsHeaders,
  handleCors,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const { phone, instance_id, media_type, media_url, caption, base64_audio } = await req.json();

    if (!phone || !instance_id) {
      return new Response(
        JSON.stringify({ error: "Missing phone or instance_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ownership = await assertOwnsInstance(auth.ctx, String(instance_id));
    if (ownership) return ownership;

    if (auth.ctx.kind === "user") {
      const limit = await checkRateLimit(auth.ctx.supabase, auth.ctx.userId, "whatsapp-media", 60, 60);
      if (!limit.allowed) return rateLimited(limit.resetIn);
    }

    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      throw new Error("Evolution API not configured");
    }

    // Format phone number
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
      formattedPhone = "55" + formattedPhone;
    }

    console.log(`Sending ${media_type} to ${formattedPhone} via instance ${instance_id}`);

    let endpoint = "";
    let body: any = { number: formattedPhone };

    switch (media_type) {
      case "image":
        endpoint = `/message/sendMedia/${instance_id}`;
        body = {
          number: formattedPhone,
          mediatype: "image",
          media: media_url,
          caption: caption || "",
        };
        break;

      case "document":
        endpoint = `/message/sendMedia/${instance_id}`;
        body = {
          number: formattedPhone,
          mediatype: "document",
          media: media_url,
          caption: caption || "",
        };
        break;

      case "audio":
        // Audio can be sent as base64 or URL
        if (base64_audio) {
          endpoint = `/message/sendWhatsAppAudio/${instance_id}`;
          body = {
            number: formattedPhone,
            audio: base64_audio,
          };
        } else {
          endpoint = `/message/sendMedia/${instance_id}`;
          body = {
            number: formattedPhone,
            mediatype: "audio",
            media: media_url,
          };
        }
        break;

      case "video":
        endpoint = `/message/sendMedia/${instance_id}`;
        body = {
          number: formattedPhone,
          mediatype: "video",
          media: media_url,
          caption: caption || "",
        };
        break;

      case "sticker":
        endpoint = `/message/sendSticker/${instance_id}`;
        body = {
          number: formattedPhone,
          sticker: media_url,
        };
        break;

      default:
        throw new Error(`Unsupported media type: ${media_type}`);
    }

    const sendResponse = await fetch(`${EVOLUTION_API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        apikey: EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("Evolution send media error:", errorText);
      throw new Error(`Failed to send media: ${errorText}`);
    }

    const sendData = await sendResponse.json();
    console.log("Media sent:", sendData);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: sendData.key?.id || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("WhatsApp media error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send media" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
