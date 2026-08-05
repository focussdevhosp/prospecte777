import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertOwnsInstance,
  corsHeaders,
  handleCors,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";

interface WhatsAppGroup {
  id: string;
  subject: string;
  size: number;
  creation: number;
  owner: string;
  desc?: string;
}

interface GroupParticipant {
  id?: string;
  admin?: string;
  phoneNumber?: string;
  phone?: string;
  number?: string;
  jid?: string;
}

serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const { action, instanceId, groupJids } = await req.json();

    // Listar grupos e extrair participantes de uma instância que não é sua
    // é vazamento de contato alheio.
    const ownership = await assertOwnsInstance(auth.ctx, String(instanceId ?? ''));
    if (ownership) return ownership;

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('Missing Evolution API configuration');
      return new Response(
        JSON.stringify({ error: 'Evolution API não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!instanceId) {
      console.error('Missing instance ID');
      return new Response(
        JSON.stringify({ error: 'ID da instância não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = evolutionApiUrl.replace(/\/$/, '');

    if (action === 'list_groups') {
      console.log(`Fetching groups for instance: ${instanceId}`);
      
      // Evolution API requires getParticipants parameter
      const response = await fetch(`${baseUrl}/group/fetchAllGroups/${instanceId}?getParticipants=false`, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Evolution API error:', errorText);
        return new Response(
          JSON.stringify({ error: 'Erro ao buscar grupos', details: errorText }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const groups: WhatsAppGroup[] = await response.json();
      console.log(`Found ${groups.length} groups`);

      // Format groups for frontend
      const formattedGroups = groups.map((group) => ({
        id: group.id,
        name: group.subject,
        memberCount: group.size || 0,
        description: group.desc || '',
        createdAt: group.creation ? new Date(group.creation * 1000).toISOString() : null,
      }));

      return new Response(
        JSON.stringify({ groups: formattedGroups }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get_participants') {
      if (!groupJids || !Array.isArray(groupJids) || groupJids.length === 0) {
        return new Response(
          JSON.stringify({ error: 'IDs dos grupos não fornecidos' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Fetching participants for ${groupJids.length} groups`);
      
      const allParticipants: Array<{
        phone: string;
        name: string;
        groupId: string;
        groupName: string;
      }> = [];

      for (const groupJid of groupJids) {
        try {
          // First get group info for the name
          const groupInfoResponse = await fetch(`${baseUrl}/group/findGroupInfos/${instanceId}?groupJid=${encodeURIComponent(groupJid)}`, {
            method: 'GET',
            headers: {
              'apikey': evolutionApiKey,
              'Content-Type': 'application/json',
            },
          });

          let groupName = 'Grupo WhatsApp';
          if (groupInfoResponse.ok) {
            const groupInfo = await groupInfoResponse.json();
            groupName = groupInfo.subject || groupName;
          }

          // Get participants
          const response = await fetch(`${baseUrl}/group/participants/${instanceId}?groupJid=${encodeURIComponent(groupJid)}`, {
            method: 'GET',
            headers: {
              'apikey': evolutionApiKey,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            console.error(`Error fetching participants for group ${groupJid}:`, await response.text());
            continue;
          }

          const data = await response.json();
          
          // Log the raw response structure to debug
          console.log('Raw participants response structure:', JSON.stringify(data).slice(0, 500));
          
          // Evolution API v2 may return participants in different structures
          let participants: GroupParticipant[] = [];
          
          if (Array.isArray(data)) {
            participants = data;
          } else if (data.participants && Array.isArray(data.participants)) {
            participants = data.participants;
          } else if (data.participantsData && Array.isArray(data.participantsData)) {
            participants = data.participantsData;
          }
          
          console.log(`Processing ${participants.length} participants for group ${groupName}`);
          
          for (const participant of participants) {
            // Try multiple field names based on Evolution API versions
            // Priority: phoneNumber > phone > number > id (parsed from JID)
            let phone = '';
            
            if (participant.phoneNumber) {
              phone = String(participant.phoneNumber).replace(/\D/g, '');
            } else if (participant.phone) {
              phone = String(participant.phone).replace(/\D/g, '');
            } else if (participant.number) {
              phone = String(participant.number).replace(/\D/g, '');
            } else if (participant.jid) {
              phone = String(participant.jid).split('@')[0].replace(/\D/g, '');
            } else if (participant.id) {
              // Format: 5511999999999@s.whatsapp.net or 5511999999999:123@lid
              const rawId = String(participant.id);
              // Remove everything after : or @
              phone = rawId.split('@')[0].split(':')[0].replace(/\D/g, '');
            }
            
            // Log first participant for debugging
            if (participants.indexOf(participant) === 0) {
              console.log('First participant raw data:', JSON.stringify(participant));
              console.log('Extracted phone:', phone);
            }
            
            // Skip invalid numbers - must be at least 10 digits (DDD + number)
            // and not contain group markers like "-"
            if (!phone || phone.length < 10 || phone.length > 15) {
              console.log(`Skipping invalid phone: ${phone}`);
              continue;
            }

            allParticipants.push({
              phone,
              name: `Contato ${phone.slice(-4)}`, // Default name with last 4 digits
              groupId: groupJid,
              groupName,
            });
          }

          console.log(`Found ${allParticipants.length} valid participants in group ${groupName}`);
        } catch (error) {
          console.error(`Error processing group ${groupJid}:`, error);
        }
      }

      // Remove duplicates based on phone number
      const uniqueParticipants = Array.from(
        new Map(allParticipants.map(p => [p.phone, p])).values()
      );

      console.log(`Total unique participants: ${uniqueParticipants.length}`);

      return new Response(
        JSON.stringify({ participants: uniqueParticipants }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Ação não reconhecida' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in whatsapp-groups function:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
