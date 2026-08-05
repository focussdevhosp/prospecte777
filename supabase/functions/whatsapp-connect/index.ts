import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getInternalSecret } from "../_shared/auth.ts";

/**
 * URL que a Evolution vai chamar quando o lead responder. Leva o segredo
 * interno na query para o webhook conseguir provar que a chamada é dela.
 */
async function buildWebhookUrl(supabaseUrl: string, supabase: any): Promise<string> {
  const base = `${supabaseUrl}/functions/v1/webhook`;
  const secret = await getInternalSecret(supabase);
  return secret ? `${base}?s=${encodeURIComponent(secret)}` : base;
}

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize URL: remove trailing slashes and any extra path segments
    let EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    
    if (EVOLUTION_API_URL) {
      // Remove trailing slash
      EVOLUTION_API_URL = EVOLUTION_API_URL.replace(/\/+$/, "");
      // If URL has extra path like /projects/xxx, strip it to base URL only
      try {
        const parsed = new URL(EVOLUTION_API_URL);
        if (parsed.pathname && parsed.pathname !== "/" && parsed.pathname.length > 1) {
          console.log(`Stripping extra path from EVOLUTION_API_URL: ${parsed.pathname}`);
          EVOLUTION_API_URL = `${parsed.protocol}//${parsed.host}`;
        }
      } catch (_) {
        // keep as-is if URL parsing fails
      }
      console.log(`Using Evolution API URL: ${EVOLUTION_API_URL}`);
    }

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Evolution API not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, phoneNumber } = await req.json();
    const instanceName = `prospecte_${user.id.replace(/-/g, "_")}`;

    const supabaseService = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "create_instance") {
      console.log(`Creating instance: ${instanceName}`);
      
      // Get webhook URL for this instance
      const webhookUrl = await buildWebhookUrl(supabaseUrl, supabaseService);
      
      const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: "POST",
        headers: {
          "apikey": EVOLUTION_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: {
            url: webhookUrl,
            byEvents: false,
            base64: false,
            headers: {
              "Content-Type": "application/json",
            },
            events: [
              "MESSAGES_UPSERT",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
            ],
          },
          websocket: {
            enabled: false,
          },
          rabbitmq: {
            enabled: false,
          },
          sqs: {
            enabled: false,
          },
          chatwoot: {
            enabled: false,
          },
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.text();
        console.error("Evolution create error:", errorData);
        
        // If instance already exists, try to get QR code
        if (errorData.includes("already") || errorData.includes("exists") || errorData.includes("Instance already")) {
          console.log("Instance exists, fetching QR code...");
          const connectResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
          });
          
          if (connectResponse.ok) {
            const connectData = await connectResponse.json();
            
            // Update webhook for existing instance
            await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
              method: "POST",
              headers: {
                "apikey": EVOLUTION_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: webhookUrl,
                byEvents: false,
                base64: false,
                events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
              }),
            });
            
            return new Response(JSON.stringify(connectData), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        
        throw new Error(`Failed to create WhatsApp instance: ${errorData}`);
      }

      const instanceData = await createResponse.json();
      console.log("Instance created successfully:", JSON.stringify(instanceData));

      await supabaseService
        .from("user_settings")
        .update({ whatsapp_instance_id: instanceName })
        .eq("user_id", user.id);

      // Extract QR code from creation response if available
      let base64 = instanceData.qrcode?.base64 || instanceData.base64;
      const pairingCode = instanceData.qrcode?.pairingCode || instanceData.pairingCode;
      
      // If no QR code in creation response, wait and fetch it
      if (!base64) {
        console.log("No QR in creation response, waiting for instance to initialize...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Fetch QR code with retries
        for (let attempt = 1; attempt <= 5; attempt++) {
          console.log(`Fetching QR code attempt ${attempt}/5...`);
          const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
            method: "GET",
            headers: { "apikey": EVOLUTION_API_KEY },
          });
          
          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            console.log(`QR fetch response attempt ${attempt}:`, JSON.stringify(qrData).substring(0, 400));
            base64 = qrData.base64 || qrData.qrcode?.base64 || qrData.code;
            
            if (base64) {
              console.log("QR code obtained successfully!");
              break;
            }
          }
          
          if (attempt < 5) {
            const delay = attempt * 2000; // 2s, 4s, 6s, 8s
            console.log(`QR not ready, waiting ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      if (!base64) {
        console.log("QR code not available after retries, returning partial response");
      }
      
      return new Response(JSON.stringify({
        ...instanceData,
        base64,
        pairingCode,
        message: base64 ? "QR code ready" : "QR code loading, please refresh",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_qrcode") {
      console.log(`Getting QR code for: ${instanceName}`);
      
      // First check if instance exists
      const statusCheck = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers: { "apikey": EVOLUTION_API_KEY },
      });
      
      if (!statusCheck.ok) {
        console.log("Instance doesn't exist, need to create first");
        return new Response(JSON.stringify({
          error: "Instância não existe. Clique em 'Conectar WhatsApp' primeiro.",
          needsCreate: true,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Try up to 6 times with delays to wait for QR generation
      let qrData: { base64?: string; code?: string; pairingCode?: string; count?: number } = { count: 0 };
      const maxAttempts = 6;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`QR code attempt ${attempt}/${maxAttempts}`);
        
        const qrResponse = await fetch(`${EVOLUTION_API_URL}/instance/connect/${instanceName}`, {
          method: "GET",
          headers: { "apikey": EVOLUTION_API_KEY },
        });

        if (!qrResponse.ok) {
          const errorText = await qrResponse.text();
          console.error("QR code error:", errorText);
          throw new Error("Failed to get QR code");
        }

        qrData = await qrResponse.json();
        console.log(`QR Response attempt ${attempt}:`, JSON.stringify(qrData).substring(0, 400));
        
        // Check if we got the base64 QR code
        const base64Check = qrData.base64 || (qrData as Record<string, unknown>).qrcode?.base64;
        if (base64Check) {
          console.log("QR code received successfully");
          break;
        }
        
        // Wait before retry (increasing delay)
        if (attempt < maxAttempts) {
          const delay = Math.min(attempt * 2000, 6000); // 2s, 4s, 6s, 6s, 6s
          console.log(`No QR code yet, waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Evolution API returns QR in different formats depending on version
      const base64 = qrData.base64 || (qrData as Record<string, unknown>).qrcode?.base64 || qrData.code;
      const pairingCode = qrData.pairingCode || (qrData as Record<string, unknown>).pairing_code;
      
      if (!base64) {
        console.error("Could not obtain QR code after retries. Response:", JSON.stringify(qrData));
        // Instead of throwing, return a helpful response
        return new Response(JSON.stringify({
          error: "QR Code ainda não está pronto",
          message: "A instância está inicializando. Aguarde alguns segundos e tente novamente.",
          retry: true,
        }), {
          status: 202,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({
        base64,
        code: qrData.code || (qrData as Record<string, unknown>).qrcode?.code,
        pairingCode,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_pairing_code") {
      if (!phoneNumber) {
        return new Response(
          JSON.stringify({ error: "Phone number is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Format phone number - ensure it has country code (Brazil = 55)
      let formattedPhone = phoneNumber.replace(/\D/g, "");
      if (!formattedPhone.startsWith("55")) {
        formattedPhone = "55" + formattedPhone;
      }
      console.log(`Getting pairing code for: ${instanceName}, phone: ${formattedPhone}`);
      
      const webhookUrl = await buildWebhookUrl(supabaseUrl, supabaseService);
      
      // Check if instance exists
      const statusCheck = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers: { "apikey": EVOLUTION_API_KEY },
      });

      let pairingCode: string | null = null;

      if (!statusCheck.ok) {
        // Instance doesn't exist, create it
        console.log("Instance doesn't exist, creating fresh instance...");
        const createResponse = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
          method: "POST",
          headers: {
            "apikey": EVOLUTION_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
            webhook: {
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
            },
          }),
        });

        if (createResponse.ok) {
          await supabaseService
            .from("user_settings")
            .update({ whatsapp_instance_id: instanceName })
            .eq("user_id", user.id);
        }
        
        // Wait for instance to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Try to get pairing code via connect endpoint with number
      console.log("Trying connect endpoint with phone number...");
      const connectUrl = `${EVOLUTION_API_URL}/instance/connect/${instanceName}?number=${formattedPhone}`;
      const connectResponse = await fetch(connectUrl, {
        method: "GET",
        headers: { "apikey": EVOLUTION_API_KEY },
      });

      if (connectResponse.ok) {
        const connectData = await connectResponse.json();
        console.log("Connect with number response:", JSON.stringify(connectData).substring(0, 500));
        pairingCode = connectData.pairingCode || connectData.pairing_code;
      }
      
      if (!pairingCode) {
        console.log("Pairing code not available via connect, returning error with suggestion");
        // Return a more helpful error suggesting QR code
        return new Response(JSON.stringify({
          error: "Código de pareamento não disponível",
          suggestion: "use_qr_code",
          message: "Sua versão da Evolution API pode não suportar pairing code. Use o QR Code para conectar.",
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        pairingCode,
        phoneNumber: formattedPhone,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check_status") {
      console.log(`Checking status for: ${instanceName}`);
      
      const statusResponse = await fetch(`${EVOLUTION_API_URL}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers: { "apikey": EVOLUTION_API_KEY },
      });

      if (!statusResponse.ok) {
        return new Response(
          JSON.stringify({ connected: false, state: "disconnected" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const statusData = await statusResponse.json();
      const isConnected = statusData.instance?.state === "open";

      // Recadastra o webhook com o segredo na URL. Instâncias criadas antes
      // desta mudança apontam para a URL sem segredo; esta checagem roda a
      // cada visita à tela de conexão, então elas se corrigem sozinhas.
      if (isConnected) {
        try {
          const webhookUrl = await buildWebhookUrl(supabaseUrl, supabaseService);
          await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
            method: "POST",
            headers: { "apikey": EVOLUTION_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              url: webhookUrl,
              byEvents: false,
              base64: false,
              events: WEBHOOK_EVENTS,
            }),
          });
        } catch (e) {
          console.error("Falha ao recadastrar webhook:", e);
        }
      }

      await supabaseService
        .from("user_settings")
        .update({
          whatsapp_connected: isConnected,
          whatsapp_instance_id: instanceName,
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ 
          connected: isConnected, 
          state: statusData.instance?.state || "unknown" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disconnect") {
      console.log(`Disconnecting and deleting instance: ${instanceName}`);
      
      // First logout the instance
      try {
        await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        console.log("Instance logged out successfully");
      } catch (logoutError) {
        console.error("Logout error (continuing with delete):", logoutError);
      }

      // Then delete the instance completely so a new one is created on reconnect
      try {
        const deleteResponse = await fetch(`${EVOLUTION_API_URL}/instance/delete/${instanceName}`, {
          method: "DELETE",
          headers: { "apikey": EVOLUTION_API_KEY },
        });
        
        if (deleteResponse.ok) {
          console.log("Instance deleted successfully");
        } else {
          const deleteError = await deleteResponse.text();
          console.error("Delete instance error:", deleteError);
        }
      } catch (deleteError) {
        console.error("Delete instance error:", deleteError);
      }

      // Clear both whatsapp_connected and whatsapp_instance_id so a fresh instance is created
      await supabaseService
        .from("user_settings")
        .update({ 
          whatsapp_connected: false,
          whatsapp_instance_id: null,
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true, deleted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("WhatsApp connect error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
