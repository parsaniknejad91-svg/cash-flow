// v0.5.1: remove Service Worker/cache left by old GitHub preview versions.
(async function removeLegacyCaches(){
  try{
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if ("caches" in window){
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.toLowerCase().includes("cash-flow")).map(k => caches.delete(k)));
    }
  }catch(e){
    console.warn("Legacy cache cleanup:", e);
  }
})();

const cfg=window.CASHFLOW_CONFIG;
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const currencies={IRR:{label:"ریال",digits:0},USD:{label:"دلار",digits:2},AED:{label:"درهم",digits:2},EUR:{label:"یورو",digits:2},CNY:{label:"یوان",digits:2}};
let currentAuthUser=null,currentProfile=null,transactions=[],profiles=[],activeTypeFilter="all",activeHeroCurrency="IRR";
const $=id=>document.getElementById(id);
const authView=$("authView"),mainView=$("mainView"),loginForm=$("loginForm"),authError=$("authError"),loginUsername=$("loginUsername"),loginPassword=$("loginPassword"),currentUserBadge=$("currentUserBadge"),connectionBadge=$("connectionBadge"),usersBtn=$("usersBtn"),backupBtn=$("backupBtn"),refreshBtn=$("refreshBtn"),logoutBtn=$("logoutBtn"),currencyTabs=$("currencyTabs"),currencyMiniCards=$("currencyMiniCards"),heroNet=$("heroNet"),heroIn=$("heroIn"),heroOut=$("heroOut"),heroCurrency=$("heroCurrency"),heroCount=$("heroCount"),transactionDialog=$("transactionDialog"),openTransactionModal=$("openTransactionModal"),closeTransactionDialog=$("closeTransactionDialog"),transactionDialogTitle=$("transactionDialogTitle"),transactionForm=$("transactionForm"),editingId=$("editingId"),txType=$("txType"),txName=$("txName"),txAmount=$("txAmount"),txCurrency=$("txCurrency"),txDate=$("txDate"),saveTxBtn=$("saveTxBtn"),cancelEditBtn=$("cancelEditBtn"),searchFilter=$("searchFilter"),currencyFilter=$("currencyFilter"),fromDate=$("fromDate"),toDate=$("toDate"),clearFilters=$("clearFilters"),filteredTotals=$("filteredTotals"),transactionsBody=$("transactionsBody"),emptyState=$("emptyState"),usersDialog=$("usersDialog"),closeUsersDialog=$("closeUsersDialog"),usersList=$("usersList");
function esc(s=""){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function digitsEn(s=""){return String(s).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d))}
function parseAmount(v){const n=Number(digitsEn(v).replace(/[,\s٬]/g,""));return Number.isFinite(n)?n:NaN}
function formatAmount(n,cur){return Number(n||0).toLocaleString("en-US",{maximumFractionDigits:currencies[cur]?.digits??2})}
function normalizeDate(v){const s=digitsEn(v).trim().replace(/[-.]/g,"/"),m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);if(!m)return null;const mm=String(+m[2]).padStart(2,"0"),dd=String(+m[3]).padStart(2,"0");if(+mm<1||+mm>12||+dd<1||+dd>31)return null;return `${m[1]}/${mm}/${dd}`}
function todayJalali(){try{const p=new Intl.DateTimeFormat("en-US-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${o.year}/${o.month}/${o.day}`}catch{return ""}}
function profileById(id){return profiles.find(p=>p.id===id)}
function totalsFor(list){const out={};Object.keys(currencies).forEach(c=>out[c]={in:0,out:0,net:0,count:0});list.forEach(t=>{if(out[t.currency]){out[t.currency][t.transaction_type]+=Number(t.amount)||0;out[t.currency].count++}});Object.keys(out).forEach(c=>out[c].net=out[c].in-out[c].out);return out}
function setOnline(ok){connectionBadge.textContent=ok?"● Online":"● Offline";connectionBadge.style.color=ok?"#9be8c5":"#ffb3b3"}
async function loadProfile(){const {data,error}=await sb.from("profiles").select("*").eq("id",currentAuthUser.id).single();if(error)throw error;currentProfile=data}
async function loadProfiles(){const {data,error}=await sb.from("profiles").select("*").order("created_at",{ascending:true});if(error)throw error;profiles=data||[]}
async function loadTransactions(){const {data,error}=await sb.from("transactions").select("*").order("transaction_date",{ascending:false}).order("created_at",{ascending:false});if(error)throw error;transactions=data||[]}
async function refreshAll(){try{await Promise.all([loadProfiles(),loadTransactions()]);setOnline(true);renderAll()}catch(e){console.error(e);setOnline(false);alert("خطا در دریافت اطلاعات از Supabase: "+(e.message||e))}}
async function boot(){try{const {data:{session}}=await sb.auth.getSession();if(session?.user){currentAuthUser=session.user;await loadProfile();if(currentProfile.active){showMain();await refreshAll()}else{await sb.auth.signOut();showLogin()}}else showLogin()}catch(e){console.error(e);showLogin()}}
function showLogin(){authView.classList.remove("hidden");mainView.classList.add("hidden");authError.textContent=""}
function showMain(){authView.classList.add("hidden");mainView.classList.remove("hidden");currentUserBadge.textContent=`${currentProfile.full_name} · ${currentProfile.role==="admin"?"Admin":"User"}`;document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",currentProfile.role!=="admin"))}
loginForm.addEventListener("submit",async e=>{
  e.preventDefault();
  authError.textContent="در حال ورود...";

  const rawLogin=loginUsername.value.trim().toLowerCase();
  const email=rawLogin.includes("@") ? rawLogin : `${rawLogin}@cashflow.local`;

  const {data,error}=await sb.auth.signInWithPassword({
    email,
    password:loginPassword.value
  });

  if(error){
    console.error("Supabase login error:",error);
    const msg=(error.message||"").toLowerCase();

    if(msg.includes("email not confirmed")){
      authError.textContent="ایمیل این کاربر در Supabase تأیید نشده است.";
    }else if(msg.includes("invalid login credentials")){
      authError.textContent="نام کاربری/ایمیل یا رمز عبور صحیح نیست.";
    }else{
      authError.textContent=`خطای ورود Supabase: ${error.message}`;
    }
    return;
  }

  currentAuthUser=data.user;

  try{
    await loadProfile();

    if(!currentProfile.active){
      await sb.auth.signOut();
      authError.textContent="این کاربر غیرفعال است.";
      return;
    }

    showMain();
    await refreshAll();

  }catch(err){
    console.error(err);
    await sb.auth.signOut();
    authError.textContent="ورود انجام شد، اما پروفایل این کاربر در جدول profiles ثبت نشده است.";
  }
});

logoutBtn.addEventListener("click",async()=>{await sb.auth.signOut();currentAuthUser=null;currentProfile=null;transactions=[];profiles=[];showLogin()});
refreshBtn.addEventListener("click",refreshAll);
function renderAll(){renderOverview();renderTransactions();renderFilteredTotals()}
function renderOverview(){const totals=totalsFor(transactions);currencyTabs.innerHTML=Object.keys(currencies).map(code=>`<button data-currency="${code}" class="${code===activeHeroCurrency?"active":""}">${code}</button>`).join("");currencyTabs.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{activeHeroCurrency=b.dataset.currency;renderOverview()}));const t=totals[activeHeroCurrency];heroNet.textContent=`${t.net>0?"+ ":""}${formatAmount(t.net,activeHeroCurrency)}`;heroNet.style.color=t.net<0?"#c94c52":t.net>0?"#16865f":"#12233f";heroIn.textContent=`+ ${formatAmount(t.in,activeHeroCurrency)}`;heroOut.textContent=`- ${formatAmount(t.out,activeHeroCurrency)}`;heroCurrency.textContent=currencies[activeHeroCurrency].label;heroCount.textContent=String(t.count);currencyMiniCards.innerHTML=Object.entries(currencies).map(([code,c])=>{const x=totals[code];return `<div class="currency-mini ${code===activeHeroCurrency?"active":""}" data-mini-currency="${code}"><div class="top"><strong>${c.label}</strong><span>${code}</span></div><div class="mini-net ${x.net>0?"pos":x.net<0?"neg":""}">${x.net>0?"+ ":""}${formatAmount(x.net,code)}</div></div>`}).join("");currencyMiniCards.querySelectorAll("[data-mini-currency]").forEach(el=>el.addEventListener("click",()=>{activeHeroCurrency=el.dataset.miniCurrency;renderOverview()}))}
function setEntryType(type){txType.value=type;document.querySelectorAll("[data-entry-type]").forEach(btn=>btn.classList.toggle("active",btn.dataset.entryType===type));saveTxBtn.textContent=editingId.value?"ذخیره تغییرات":type==="in"?"ثبت دریافتی":"ثبت پرداختی"}
document.querySelectorAll("[data-entry-type]").forEach(btn=>btn.addEventListener("click",()=>setEntryType(btn.dataset.entryType)));
function resetForm(close=true){editingId.value="";txName.value="";txAmount.value="";txCurrency.value="IRR";txDate.value=todayJalali();transactionDialogTitle.textContent="ثبت تراکنش جدید";setEntryType("in");if(close&&transactionDialog.open)transactionDialog.close()}
openTransactionModal.addEventListener("click",()=>{resetForm(false);transactionDialog.showModal();setTimeout(()=>txName.focus(),50)});closeTransactionDialog.addEventListener("click",()=>transactionDialog.close());cancelEditBtn.addEventListener("click",()=>resetForm(true));
txAmount.addEventListener("input",e=>{const raw=digitsEn(e.target.value).replace(/[^\d.]/g,""),[a,b]=raw.split(".");if(!a){e.target.value="";return}e.target.value=Number(a).toLocaleString("en-US")+(b!==undefined?"."+b.slice(0,2):"")});
transactionForm.addEventListener("submit",async e=>{e.preventDefault();const name=txName.value.trim(),amount=parseAmount(txAmount.value),date=normalizeDate(txDate.value);if(!name||!Number.isFinite(amount)||amount<=0||!date){alert("نام، مبلغ و تاریخ را صحیح وارد کنید. فرمت تاریخ: 1405/06/07");return}saveTxBtn.disabled=true;const payload={person_name:name,transaction_type:txType.value,amount,currency:txCurrency.value,transaction_date:date};const result=editingId.value?await sb.from("transactions").update(payload).eq("id",editingId.value):await sb.from("transactions").insert({...payload,created_by:currentAuthUser.id});saveTxBtn.disabled=false;if(result.error){console.error(result.error);alert("خطا در ذخیره تراکنش: "+result.error.message);setEntryType(txType.value);return}transactionDialog.close();resetForm(false);await refreshAll()});
function getFiltered(){const q=searchFilter.value.trim().toLowerCase(),cur=currencyFilter.value,f=normalizeDate(fromDate.value)||fromDate.value.trim(),to=normalizeDate(toDate.value)||toDate.value.trim();return transactions.filter(t=>{if(activeTypeFilter!=="all"&&t.transaction_type!==activeTypeFilter)return false;if(cur!=="all"&&t.currency!==cur)return false;if(q&&!t.person_name.toLowerCase().includes(q))return false;if(f&&t.transaction_date<f)return false;if(to&&t.transaction_date>to)return false;return true})}
function renderTransactions(){const list=getFiltered();transactionsBody.innerHTML=list.map(t=>{const p=profileById(t.created_by),isIn=t.transaction_type==="in";return `<tr><td><span class="type-pill ${isIn?"in":"out"}">${isIn?"دریافتی":"پرداختی"}</span></td><td class="tx-name">${esc(t.person_name)}</td><td class="tx-amount ${isIn?"in":"out"}">${isIn?"+":"-"} ${formatAmount(t.amount,t.currency)}</td><td class="tx-muted">${currencies[t.currency]?.label||t.currency}</td><td class="tx-muted">${esc(t.transaction_date)}</td><td class="tx-muted">${esc(p?.full_name||"—")}</td><td><div class="row-actions"><button data-edit="${t.id}">ویرایش</button><button class="delete" data-delete="${t.id}">حذف</button></div></td></tr>`}).join("");emptyState.classList.toggle("hidden",list.length>0);document.querySelector(".table-scroll").classList.toggle("hidden",list.length===0);transactionsBody.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editTx(b.dataset.edit)));transactionsBody.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteTx(b.dataset.delete)))}
function editTx(id){const t=transactions.find(x=>x.id===id);if(!t)return;editingId.value=t.id;txName.value=t.person_name;txAmount.value=formatAmount(t.amount,t.currency);txCurrency.value=t.currency;txDate.value=t.transaction_date;setEntryType(t.transaction_type);transactionDialogTitle.textContent="ویرایش تراکنش";transactionDialog.showModal()}
async function deleteTx(id){const t=transactions.find(x=>x.id===id);if(!t||!confirm(`تراکنش «${t.person_name}» حذف شود؟`))return;const {error}=await sb.from("transactions").delete().eq("id",id);if(error){alert("خطا در حذف: "+error.message);return}await refreshAll()}
function renderFilteredTotals(){const totals=totalsFor(getFiltered());filteredTotals.innerHTML=Object.keys(currencies).flatMap(code=>{const t=totals[code];if(!t.in&&!t.out)return [];return [`<span class="report-chip in">${currencies[code].label}: دریافتی ${formatAmount(t.in,code)}</span>`,`<span class="report-chip out">${currencies[code].label}: پرداختی ${formatAmount(t.out,code)}</span>`]}).join("")||`<span class="report-chip">موردی برای فیلتر فعلی نیست.</span>`}
document.querySelectorAll("#typeFilter button").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("#typeFilter button").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeTypeFilter=b.dataset.type;renderTransactions();renderFilteredTotals()}));[searchFilter,currencyFilter,fromDate,toDate].forEach(el=>el.addEventListener("input",()=>{renderTransactions();renderFilteredTotals()}));clearFilters.addEventListener("click",()=>{searchFilter.value="";currencyFilter.value="all";fromDate.value="";toDate.value="";activeTypeFilter="all";document.querySelectorAll("#typeFilter button").forEach((b,i)=>b.classList.toggle("active",i===0));renderTransactions();renderFilteredTotals()});
document.querySelectorAll("[data-scroll]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.getElementById(btn.dataset.scroll).scrollIntoView({behavior:"smooth",block:"start"})}));
backupBtn.addEventListener("click",()=>{const payload={version:"1.0.0",exportedAt:new Date().toISOString(),transactions,profiles:profiles.map(({id,username,full_name,role,active,created_at})=>({id,username,full_name,role,active,created_at}))};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`cash-flow-backup-${todayJalali().replaceAll("/","-")}.json`;a.click();URL.revokeObjectURL(a.href)});
usersBtn.addEventListener("click",()=>{usersList.innerHTML=profiles.map(p=>`<div class="user-row"><strong>${esc(p.full_name)}</strong><span>${esc(p.username)}</span><small>${p.role==="admin"?"Admin":"User"} · ${p.active?"فعال":"غیرفعال"}</small></div>`).join("");usersDialog.showModal()});closeUsersDialog.addEventListener("click",()=>usersDialog.close());
sb.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT"){currentAuthUser=null;currentProfile=null;showLogin()}});boot();
