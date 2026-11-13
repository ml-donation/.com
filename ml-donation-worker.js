/**
 * ML Donation API — Cloudflare Worker + JSONBin
 * Keep JSONBIN_MASTER_KEY, ADMIN_PASSWORD and SESSION_SECRET in Worker secrets.
 * Never put those secrets in either HTML file.
 */
const JSONBIN = "https://api.jsonbin.io/v3/b";
const encoder = new TextEncoder();

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map(x => x.trim());
  const allow = allowed.includes("*") ? "*" : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), {status, headers:{"Content-Type":"application/json; charset=utf-8", ...headers}});
}
function b64url(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(s) {
  s = s.replace(/-/g,"+").replace(/_/g,"/");
  while (s.length % 4) s += "=";
  const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function sha(text) {
  const out = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return b64url(new Uint8Array(out));
}
async function sign(payload, secret) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return body + "." + b64url(new Uint8Array(sig));
}
async function authToken(request, env, role) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i,"");
  if (!token || !env.SESSION_SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  const ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), encoder.encode(body));
  if (!ok) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(fromB64url(body))); } catch { return null; }
  if (p.exp < Date.now() || (role && p.role !== role)) return null;
  return p;
}
async function readDB(env) {
  if (!env.JSONBIN_BIN_ID || !env.JSONBIN_MASTER_KEY) throw new Error("JSONBin Worker secrets are not configured.");
  const r = await fetch(`${JSONBIN}/${env.JSONBIN_BIN_ID}/latest`, {headers:{"X-Master-Key":env.JSONBIN_MASTER_KEY}});
  if (!r.ok) throw new Error(`JSONBin read failed (${r.status}).`);
  const j = await r.json();
  return j.record || {};
}
async function writeDB(env, db) {
  const r = await fetch(`${JSONBIN}/${env.JSONBIN_BIN_ID}`, {
    method:"PUT",
    headers:{"Content-Type":"application/json","X-Master-Key":env.JSONBIN_MASTER_KEY},
    body:JSON.stringify(db)
  });
  if (!r.ok) throw new Error(`JSONBin write failed (${r.status}).`);
  return true;
}
function safeMember(m) {
  const {passwordHash, ...safe} = m; return safe;
}
function uid(prefix="id") { return prefix + "_" + crypto.randomUUID().replace(/-/g,"").slice(0,18); }
function clean(v, max=3000) { return String(v ?? "").trim().slice(0,max); }
async function bodyOf(req) { try { return await req.json(); } catch { return {}; } }

