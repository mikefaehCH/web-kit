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
  // Restrict to one fixed group. The client cannot select recipients.
  try{
    const upstream=await fetch(host+"/waInstance"+encodeURIComponent(instance)+"/sendMessage/"+encodeURIComponent(apiToken),{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chatId:GROUP_ID,message:message.trim()}),
      signal:AbortSignal.timeout(12000)
    });
    if(!upstream.ok)return json({error:"Messaging provider rejected request"},502);
    const result=await upstream.json().catch(()=>null);
    if(!result||!result.idMessage)return json({error:"Provider did not confirm message"},502);
    return json({ok:true,idMessage:result.idMessage});
  }catch{return json({error:"Messaging provider unavailable"},502);}
});
