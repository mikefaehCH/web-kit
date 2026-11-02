// Supabase Edge Function: manual WhatsApp sending, fail-closed.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const GROUP_ID="120363431174972238@g.us";
const MAX=4000;
const cors={"Access-Control-Allow-Origin":Deno.env.get("WEB_KIT_ADMIN_ORIGIN")||"https://mikefaehch.github.io","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{
  const origin=req.headers.get("origin");
  if(origin && origin!==cors["Access-Control-Allow-Origin"])return json({error:"Origin not allowed"},403);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return json({error:"Authentication required"},401);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
  if(!url||!anon)return json({error:"Server configuration incomplete"},503);
  const client=createClient(url,anon,{auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser(auth.slice(7));
  if(error||!user)return json({error:"Invalid session"},401);
  // Admin is granted by a trusted Auth app_metadata claim, never user_metadata.
  if(user.app_metadata?.web_kit_admin!==true)return json({error:"Admin access required"},403);
  const apiToken=Deno.env.get("GREEN_API_TOKEN");
  const instance=Deno.env.get("GREEN_API_INSTANCE_ID")||"710722787774";
  const host=Deno.env.get("GREEN_API_HOST")||"https://7107.api.greenapi.com";
  if(!apiToken||!instance||!host||!/^https:\/\/[a-z0-9.-]+$/.test(host))return json({error:"Messaging not configured"},503);
  let body:unknown;
  try{body=await req.json();}catch{return json({error:"Invalid JSON"},400);}
  const message=(body&&typeof body==="object"&&"message" in body)?(body as {message:unknown}).message:null;
  if(typeof message!=="string"||!message.trim()||message.length>MAX)return json({error:"Message must be 1–4000 characters"},400);
  const keyValue=(body&&typeof body==="object"&&"requestKey" in body)?(body as {requestKey:unknown}).requestKey:null;
  if(typeof keyValue!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(keyValue))return json({error:"Invalid request key"},400);
  const bytes=new TextEncoder().encode(message.trim());
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");
  const authClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const claim=await authClient.rpc("web_kit_whatsapp_claim",{p_actor:user.id,p_key:keyValue,p_hash:digest});
  if(claim.error)return json({error:"Dispatch control unavailable"},503);
  if(claim.data!==true)return json({error:"Duplicate request or rate limit exceeded"},429);
  const finish=async(status:string,providerId:string|null=null)=>{await authClient.rpc("web_kit_whatsapp_finish",{p_actor:user.id,p_key:keyValue,p_status:status,p_provider_id:providerId});};
  // Restrict to one fixed group. The client cannot select recipients.
  try{
    const upstream=await fetch(host+"/waInstance"+encodeURIComponent(instance)+"/sendMessage/"+encodeURIComponent(apiToken),{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chatId:GROUP_ID,message:message.trim()}),
      signal:AbortSignal.timeout(12000)
    });
    if(!upstream.ok){await finish("failed");return json({error:"Messaging provider rejected request"},502);}
    const result=await upstream.json().catch(()=>null);
    if(!result||!result.idMessage){await finish("failed");return json({error:"Provider did not confirm message"},502);}
    await finish("accepted",result.idMessage);
    return json({ok:true,idMessage:result.idMessage});
  }catch{return json({error:"Messaging provider unavailable; check dispatch audit before retrying"},502);}
});