export default {
 async fetch(request, env) {
  const origin = request.headers.get("Origin") || "";
  const headers = cors(origin, env);
  if (request.method === "OPTIONS") return new Response(null,{status:204,headers});
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/,"") || "/";
  try {
   if (path === "/api/health") return json({ok:true,service:"ML Donation API"},200,headers);

   if (path === "/api/public/settings" && request.method === "GET") {
    const db = await readDB(env);
    return json({settings:db.settings || {}},200,headers);
   }

   if (path === "/api/member/signup" && request.method === "POST") {
    const b = await bodyOf(request), name=clean(b.name,120), email=clean(b.email,180).toLowerCase(), password=String(b.password||"");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) return json({error:"Enter a valid name, email and password (minimum 6 characters)."},400,headers);
    const db=await readDB(env); db.members ||= [];
    if (db.members.some(m=>m.email===email)) return json({error:"An account with this email already exists."},409,headers);
    const member={id:uid("mem"),name,email,gender:clean(b.gender,40),country:clean(b.country,100),passwordHash:await sha(password),status:"Active",createdAt:new Date().toISOString(),points:0,tier:0,donations:0,messages:[],requests:[]};
    db.members.unshift(member); db.auditLog ||= []; db.auditLog.unshift({id:uid("log"),event:"member_signup",memberId:member.id,at:new Date().toISOString()});
    await writeDB(env,db);
    const token=await sign({role:"member",sub:member.id,exp:Date.now()+1000*60*60*24*14},env.SESSION_SECRET);
    return json({token,member:safeMember(member)},201,headers);
   }

   if (path === "/api/member/login" && request.method === "POST") {
    const b=await bodyOf(request),email=clean(b.email,180).toLowerCase(),password=String(b.password||"");
    const db=await readDB(env),member=(db.members||[]).find(m=>m.email===email);
    if (!member || member.passwordHash !== await sha(password)) return json({error:"Email or password is incorrect."},401,headers);
    if (member.status==="Suspended" || member.status==="Deleted") return json({error:"This account is currently unavailable. Contact support."},403,headers);
    const token=await sign({role:"member",sub:member.id,exp:Date.now()+1000*60*60*24*14},env.SESSION_SECRET);
    return json({token,member:safeMember(member)},200,headers);
   }

   if (path === "/api/member/data" && request.method === "GET") {
    const session=await authToken(request,env,"member"); if(!session)return json({error:"Session expired. Please sign in again."},401,headers);
    const db=await readDB(env),member=(db.members||[]).find(m=>m.id===session.sub);
    if(!member)return json({error:"Member account not found."},404,headers);
    return json({member:safeMember(member),messages:(db.messages||[]).filter(m=>m.memberId===member.id),requests:(db.donationRequests||[]).filter(r=>r.memberId===member.id),settings:db.settings||{}},200,headers);
   }

   if (path === "/api/member/action" && request.method === "POST") {
    const session=await authToken(request,env,"member"); if(!session)return json({error:"Session expired. Please sign in again."},401,headers);
    const b=await bodyOf(request),db=await readDB(env),member=(db.members||[]).find(m=>m.id===session.sub);
    if(!member)return json({error:"Member not found."},404,headers);
    db.donationRequests ||= []; db.paymentProofs ||= []; db.suggestions ||= []; db.messages ||= [];
    const now=new Date().toISOString();
    if(b.type==="donation_request"){
      const item={id:uid("req"),memberId:member.id,memberName:member.name,email:member.email,amount:clean(b.amount,40),method:clean(b.method,60),asset:clean(b.asset,80),status:"Pending",createdAt:now,details:""};
      db.donationRequests.unshift(item); await writeDB(env,db); return json({ok:true,request:item},201,headers);
    }
    if(b.type==="payment_proof"){
      const photo=String(b.photoData||"");
      const match=photo.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if(!match)return json({error:"A valid image proof is required."},400,headers);
      const raw=match[1], padding=(raw.endsWith("==")?2:(raw.endsWith("=")?1:0));
      const size=Math.floor(raw.length*3/4)-padding;
      if(size>51200)return json({error:"Image must be 50 KB or smaller."},413,headers);
      if(!env.PROOFS_BUCKET)return json({error:"Receipt image storage is not configured. Bind the Cloudflare R2 bucket named PROOFS_BUCKET."},503,headers);
      const itemId=uid("proof"),photoKey=`ml-donation-proofs/${member.id}/${itemId}.jpg`;
      const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
      await env.PROOFS_BUCKET.put(photoKey,bytes,{httpMetadata:{contentType:"image/jpeg"}});
      const item={id:itemId,memberId:member.id,memberName:member.name,email:member.email,requestId:clean(b.requestId,80),type:clean(b.method,80),amount:clean(b.amount,40),fileName:clean(b.fileName,160),mimeType:"image/jpeg",photoKey,status:"Pending",createdAt:now};
      db.paymentProofs.unshift(item); await writeDB(env,db); return json({ok:true,proofId:item.id},201,headers);
    }
    if(b.type==="suggestion"){
      const item={id:uid("sug"),memberId:member.id,memberName:member.name,email:member.email,subject:clean(b.subject||"Member suggestion",160),message:clean(b.message,3000),status:"New",createdAt:now};
      if(!item.message)return json({error:"Write your suggestion first."},400,headers);
      db.suggestions.unshift(item); await writeDB(env,db); return json({ok:true},201,headers);
    }
    if(b.type==="mark_read"){
      for(const m of (db.messages||[]))if(m.memberId===member.id)m.read=true;
      await writeDB(env,db); return json({ok:true},200,headers);
    }
    if(b.type==="change_password"){
      const oldHash=await sha(String(b.currentPassword||""));
      if(member.passwordHash!==oldHash)return json({error:"Current password is incorrect."},400,headers);
      const next=String(b.newPassword||"");if(next.length<8)return json({error:"Use at least 8 characters for your new password."},400,headers);
      member.passwordHash=await sha(next);await writeDB(env,db);return json({ok:true},200,headers);
    }
    return json({error:"Unknown member action."},400,headers);
   }

   if (path === "/api/admin/login" && request.method === "POST") {
    const b=await bodyOf(request);
    if(!env.ADMIN_PASSWORD || String(b.password||"")!==env.ADMIN_PASSWORD)return json({error:"Incorrect admin password."},401,headers);
    const token=await sign({role:"admin",sub:"admin",exp:Date.now()+1000*60*60*8},env.SESSION_SECRET);
    return json({token},200,headers);
   }

   if (path === "/api/admin/data" && request.method === "GET") {
    const session=await authToken(request,env,"admin");if(!session)return json({error:"Admin session expired. Sign in again."},401,headers);
    const db=await readDB(env);
    return json({members:(db.members||[]).map(safeMember),donationRequests:db.donationRequests||[],paymentProofs:(db.paymentProofs||[]).map(({photoData,...p})=>({...p,photoData})),suggestions:db.suggestions||[],messages:db.messages||[],settings:db.settings||{},auditLog:(db.auditLog||[]).slice(0,100)},200,headers);
   }

   if (path === "/api/admin/proof-image" && request.method === "GET") {
    const session=await authToken(request,env,"admin");if(!session)return json({error:"Admin session expired. Sign in again."},401,headers);
    const id=url.searchParams.get("id")||"",db=await readDB(env),proof=(db.paymentProofs||[]).find(x=>x.id===id);
    if(!proof || !proof.photoKey || !env.PROOFS_BUCKET)return json({error:"Proof image not found."},404,headers);
    const obj=await env.PROOFS_BUCKET.get(proof.photoKey);if(!obj)return json({error:"Proof image file is missing."},404,headers);
    const bytes=new Uint8Array(await obj.arrayBuffer());let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return json({photoData:"data:image/jpeg;base64,"+btoa(binary)},200,headers);
   }

   if (path === "/api/admin/action" && request.method === "POST") {
    const session=await authToken(request,env,"admin");if(!session)return json({error:"Admin session expired. Sign in again."},401,headers);
    const b=await bodyOf(request),db=await readDB(env);db.members||=[];db.donationRequests||=[];db.paymentProofs||=[];db.suggestions||=[];db.messages||=[];db.auditLog||=[];
    const now=new Date().toISOString();
    if(b.type==="send_message"){
      const member=db.members.find(m=>m.id===b.memberId);
      if(!member)return json({error:"Select a valid member."},404,headers);
      const msg={id:uid("msg"),memberId:member.id,memberName:member.name,email:member.email,subject:clean(b.subject,180),body:clean(b.body,4000),read:false,createdAt:now};
      if(!msg.subject||!msg.body)return json({error:"Subject and message are required."},400,headers);
      db.messages.unshift(msg);db.auditLog.unshift({event:"message_sent",memberId:member.id,at:now});await writeDB(env,db);return json({ok:true,message:msg},201,headers);
    }
    if(b.type==="update_request"){
      const req=db.donationRequests.find(x=>x.id===b.id);if(!req)return json({error:"Request not found."},404,headers);
      req.details=clean(b.details,3000);req.status=clean(b.status||"Details sent",60);
      const bodyText=req.details?`Your ${req.method} donation request for ${req.amount} has been updated.\n\nPayment details:\n${req.details}`:`Your donation request status is now ${req.status}.`;
      db.messages.unshift({id:uid("msg"),memberId:req.memberId,memberName:req.memberName,email:req.email,subject:"Donation request update",body:bodyText,read:false,createdAt:now});
      db.auditLog.unshift({event:"request_updated",requestId:req.id,at:now});await writeDB(env,db);return json({ok:true},200,headers);
    }
    if(b.type==="update_proof"){
      const proof=db.paymentProofs.find(x=>x.id===b.id);if(!proof)return json({error:"Proof not found."},404,headers);
      proof.status=clean(b.status,40)||"Reviewed";proof.adminNote=clean(b.note,1000);proof.reviewedAt=now;
      if(proof.status==="Approved"){
        const member=db.members.find(m=>m.id===proof.memberId);
        if(member && !proof.pointsAwarded){member.donations=(member.donations||0)+1;const tiers=[50,25,10,0];let t=member.tier||0;if(t<3){member.points=(member.points||0)+tiers[t];if(member.points>=100){member.tier=t+1;member.points=member.tier===3?100:0;}}proof.pointsAwarded=true;}
      }
      db.messages.unshift({id:uid("msg"),memberId:proof.memberId,memberName:proof.memberName,email:proof.email,subject:"Payment proof "+proof.status.toLowerCase(),body:`Your submitted payment proof (${proof.type}, ${proof.amount}) has been ${proof.status.toLowerCase()}.${proof.adminNote?" Admin note: "+proof.adminNote:""}`,read:false,createdAt:now});
      db.auditLog.unshift({event:"proof_"+proof.status.toLowerCase(),proofId:proof.id,at:now});await writeDB(env,db);return json({ok:true},200,headers);
    }
    if(b.type==="update_member"){
      const m=db.members.find(x=>x.id===b.id);if(!m)return json({error:"Member not found."},404,headers);
      m.status=clean(b.status,40)||m.status;db.auditLog.unshift({event:"member_status",memberId:m.id,status:m.status,at:now});await writeDB(env,db);return json({ok:true},200,headers);
    }
    if(b.type==="delete_record"){
      const map={proof:"paymentProofs",request:"donationRequests",suggestion:"suggestions"};
      const arr=db[map[b.kind]];if(!arr)return json({error:"Invalid record type."},400,headers);
      const old=arr.find(x=>x.id===b.id);
      if(b.kind==="proof" && old?.photoKey && env.PROOFS_BUCKET) await env.PROOFS_BUCKET.delete(old.photoKey);
      db[map[b.kind]]=arr.filter(x=>x.id!==b.id);await writeDB(env,db);return json({ok:true},200,headers);
    }
    if(b.type==="update_settings"){
      db.settings={...(db.settings||{}),...(b.settings||{})};await writeDB(env,db);return json({ok:true},200,headers);
    }
    return json({error:"Unknown admin action."},400,headers);
   }
   return json({error:"Not found."},404,headers);
  } catch(e) {
   return json({error:e.message||"Server error."},500,headers);
  }
 }
};
