/* =========================================================================
   11b. OFFICIAL STATISTICS HUB  (injected by build/build_official.py)
   -------------------------------------------------------------------------
   Runs inside the app IIFE, so it reuses App, render, makeMock, startMock,
   lsGet/lsSet, BY_ID and the rich-text renderer. Everything here is keyed
   off window.officialStatsData and namespaced "os".
   - Book sets (pp. 1-329), Notes sets (topics 1-19), Full-form sets:
     40-50 MCQs each, explanation + exam shortcut after every answer.
   - Bullet Exam Pointers, Full-form list + flashcards, Read mode.
   - Mobile shell: bottom nav, "More" sheet, Android back button via the
     History API, swipe between questions, scroll management, text size.
   ========================================================================= */
var OSD = window.officialStatsData || {sets:[], questions:[], fullForms:[], pointers:[], noteTopics:[]};
var OS_Q = OSD.questions || [];
var OS_SETS = OSD.sets || [];
var OS_SET = {};
var OS_Q_BY_SET = {};
OS_SETS.forEach(function(s){ OS_SET[s.id] = s; OS_Q_BY_SET[s.id] = []; });
OS_Q.forEach(function(q){
  q.isOS = true;
  q.solution = [];
  q.tipsTricks = q.tipsTricks || [];
  BY_ID[q.id] = q;
  if(OS_Q_BY_SET[q.setId]) OS_Q_BY_SET[q.setId].push(q);
});
var OS_KIND_LABEL = {book:"Book", notes:"Notes", fullforms:"Full Forms"};
var OS_SEC_PER_Q = 60;
var OS_TABS = [
  ["overview","Overview"], ["book","Book 1-329"], ["notes","Notes 1-19"],
  ["ff","Full Forms"], ["pointers","Exam Pointers"]
];
App.osTab = "overview";
App.osReadSet = null;
App.osReadHide = false;
App.osNoteFilter = 0;
App.osFF = {mode:"list", q:"", cat:"all", order:null, idx:0, flipped:false, unknownOnly:false};
App.osPtr = {q:"", hyOnly:false, group:"all", open:{}};
App.osReturn = null;

/* ---------- progress ---------- */
function osProg(){ return lsGet("os_prog", {}); }
function osRecord(mock, result){
  var p = osProg();
  var cur = p[mock.osSetId] || {best:0, total:result.total, attempts:0};
  cur.attempts++;
  cur.total = result.total;
  cur.last = result.correct;
  cur.lastAt = Date.now();
  if(result.correct > cur.best) cur.best = result.correct;
  p[mock.osSetId] = cur;
  lsSet("os_prog", p);
}
function osSetPct(sid){
  var p = osProg()[sid];
  return p && p.total ? Math.round(p.best/p.total*100) : null;
}
function osBankStats(){
  var stats = lsGet("stats", {});
  var att = 0, cor = 0, seen = 0, byTopic = {};
  OS_Q.forEach(function(q){
    var s = stats[q.id]; if(!s) return;
    seen++; att += s.attempts; cor += s.correct;
    var t = byTopic[q.topic] || (byTopic[q.topic] = {a:0, c:0});
    t.a += s.attempts; t.c += s.correct;
  });
  return {attempts:att, correct:cor, seen:seen, byTopic:byTopic};
}
function osWeakTopics(limit){
  var bt = osBankStats().byTopic;
  return Object.keys(bt).filter(function(k){ return bt[k].a >= 3; })
    .map(function(k){ return {topic:k, acc: bt[k].c/bt[k].a*100, a: bt[k].a}; })
    .sort(function(a,b){ return a.acc-b.acc; }).slice(0, limit);
}

/* ---------- mock builders ---------- */
function osStartSet(sid, mode){
  var s = OS_SET[sid]; if(!s) return;
  var qs = OS_Q_BY_SET[sid].slice();
  var timed = mode === "strict";
  var label = OS_KIND_LABEL[s.kind]+" "+s.id+" · "+s.title;
  var m = makeMock(label, timed ? "strict" : "learning", qs, timed ? qs.length*OS_SEC_PER_Q : null,
                   {randomizeOptions: false});
  m.osSetId = sid;
  lsSet("os_last", sid);
  App.osReturn = {tab: App.view === "osHub" ? App.osTab : (s.kind==="book"?"book":s.kind==="notes"?"notes":"ff")};
  startMock(m);
}
function osStartPool(title, qs, mode){
  if(!qs.length){ toast("No questions available yet."); return; }
  App.osReturn = {tab: App.view === "osHub" ? App.osTab : "overview"};
  var timed = mode === "strict";
  startMock(makeMock(title, timed ? "strict" : "learning", qs, timed ? qs.length*OS_SEC_PER_Q : null));
}
function osNoteQs(no){ return OS_Q.filter(function(q){ return q.kind==="notes" && q.noteNo===no; }); }

/* ---------- small render helpers ---------- */
function osEsc(s){ return escapeHtmlPlain(s == null ? "" : String(s)); }
function osMetaBadges(q, compact){
  var s = OS_SET[q.setId];
  var b = badge(OS_KIND_LABEL[q.kind]+" "+q.setId, "badge-unit-os");
  if(!compact) b += badge(q.topic);
  else b += badge(q.topic.length > 38 ? q.topic.slice(0,36)+"…" : q.topic);
  if(q.questionType && q.questionType !== "Factual") b += badge(q.questionType);
  return b;
}
function osBanner(q){
  return '<div class="os-qbanner"><span>🏛️ Official Statistics</span><span class="os-qsrc">'+osEsc(q.source)+'</span></div>';
}
function osExplainBlock(q){
  if(!q.explanation) return "";
  return '<div class="reveal-block os-explain"><h4>Explanation</h4>'+renderRich(q.explanation)+'</div>';
}
function osBookmarkLabel(q){
  return '<div class="h-title">'+osEsc(q.setId)+' · '+osEsc(q.question.replace(/\*\*/g,"").slice(0,90))+(q.question.length>90?"…":"")+'</div>'
    + '<div class="h-meta">Official Statistics · '+osEsc(q.topic)+'</div>';
}
function osBar(pct){
  return '<div class="os-bar"><div style="width:'+Math.max(0,Math.min(100,pct||0))+'%"></div></div>';
}
function osTabsHtml(){
  return '<div class="os-tabs" role="tablist">' + OS_TABS.map(function(t){
    var on = App.osTab === t[0];
    return '<button class="os-tab'+(on?' active':'')+'" role="tab" aria-selected="'+on+'" data-action="os-tab" data-tab="'+t[0]+'">'+t[1]+'</button>';
  }).join("") + '</div>';
}

/* ---------- views ---------- */
function osViewHub(){
  var body;
  switch(App.osTab){
    case "book": body = osViewSets("book"); break;
    case "notes": body = osViewNotes(); break;
    case "ff": body = osViewFullForms(); break;
    case "pointers": body = osViewPointers(); break;
    default: body = osViewOverview();
  }
  return '<div class="os-hub">'+osTabsHtml()+'<div class="os-tabbody">'+body+'</div></div>';
}

function osCounts(){
  var c = {book:0, notes:0, fullforms:0, bookSets:0, notesSets:0, ffSets:0};
  OS_SETS.forEach(function(s){
    c[s.kind] += s.count;
    if(s.kind==="book") c.bookSets++; else if(s.kind==="notes") c.notesSets++; else c.ffSets++;
  });
  return c;
}

function osViewOverview(){
  var c = osCounts();
  var prog = osProg();
  var done = OS_SETS.filter(function(s){ return prog[s.id]; }).length;
  var st = osBankStats();
  var acc = st.attempts ? Math.round(st.correct/st.attempts*100) : 0;
  var cover = OS_Q.length ? Math.round(st.seen/OS_Q.length*100) : 0;
  var last = lsGet("os_last", null);
  var lastSet = last && OS_SET[last];
  var ptrDone = lsGet("os_ptr_done", {});
  var ptrTotal = (OSD.pointers||[]).length;
  var ptrCount = (OSD.pointers||[]).filter(function(p){ return ptrDone[p.id]; }).length;
  var pyq = ALL_Q.filter(function(q){ return q.unit==="Official Statistics"; }).length;
  var mistakes = lsGet("mistakes", []).filter(function(id){ return BY_ID[id] && BY_ID[id].isOS; }).length;
  var weak = osWeakTopics(4);
  var nextSet = OS_SETS.filter(function(s){ return !prog[s.id]; })[0];

  return ''
  + '<div class="os-hero">'
  +   '<div class="os-hero-kicker">UPSC ISS · Paper II · Unit III</div>'
  +   '<h1>Official Statistics</h1>'
  +   '<p>Book pp. 1-329, topic notes 1-19 and the full-form list, turned into '+OS_SETS.length+' practice sets with an explanation and exam shortcut for every answer. Bullet pointers are there for quick revision.</p>'
  +   '<div class="os-hero-stats">'
  +     '<div><b>'+OS_Q.length+'</b><span>MCQs</span></div>'
  +     '<div><b>'+OS_SETS.length+'</b><span>Sets</span></div>'
  +     '<div><b>'+(OSD.fullForms||[]).length+'</b><span>Full forms</span></div>'
  +     '<div><b>'+(OSD.pointers||[]).reduce(function(a,p){ return a+p.sections.reduce(function(x,s){return x+s.items.length;},0); },0)+'</b><span>Pointers</span></div>'
  +   '</div>'
  + '</div>'
  + (lastSet || nextSet ? (
      '<div class="card os-continue">'
    +   '<div class="os-continue-main"><div class="faint">'+(lastSet?"Continue where you left off":"Start here")+'</div>'
    +   '<div class="os-continue-title">'+osEsc(OS_KIND_LABEL[(lastSet||nextSet).kind]+" "+(lastSet||nextSet).id+" · "+(lastSet||nextSet).title)+'</div></div>'
    +   '<button class="btn btn-primary" data-action="os-open-set" data-set="'+(lastSet||nextSet).id+'">Open</button>'
    + '</div>') : "")
  + '<div class="os-kpis">'
  +   osKpi(done+"/"+OS_SETS.length, "Sets attempted", OS_SETS.length ? done/OS_SETS.length*100 : 0)
  +   osKpi(cover+"%", "Bank covered", cover)
  +   osKpi(st.attempts ? acc+"%" : "–", "Accuracy", acc)
  +   osKpi(ptrCount+"/"+ptrTotal, "Pointer topics revised", ptrTotal ? ptrCount/ptrTotal*100 : 0)
  + '</div>'
  + '<div class="section-title">Practice</div>'
  + '<div class="os-grid">'
  +   osTile("📘", "Book sets · pp. 1-329", c.bookSets+" sets · "+c.book+" MCQs", "os-tab", 'data-tab="book"')
  +   osTile("🗂️", "Topic notes · 1-19", c.notesSets+" sets · "+c.notes+" MCQs", "os-tab", 'data-tab="notes"')
  +   osTile("🔤", "Full forms", (OSD.fullForms||[]).length+" abbreviations · "+c.ffSets+" quiz sets", "os-tab", 'data-tab="ff"')
  +   osTile("⚡", "Bullet exam pointers", ptrTotal+" topics for quick revision", "os-tab", 'data-tab="pointers"')
  +   osTile("🎲", "Mixed 50 · random", "Draws from all "+OS_Q.length+" MCQs, with explanations", "os-mixed", "")
  +   osTile("⏱️", "Mixed 50 · timed test", "50 min, UPSC marking (+2.5 / −0.83)", "os-mixed", 'data-mode="strict"')
  +   (pyq ? osTile("🏆", "Official Statistics PYQs", pyq+" authentic PYQs, 2018-2026", "os-pyq", "") : "")
  +   osTile("✖️", "My Official Statistics mistakes", mistakes+" question(s) to fix", "os-mistakes", "")
  + '</div>'
  + (weak.length ? (
      '<div class="section-title">Weakest topics</div><div class="card">'
    + weak.map(function(w){ return '<div class="perf-bar-row"><div class="label">'+osEsc(w.topic)+'</div><div class="perf-bar-track"><div class="perf-bar-fill" style="width:'+Math.round(w.acc)+'%"></div></div><div class="val">'+Math.round(w.acc)+'%</div></div>'; }).join("")
    + '<div class="btn-row" style="margin-top:10px;"><button class="btn btn-primary" data-action="os-weak">Practise weak topics</button></div></div>'
    ) : "")
  + '<div class="section-title">Suggested routine</div>'
  + '<div class="card os-howto"><ol>'
  +   '<li><b>Revise</b>: read that topic\'s <b>Exam Pointers</b> first (5 minutes).</li>'
  +   '<li><b>Practise</b>: attempt the set in <b>Practice</b> mode. The explanation and exam shortcut open after each answer.</li>'
  +   '<li><b>Test</b>: re-take the set as a <b>Timed test</b> (1 min per question, −⅓ negative marking) until you score 90% or more.</li>'
  +   '<li><b>Fix</b>: clear <b>My mistakes</b> and use <b>Read mode</b> the night before the exam.</li>'
  + '</ol></div>';
}
function osKpi(val, label, pct){
  return '<div class="os-kpi"><b>'+val+'</b><span>'+label+'</span>'+osBar(pct)+'</div>';
}
function osTile(icon, title, sub, action, attrs){
  return '<button class="tile os-tile" data-action="'+action+'" '+attrs+'><span class="os-tile-icon">'+icon+'</span><span><span class="tile-title">'+title+'</span><span class="tile-sub">'+sub+'</span></span></button>';
}

function osSetCard(s){
  var p = osProg()[s.id];
  var pct = osSetPct(s.id);
  var status = p ? ('Best '+p.best+'/'+p.total+' ('+pct+'%) · '+p.attempts+' attempt'+(p.attempts>1?'s':'')) : 'Not attempted';
  var meta = [];
  if(s.pages) meta.push((s.kind==="book"?"pp. ":"")+s.pages);
  meta.push(s.count+" MCQs");
  return '<div class="os-set'+(pct!=null && pct>=90?' mastered':'')+'" id="os-set-'+s.id+'">'
    + '<div class="os-set-head" data-action="os-open-set" data-set="'+s.id+'">'
    +   '<div class="os-set-id">'+osEsc(s.id)+'</div>'
    +   '<div class="os-set-main"><div class="os-set-title">'+osEsc(s.title)+'</div>'
    +   '<div class="os-set-meta">'+osEsc(meta.join(" · "))+'</div></div>'
    + '</div>'
    + (s.topics && s.topics.length ? '<div class="os-set-topics">'+s.topics.slice(0,6).map(function(t){ return '<span>'+osEsc(t)+'</span>'; }).join("")+(s.topics.length>6?'<span>+'+(s.topics.length-6)+' more</span>':'')+'</div>' : "")
    + '<div class="os-set-status">'+osBar(pct||0)+'<span>'+status+'</span></div>'
    + '<div class="os-set-actions">'
    +   '<button class="btn btn-primary" data-action="os-start" data-set="'+s.id+'" data-mode="learning">Practice</button>'
    +   '<button class="btn" data-action="os-start" data-set="'+s.id+'" data-mode="strict">Timed test</button>'
    +   '<button class="btn btn-ghost" data-action="os-read" data-set="'+s.id+'">Read</button>'
    + '</div>'
    + '</div>';
}

function osViewSets(kind){
  var sets = OS_SETS.filter(function(s){ return s.kind===kind; });
  var total = sets.reduce(function(a,s){ return a+s.count; },0);
  var intro = kind==="book"
    ? 'The whole book (pp. 1-329) in page order: UN principles, the Indian statistical system and MoSPI, the NSC (Rangarajan) report, education indicators, PLFS, the NSO Vision 2019-24, the ASI manual and environmental accounts.'
    : '';
  if(!sets.length) return '<div class="card empty"><div class="big-icon">📘</div><h3>No sets yet</h3></div>';
  return '<div class="card os-intro"><h2>'+(kind==="book"?"Book sets · pp. 1-329":"Sets")+'</h2><p class="muted">'+intro+'</p>'
    + '<div class="os-intro-stats"><span><b>'+sets.length+'</b> sets</span><span><b>'+total+'</b> MCQs</span><span><b>'+OS_SEC_PER_Q+'s</b>/Q in a timed test</span></div></div>'
    + '<div class="os-sets">'+sets.map(osSetCard).join("")+'</div>';
}

function osViewNotes(){
  var sets = OS_SETS.filter(function(s){ return s.kind==="notes"; });
  var total = sets.reduce(function(a,s){ return a+s.count; },0);
  var f = App.osNoteFilter;
  var chips = '<div class="os-chips"><button class="chip'+(!f?' active':'')+'" data-action="os-note-filter" data-no="0">All topics</button>'
    + (OSD.noteTopics||[]).map(function(t){
        var n = osNoteQs(t.no).length;
        return '<button class="chip'+(f===t.no?' active':'')+'" data-action="os-note-filter" data-no="'+t.no+'">'+t.no+'. '+osEsc(t.title)+(n?' <small>'+n+'</small>':'')+'</button>';
      }).join("") + '</div>';
  var shown = f ? sets.filter(function(s){ return s.notes.indexOf(f)!==-1; }) : sets;
  var topicPanel = "";
  if(f){
    var t = (OSD.noteTopics||[]).filter(function(x){ return x.no===f; })[0];
    var n = osNoteQs(f).length;
    topicPanel = '<div class="card os-topic-panel"><div><div class="faint">Topic '+f+' · '+(t?t.pages:"?")+' pages of notes</div><h3>'+osEsc(t?t.title:"")+'</h3><div class="muted">'+n+' MCQs from this topic</div></div>'
      + '<div class="btn-row"><button class="btn btn-primary" data-action="os-note-practice" data-no="'+f+'" data-mode="learning">Practise topic '+f+'</button>'
      + '<button class="btn" data-action="os-note-practice" data-no="'+f+'" data-mode="strict">Timed</button>'
      + '<button class="btn btn-ghost" data-action="os-ptr-jump" data-id="notes-'+(f<10?"0":"")+f+'">Pointers</button></div></div>';
  }
  return '<div class="card os-intro"><h2>Topic notes · 1-19</h2><p class="muted">All 19 topics from the notes: MoSPI, NSO, NSC, FOD, NSS rounds, ICT, agriculture, CPI/WPI, industry, labour, national accounts, SRS, vital statistics, NFHS, trade, PLFS, SDGs, the CoS Act and misc. statistics. Pick a topic to practise only that topic, or take the full 40-50 question sets.</p>'
    + '<div class="os-intro-stats"><span><b>'+sets.length+'</b> sets</span><span><b>'+total+'</b> MCQs</span><span><b>19</b> topics</span></div></div>'
    + chips + topicPanel
    + '<div class="os-sets">'+shown.map(osSetCard).join("")+'</div>';
}

/* ---------- Full forms ---------- */
function osFFList(){
  var st = App.osFF, q = st.q.trim().toLowerCase();
  var known = lsGet("os_ff_known", {});
  return (OSD.fullForms||[]).filter(function(f){
    if(st.cat !== "all" && f.cat !== st.cat) return false;
    if(st.unknownOnly && known[f.abbr]) return false;
    if(!q) return true;
    return (f.abbr+" "+f.full+" "+f.note).toLowerCase().indexOf(q) !== -1;
  });
}
function osViewFullForms(){
  var st = App.osFF;
  var cats = [];
  (OSD.fullForms||[]).forEach(function(f){ if(cats.indexOf(f.cat)===-1) cats.push(f.cat); });
  var modes = [["list","List"],["cards","Flashcards"],["quiz","Quiz sets"]];
  var seg = '<div class="os-seg">'+modes.map(function(m){ return '<button class="'+(st.mode===m[0]?'active':'')+'" data-action="os-ff-mode" data-mode="'+m[0]+'">'+m[1]+'</button>'; }).join("")+'</div>';
  var head = '<div class="card os-intro"><h2>Full forms</h2><p class="muted">The full list of '+(OSD.fullForms||[]).filter(function(f){return f.src==="pdf";}).length+' abbreviations, plus '+(OSD.fullForms||[]).filter(function(f){return f.src==="extra";}).length+' more taken from the book and notes. Each quiz question uses near-miss distractors.</p>'+seg+'</div>';
  if(st.mode === "quiz"){
    return head + '<div class="os-sets">'+OS_SETS.filter(function(s){ return s.kind==="fullforms"; }).map(osSetCard).join("")+'</div>';
  }
  var filters = '<div class="os-filterbar">'
    + '<input type="search" id="os-ff-q" placeholder="Search e.g. DGCI&S, labour, survey…" value="'+osEsc(st.q)+'" aria-label="Search full forms">'
    + '<select id="os-ff-cat" aria-label="Category"><option value="all">All categories</option>'+cats.map(function(c){ return '<option value="'+osEsc(c)+'"'+(st.cat===c?' selected':'')+'>'+osEsc(c)+'</option>'; }).join("")+'</select>'
    + '<label class="check-row os-inline"><input type="checkbox" id="os-ff-unknown"'+(st.unknownOnly?' checked':'')+'> Not-yet-known only</label>'
    + '</div>';
  var list = osFFList();
  if(st.mode === "cards") return head + filters + osFlashcard(list);
  var known = lsGet("os_ff_known", {});
  var rows = list.map(function(f){
    return '<div class="os-ff-row'+(known[f.abbr]?' known':'')+'">'
      + '<div class="os-ff-abbr">'+osEsc(f.abbr)+'</div>'
      + '<div class="os-ff-full">'+osEsc(f.full)+(f.note?'<div class="os-ff-note">'+osEsc(f.note)+'</div>':'')+'</div>'
      + '<button class="os-ff-known" data-action="os-ff-known" data-abbr="'+osEsc(f.abbr)+'" aria-label="Mark '+osEsc(f.abbr)+' as known">'+(known[f.abbr]?'✓':'○')+'</button>'
      + '</div>';
  }).join("");
  return head + filters + '<div class="card os-ff-list"><div class="faint" style="margin-bottom:6px;">'+list.length+' shown · '+Object.keys(known).length+' marked known</div>'+(rows || '<p class="muted">No matches.</p>')+'</div>';
}
function osFlashcard(list){
  var st = App.osFF;
  if(!list.length) return '<div class="card empty"><div class="big-icon">🎉</div><h3>No cards left in this filter</h3></div>';
  if(!st.order || st.order.length !== list.length) { st.order = list.map(function(_,i){return i;}); st.idx = 0; }
  if(st.idx >= list.length) st.idx = 0;
  var f = list[st.order[st.idx]];
  var known = lsGet("os_ff_known", {});
  return '<div class="os-flash-wrap">'
    + '<div class="os-flash-count">'+(st.idx+1)+' / '+list.length+'</div>'
    + '<button class="os-flash'+(st.flipped?' flipped':'')+'" data-action="os-ff-flip" aria-label="Flip card">'
    +   '<span class="os-flash-front">'+osEsc(f.abbr)+'<small>Tap to reveal</small></span>'
    +   '<span class="os-flash-back"><b>'+osEsc(f.full)+'</b>'+(f.note?'<small>'+osEsc(f.note)+'</small>':'')+'<em>'+osEsc(f.cat)+'</em></span>'
    + '</button>'
    + '<div class="os-flash-actions">'
    +   '<button class="btn" data-action="os-ff-nav" data-d="-1" aria-label="Previous card">←</button>'
    +   '<button class="btn '+(known[f.abbr]?'btn-primary':'')+'" data-action="os-ff-known" data-abbr="'+osEsc(f.abbr)+'" data-advance="1">'+(known[f.abbr]?'✓ Known':'I know this')+'</button>'
    +   '<button class="btn" data-action="os-ff-shuffle">Shuffle</button>'
    +   '<button class="btn" data-action="os-ff-nav" data-d="1" aria-label="Next card">→</button>'
    + '</div><div class="faint" style="text-align:center;">Swipe left/right to move between cards</div></div>';
}

/* ---------- Bullet exam pointers ---------- */
function osPtrMatches(item, q){ return !q || item.t.toLowerCase().indexOf(q) !== -1; }
function osFmtPtr(t){
  return escapeHtmlPlain(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function osViewPointers(){
  var st = App.osPtr, q = st.q.trim().toLowerCase();
  var done = lsGet("os_ptr_done", {});
  var all = OSD.pointers || [];
  var groups = [["all","All"],["notes","Notes 1-19"],["book","Book 1-329"],["fullforms","Full forms"],["strategy","Exam strategy"]];
  var total = all.length, revised = all.filter(function(p){ return done[p.id]; }).length;
  var blocks = all.filter(function(p){ return st.group==="all" || p.group===st.group; }).map(function(p){
    var secs = p.sections.map(function(s){
      var items = s.items.filter(function(it){ return (!st.hyOnly || it.hy) && osPtrMatches(it, q); });
      if(!items.length) return "";
      return (s.h ? '<h4>'+osEsc(s.h)+'</h4>' : '') + '<ul>'+items.map(function(it){
        return '<li'+(it.hy?' class="hy"':'')+'>'+osFmtPtr(it.t)+'</li>';
      }).join("")+'</ul>';
    }).join("");
    if(!secs) return "";
    var n = p.sections.reduce(function(a,s){ return a+s.items.length; },0);
    var open = q || st.open[p.id];
    return '<div class="os-ptr'+(done[p.id]?' done':'')+'" id="os-ptr-'+p.id+'">'
      + '<button class="os-ptr-head" data-action="os-ptr-toggle" data-id="'+p.id+'" aria-expanded="'+(!!open)+'">'
      +   '<span class="os-ptr-title">'+osEsc(p.title)+'<small>'+osEsc(p.source)+' · '+n+' pointers</small></span>'
      +   '<span class="os-ptr-caret">'+(open?'−':'+')+'</span>'
      + '</button>'
      + (open ? '<div class="os-ptr-body">'+secs
          + '<div class="btn-row os-ptr-foot"><button class="btn btn-sm '+(done[p.id]?'':'btn-primary')+'" data-action="os-ptr-done" data-id="'+p.id+'">'+(done[p.id]?'✓ Revised':'Mark as revised')+'</button></div></div>' : '')
      + '</div>';
  }).join("");
  return '<div class="card os-intro"><h2>⚡ Bullet exam pointers</h2><p class="muted">Short revision notes by topic. <span class="os-hy-legend">Highlighted</span> lines are high-yield facts that UPSC ISS asks repeatedly.</p>'
    + '<div class="os-intro-stats"><span><b>'+revised+'/'+total+'</b> revised</span></div>'+osBar(total?revised/total*100:0)+'</div>'
    + '<div class="os-filterbar">'
    +   '<input type="search" id="os-ptr-q" placeholder="Search pointers e.g. 1950, PLFS, base year…" value="'+osEsc(st.q)+'" aria-label="Search pointers">'
    +   '<label class="check-row os-inline"><input type="checkbox" id="os-ptr-hy"'+(st.hyOnly?' checked':'')+'> High-yield only</label>'
    +   '<button class="btn btn-sm" data-action="os-ptr-all" data-open="1">Expand all</button>'
    +   '<button class="btn btn-sm" data-action="os-ptr-all" data-open="0">Collapse</button>'
    + '</div>'
    + '<div class="os-chips">'+groups.map(function(g){ return '<button class="chip'+(st.group===g[0]?' active':'')+'" data-action="os-ptr-group" data-g="'+g[0]+'">'+g[1]+'</button>'; }).join("")+'</div>'
    + (blocks || '<div class="card empty"><h3>No pointers match.</h3></div>');
}

/* ---------- Read mode (answers + explanation, no attempt) ---------- */
function osViewRead(){
  var s = OS_SET[App.osReadSet];
  if(!s) return backBar();
  var qs = OS_Q_BY_SET[s.id];
  var hide = App.osReadHide;
  var cards = qs.map(function(q, i){
    var opts = q.options.map(function(o, k){
      return '<div class="option locked'+(k===q.correctAnswer?' correct os-ans':'')+'"><span class="optlabel">'+"ABCD"[k]+'</span><span class="opttext">'+renderQuestionText(o)+'</span></div>';
    }).join("");
    return '<div class="card qcard os-read-card" data-action="os-reveal">'
      + '<div class="qmeta"><span class="os-read-no">Q'+(i+1)+'</span>'+badge(q.topic)+(q.questionType!=="Factual"?badge(q.questionType):"")+'<span class="faint" style="margin-left:auto;">'+osEsc(q.source)+'</span></div>'
      + '<div class="qtext">'+renderRich(q.question)+'</div>'
      + '<div class="options">'+opts+'</div>'
      + '<div class="os-read-exp">'+osExplainBlock(q)
      +   '<div class="reveal-block"><h4>Exam Shortcut</h4>'+renderQuestionText(q.examShortcut)+'</div>'
      +   (q.tipsTricks.length ? '<div class="reveal-block"><h4>Tips</h4><ul>'+q.tipsTricks.map(function(t){ return '<li>'+renderQuestionText(t)+'</li>'; }).join("")+'</ul></div>' : '')
      + '</div>'
      + (hide ? '<div class="os-tap-hint">Tap the card to show the answer</div>' : '')
      + '</div>';
  }).join("");
  return '<div class="os-read'+(hide?' hide-ans':'')+'">'
    + '<div class="card os-read-head"><div class="faint">Read mode · '+OS_KIND_LABEL[s.kind]+' '+s.id+(s.pages?' · '+(s.kind==="book"?'pp. ':'')+osEsc(s.pages):'')+'</div><h2>'+osEsc(s.title)+'</h2>'
    + '<div class="btn-row"><button class="btn '+(hide?'btn-primary':'')+'" data-action="os-read-hide">'+(hide?'Answers hidden (self-test)':'Hide answers')+'</button>'
    + '<button class="btn btn-primary" data-action="os-start" data-set="'+s.id+'" data-mode="learning">Practise this set</button></div></div>'
    + cards + '</div>';
}

/* ---------- Search (PYQ search + Official Statistics bank) ---------- */
var _osOrigViewSearch = viewSearch;
viewSearch = function(){
  var base = _osOrigViewSearch();
  var q = App.searchQuery.trim().toLowerCase();
  if(!q) return base;
  var qs = OS_Q.filter(function(x){
    return (x.question+" "+x.options.join(" ")+" "+x.topic+" "+x.explanation).toLowerCase().indexOf(q) !== -1;
  });
  var ff = (OSD.fullForms||[]).filter(function(f){ return (f.abbr+" "+f.full).toLowerCase().indexOf(q) !== -1; }).slice(0, 12);
  var ptrHits = 0;
  (OSD.pointers||[]).forEach(function(p){ p.sections.forEach(function(s){ s.items.forEach(function(it){ if(it.t.toLowerCase().indexOf(q)!==-1) ptrHits++; }); }); });
  var html = '<div class="card"><h2>Official Statistics hub: '+qs.length+' MCQs · '+ff.length+' full forms · '+ptrHits+' pointers</h2>';
  if(ff.length) html += '<div class="os-ff-list">'+ff.map(function(f){ return '<div class="os-ff-row"><div class="os-ff-abbr">'+osEsc(f.abbr)+'</div><div class="os-ff-full">'+osEsc(f.full)+'</div></div>'; }).join("")+'</div>';
  html += qs.slice(0, 25).map(function(x){
    return '<div class="history-row"><div><div class="h-title">'+osEsc(x.setId)+' · '+osEsc(x.topic)+'</div><div class="h-meta">'+osEsc(x.question.replace(/\*\*/g,"").slice(0,150))+'</div></div></div>';
  }).join("");
  html += '<div class="btn-row" style="margin-top:12px;">'
    + (qs.length ? '<button class="btn btn-primary" data-action="os-search-practice">Practise these '+Math.min(qs.length,100)+' MCQs</button>' : '')
    + (ptrHits ? '<button class="btn" data-action="os-search-ptr">Show '+ptrHits+' matching pointers</button>' : '')
    + '</div></div>';
  return base + html;
};

/* ---------- Home banner + result actions ---------- */
var _osOrigViewHome = viewHome;
viewHome = function(){
  var c = osCounts();
  var banner = '<button class="os-home-banner" data-action="os-go" data-tab="overview">'
    + '<span class="os-home-icon">🏛️</span>'
    + '<span class="os-home-text"><b>Official Statistics hub</b>'
    + '<span>Book pp. 1-329 · notes 1-19 · full forms · bullet exam pointers</span>'
    + '<span class="os-home-pills"><i>'+OS_Q.length+' MCQs</i><i>'+OS_SETS.length+' sets</i><i>'+(OSD.pointers||[]).length+' pointer topics</i></span></span>'
    + '<span class="os-home-go">›</span></button>';
  return _osOrigViewHome().replace('<div class="section-title">Sectional Mocks</div>', banner + '<div class="section-title">Sectional Mocks</div>');
};
var _osOrigViewResult = viewResult;
viewResult = function(){
  var html = _osOrigViewResult();
  var m = App.mock;
  if(!m || !m.osSetId) return html;
  var idx = OS_SETS.map(function(s){return s.id;}).indexOf(m.osSetId);
  var next = OS_SETS[idx+1];
  var bar = '<div class="card os-result-nav"><div><div class="faint">Official Statistics · '+osEsc(m.osSetId)+'</div><b>'+osEsc(OS_SET[m.osSetId].title)+'</b></div><div class="btn-row">'
    + '<button class="btn" data-action="os-read" data-set="'+m.osSetId+'">Read mode</button>'
    + (next ? '<button class="btn btn-primary" data-action="os-open-set" data-set="'+next.id+'">Next: '+osEsc(next.id)+' ›</button>' : '')
    + '<button class="btn btn-ghost" data-action="os-go" data-tab="'+((App.osReturn&&App.osReturn.tab)||"overview")+'">Back to hub</button>'
    + '</div></div>';
  return bar + html;
};

var _osOrigSubmit = submitMock;
submitMock = function(isAuto){
  var m = App.mock;
  _osOrigSubmit(isAuto);
  if(m && m.submitted && m.osSetId && App.lastResult) osRecord(m, App.lastResult);
};

/* =========================================================================
   Mobile shell: nav, history (Android back), scroll + swipe
   ========================================================================= */
var OSNAV = {fromPop:false, lastKey:null, lastView:null, lastQ:null, lastAnswered:null, scroll:{}};
function osRouteKey(){
  var k = App.view;
  if(App.view === "osHub") k += ":"+App.osTab;
  if(App.view === "osRead") k += ":"+App.osReadSet;
  return k;
}
function osState(){
  return {osv:1, view:App.view, tab:App.osTab, read:App.osReadSet, key:osRouteKey()};
}
function osHistory(push){
  try{
    if(push) history.pushState(osState(), "");
    else history.replaceState(osState(), "");
  }catch(e){}
}

var _osOrigRender = render;
render = function(){
  var prevKey = OSNAV.lastKey, prevView = OSNAV.lastView;
  if(prevKey) OSNAV.scroll[prevKey] = window.pageYOffset || 0;
  if(App.view === "osHub" || App.view === "osRead"){
    root = document.getElementById("app-root");
    root.innerHTML = App.view === "osHub" ? osViewHub() : osViewRead();
    afterRender();
  } else {
    _osOrigRender();
  }
  var key = osRouteKey();
  if(!OSNAV.fromPop && key !== prevKey){
    /* exam -> result replaces the exam entry so Back from a result never
       lands on a finished exam */
    osHistory(!(prevView === "exam" && App.view === "result") && prevKey !== null);
  }
  osUpdateChrome();
  /* scroll management */
  var m = App.mock;
  if(key !== prevKey){
    var y = OSNAV.fromPop ? (OSNAV.scroll[key] || 0) : 0;
    window.scrollTo(0, y);
  } else if(App.view === "exam" && m){
    var answered = Object.keys(m.answers).length;
    if(OSNAV.lastQ !== m.current){
      var hdr = document.querySelector(".exam-layout");
      if(hdr && window.pageYOffset > 0) window.scrollTo(0, 0);
    } else if(m.mode === "learning" && OSNAV.lastAnswered !== null && answered > OSNAV.lastAnswered){
      var fb = document.querySelector(".feedback-panel");
      if(fb && window.innerWidth <= 900){
        var eh = document.querySelector(".exam-header");
        var off = (eh ? Math.max(0, eh.getBoundingClientRect().bottom) : 0) + 10;
        var top = fb.getBoundingClientRect().top + window.pageYOffset - off;
        try{ window.scrollTo({top: top, behavior: "smooth"}); }catch(e){ window.scrollTo(0, top); }
      }
    }
  }
  OSNAV.lastKey = key;
  OSNAV.lastView = App.view;
  OSNAV.lastQ = m ? m.current : null;
  OSNAV.lastAnswered = m ? Object.keys(m.answers).length : null;
};

window.addEventListener("popstate", function(e){
  var sheet = document.getElementById("os-sheet");
  if(sheet){ osCloseSheet(); osHistory(true); return; }
  if(document.getElementById("modal-overlay")){ closeModal(); osHistory(true); return; }
  if(App.view === "exam" && App.mock && !App.mock.submitted){
    osHistory(true);
    showModal("Leave this test?",
      "<p class='muted'>You have answered "+Object.keys(App.mock.answers).length+" of "+App.mock.questions.length+" questions. Submit to save your score, or leave without saving.</p>",
      '<button class="btn" data-action="close-modal">Continue test</button><button class="btn btn-primary" data-action="do-submit">Submit</button><button class="btn btn-danger" data-action="os-abandon">Leave</button>');
    return;
  }
  var st = e.state;
  if(!st || !st.osv){ App.view = "home"; }
  else {
    if(st.view === "exam" && !(App.mock && !App.mock.submitted)) st = {view: App.osReturn ? "osHub" : "home", tab: App.osReturn ? App.osReturn.tab : App.osTab};
    if((st.view === "result" && !App.lastResult) || (st.view === "review" && !App.mock)) st = {view:"home"};
    App.view = st.view;
    if(st.tab) App.osTab = st.tab;
    if(st.read) App.osReadSet = st.read;
  }
  stopTimer();
  if(App.view === "exam" && App.mock && !App.mock.submitted) startTimer();
  OSNAV.fromPop = true;
  try{ render(); } finally { OSNAV.fromPop = false; }
});

/* Bottom nav (phone) / tab strip (desktop) + "More" sheet */
var OS_NAV_ITEMS = [
  ["home", "🏠", "Home"], ["overview", "🏛️", "Official"], ["pointers", "⚡", "Pointers"],
  ["ff", "🔤", "Full forms"], ["more", "☰", "More"]
];
function osBuildChrome(){
  var app = document.getElementById("app");
  var main = document.getElementById("app-root");
  if(!app || !main || document.getElementById("os-nav")) return;
  var nav = document.createElement("nav");
  nav.id = "os-nav";
  nav.setAttribute("aria-label", "Primary");
  nav.innerHTML = OS_NAV_ITEMS.map(function(it){
    return '<button type="button" data-action="os-nav" data-go="'+it[0]+'"><span class="os-nav-ic" aria-hidden="true">'+it[1]+'</span><span class="os-nav-lb">'+it[2]+'</span></button>';
  }).join("");
  app.insertBefore(nav, main);
}
function osUpdateChrome(){
  var nav = document.getElementById("os-nav");
  if(!nav) return;
  var inExam = App.view === "exam";
  document.body.classList.toggle("os-in-exam", inExam);
  var active = App.view === "home" ? "home"
    : App.view === "osHub" ? (App.osTab === "pointers" ? "pointers" : App.osTab === "ff" ? "ff" : "overview")
    : App.view === "osRead" ? "overview"
    : (["analytics","history","bookmarksList","setupMistakes","setupBookmarks"].indexOf(App.view) !== -1 ? "more" : "");
  Array.prototype.forEach.call(nav.querySelectorAll("button"), function(b){
    var on = b.getAttribute("data-go") === active;
    b.classList.toggle("active", on);
    if(on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}
function osOpenSheet(){
  osCloseSheet();
  var fs = lsGet("os_fs", "m");
  var el = document.createElement("div");
  el.id = "os-sheet";
  el.innerHTML = '<div class="os-sheet-backdrop" data-action="os-sheet-close"></div>'
    + '<div class="os-sheet-panel" role="dialog" aria-label="More">'
    +   '<div class="os-sheet-grip"></div>'
    +   '<div class="os-sheet-grid">'
    +     '<button data-action="go-view" data-view="analytics">📊<span>Analytics</span></button>'
    +     '<button data-action="go-view" data-view="history">🕒<span>History</span></button>'
    +     '<button data-action="go-view" data-view="bookmarksList">🔖<span>Bookmarks</span></button>'
    +     '<button data-action="go-view" data-view="setupMistakes">✖️<span>Mistakes</span></button>'
    +     '<button data-action="toggle-theme">🌓<span>Theme</span></button>'
    +     '<button data-action="export-progress">⬇️<span>Export</span></button>'
    +     '<button data-action="import-progress">⬆️<span>Import</span></button>'
    +     '<button data-action="reset-progress">♻️<span>Reset</span></button>'
    +   '</div>'
    +   '<div class="os-sheet-fs"><span>Text size</span>'
    +     ["s","m","l","xl"].map(function(k){ return '<button class="'+(fs===k?'active':'')+'" data-action="os-fs" data-fs="'+k+'">'+{s:"A−",m:"A",l:"A+",xl:"A++"}[k]+'</button>'; }).join("")
    +   '</div>'
    + '</div>';
  document.body.appendChild(el);
  requestAnimationFrame(function(){ el.classList.add("open"); });
}
function osCloseSheet(){
  var el = document.getElementById("os-sheet");
  if(el) el.remove();
}
function osApplyFs(){
  document.documentElement.setAttribute("data-os-fs", lsGet("os_fs", "m"));
}

/* ---------- actions ---------- */
function osGo(tab){
  App.view = "osHub";
  if(tab) App.osTab = tab;
  render();
}
document.addEventListener("click", function(e){
  var sheet = document.getElementById("os-sheet");
  if(sheet && sheet.contains(e.target)){
    var sa = e.target.closest("[data-action]");
    if(sa && sa.getAttribute("data-action") !== "os-fs") osCloseSheet();
  }
}, true);
document.addEventListener("click", function(e){
  var t = e.target.closest("[data-action]");
  if(!t) return;
  var a = t.getAttribute("data-action");
  if(a.indexOf("os-") !== 0) return;
  switch(a){
    case "os-nav": {
      var go = t.getAttribute("data-go");
      if(App.view === "exam" && App.mock && !App.mock.submitted){ toast("Submit or leave the test first."); break; }
      if(go === "home"){ App.view = "home"; App.mock = null; render(); }
      else if(go === "more") osOpenSheet();
      else osGo(go);
      break;
    }
    case "os-go": osGo(t.getAttribute("data-tab")); break;
    case "os-tab": App.osTab = t.getAttribute("data-tab"); render(); break;
    case "os-open-set": {
      var sid = t.getAttribute("data-set"), s = OS_SET[sid];
      if(!s) break;
      App.view = "osHub";
      App.osTab = s.kind === "book" ? "book" : s.kind === "notes" ? "notes" : "ff";
      if(s.kind === "fullforms") App.osFF.mode = "quiz";
      if(s.kind === "notes") App.osNoteFilter = 0;
      render();
      var card = document.getElementById("os-set-"+sid);
      if(card){ card.classList.add("pulse"); card.scrollIntoView({block:"center"}); }
      break;
    }
    case "os-start": osStartSet(t.getAttribute("data-set"), t.getAttribute("data-mode")); break;
    case "os-read": App.osReadSet = t.getAttribute("data-set"); App.view = "osRead"; render(); break;
    case "os-read-hide": App.osReadHide = !App.osReadHide; render(); break;
    case "os-reveal": t.classList.add("revealed"); break;
    case "os-mixed": osStartPool("Official Statistics · Mixed 50", shuffle(OS_Q).slice(0,50), t.getAttribute("data-mode") || "learning"); break;
    case "os-pyq": osStartPool("Official Statistics · PYQs 2018-2026", ALL_Q.filter(function(q){ return q.unit==="Official Statistics"; }), "learning"); break;
    case "os-mistakes": {
      var ids = lsGet("mistakes", []).filter(function(id){ return BY_ID[id] && BY_ID[id].isOS; });
      osStartPool("Official Statistics · My mistakes", ids.map(function(id){ return BY_ID[id]; }), "learning");
      break;
    }
    case "os-weak": {
      var weak = osWeakTopics(4).map(function(w){ return w.topic; });
      var stats = lsGet("stats", {});
      var pool = OS_Q.filter(function(q){ return weak.indexOf(q.topic) !== -1; });
      pool.sort(function(x,y){
        var sx = stats[x.id], sy = stats[y.id];
        return (sx ? sx.correct/sx.attempts : -1) - (sy ? sy.correct/sy.attempts : -1);
      });
      osStartPool("Official Statistics · Weak topics", pool.slice(0,50), "learning");
      break;
    }
    case "os-note-filter": App.osNoteFilter = Number(t.getAttribute("data-no")); render(); break;
    case "os-note-practice": {
      var no = Number(t.getAttribute("data-no"));
      var nt = (OSD.noteTopics||[]).filter(function(x){ return x.no===no; })[0];
      osStartPool("Notes topic "+no+" · "+(nt?nt.title:""), osNoteQs(no), t.getAttribute("data-mode"));
      break;
    }
    case "os-ff-mode": App.osFF.mode = t.getAttribute("data-mode"); App.osFF.flipped = false; render(); break;
    case "os-ff-flip": App.osFF.flipped = !App.osFF.flipped; t.classList.toggle("flipped", App.osFF.flipped); break;
    case "os-ff-nav": osFFMove(Number(t.getAttribute("data-d"))); break;
    case "os-ff-shuffle": {
      var n = osFFList().length;
      App.osFF.order = shuffle(Array.from({length:n}, function(_,i){ return i; }));
      App.osFF.idx = 0; App.osFF.flipped = false; render();
      break;
    }
    case "os-ff-known": {
      var ab = t.getAttribute("data-abbr");
      var kn = lsGet("os_ff_known", {});
      if(kn[ab]) delete kn[ab]; else kn[ab] = 1;
      lsSet("os_ff_known", kn);
      if(t.getAttribute("data-advance") && kn[ab] && !App.osFF.unknownOnly){ osFFMove(1); break; }
      if(App.osFF.unknownOnly) App.osFF.order = null;
      render();
      break;
    }
    case "os-ptr-toggle": {
      var pid = t.getAttribute("data-id");
      App.osPtr.open[pid] = !App.osPtr.open[pid];
      render();
      var blk = document.getElementById("os-ptr-"+pid);
      if(blk && App.osPtr.open[pid]){
        var r = blk.getBoundingClientRect();
        if(r.top < 60 || r.top > window.innerHeight*0.6) window.scrollTo(0, window.pageYOffset + r.top - 70);
      }
      break;
    }
    case "os-ptr-all": {
      var openAll = t.getAttribute("data-open") === "1";
      App.osPtr.open = {};
      if(openAll) (OSD.pointers||[]).forEach(function(p){ App.osPtr.open[p.id] = true; });
      render();
      break;
    }
    case "os-ptr-group": App.osPtr.group = t.getAttribute("data-g"); render(); break;
    case "os-ptr-done": {
      var d = lsGet("os_ptr_done", {}), id = t.getAttribute("data-id");
      if(d[id]) delete d[id]; else d[id] = Date.now();
      lsSet("os_ptr_done", d);
      render();
      break;
    }
    case "os-ptr-jump": {
      var jid = t.getAttribute("data-id");
      App.view = "osHub"; App.osTab = "pointers"; App.osPtr.group = "all"; App.osPtr.q = "";
      App.osPtr.open = {}; App.osPtr.open[jid] = true;
      render();
      var jb = document.getElementById("os-ptr-"+jid);
      if(jb) window.scrollTo(0, window.pageYOffset + jb.getBoundingClientRect().top - 70);
      break;
    }
    case "os-search-practice": {
      var sq = App.searchQuery.trim().toLowerCase();
      var hits = OS_Q.filter(function(x){ return (x.question+" "+x.options.join(" ")+" "+x.topic+" "+x.explanation).toLowerCase().indexOf(sq) !== -1; }).slice(0,100);
      osStartPool("Official Statistics · Search: "+App.searchQuery, hits, "learning");
      break;
    }
    case "os-search-ptr": App.osPtr.q = App.searchQuery; App.osPtr.group = "all"; osGo("pointers"); break;
    case "os-abandon": {
      closeModal(); stopTimer();
      App.mock = null;
      App.view = App.osReturn ? "osHub" : "home";
      if(App.osReturn) App.osTab = App.osReturn.tab;
      render();
      break;
    }
    case "os-sheet-close": osCloseSheet(); break;
    case "os-fs": {
      lsSet("os_fs", t.getAttribute("data-fs"));
      osApplyFs();
      Array.prototype.forEach.call(document.querySelectorAll(".os-sheet-fs button"), function(b){ b.classList.toggle("active", b===t); });
      break;
    }
    default: break;
  }
});
function osFFMove(d){
  var n = osFFList().length; if(!n) return;
  App.osFF.idx = (App.osFF.idx + d + n) % n;
  App.osFF.flipped = false;
  render();
}
document.addEventListener("input", function(e){
  var id = e.target.id;
  if(id === "os-ff-q" || id === "os-ptr-q"){
    if(id === "os-ff-q"){ App.osFF.q = e.target.value; App.osFF.order = null; App.osFF.idx = 0; }
    else App.osPtr.q = e.target.value;
    clearTimeout(osInputT);
    var pos = e.target.selectionStart;
    osInputT = setTimeout(function(){
      render();
      var el = document.getElementById(id);
      if(el){ el.focus(); try{ el.setSelectionRange(pos, pos); }catch(err){} }
    }, 180);
  }
});
var osInputT;
document.addEventListener("change", function(e){
  var id = e.target.id;
  if(id === "os-ff-cat"){ App.osFF.cat = e.target.value; App.osFF.order = null; App.osFF.idx = 0; render(); }
  if(id === "os-ff-unknown"){ App.osFF.unknownOnly = e.target.checked; App.osFF.order = null; App.osFF.idx = 0; render(); }
  if(id === "os-ptr-hy"){ App.osPtr.hyOnly = e.target.checked; render(); }
});

/* Swipe: next/prev question in an exam, next/prev flashcard */
var osTouch = null;
document.addEventListener("touchstart", function(e){
  if(e.touches.length !== 1) { osTouch = null; return; }
  var tgt = e.target;
  if(tgt.closest && (tgt.closest("table") || tgt.closest(".mathblock") || tgt.closest(".os-tabs") || tgt.closest(".os-chips") || tgt.closest("input,select,textarea"))){ osTouch = null; return; }
  var inQ = App.view === "exam" && tgt.closest && tgt.closest(".qcard");
  var inCard = App.view === "osHub" && tgt.closest && tgt.closest(".os-flash-wrap");
  if(!inQ && !inCard){ osTouch = null; return; }
  osTouch = {x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now(), card:!!inCard};
}, {passive:true});
document.addEventListener("touchend", function(e){
  if(!osTouch) return;
  var p = e.changedTouches[0];
  var dx = p.clientX - osTouch.x, dy = p.clientY - osTouch.y, dt = Date.now() - osTouch.t;
  var card = osTouch.card;
  osTouch = null;
  if(Math.abs(dx) < 70 || Math.abs(dy) > 45 || dt > 700) return;
  if(window.getSelection && String(window.getSelection()).length) return;
  if(card){ osFFMove(dx < 0 ? 1 : -1); return; }
  var m = App.mock; if(!m) return;
  var n = m.current + (dx < 0 ? 1 : -1);
  if(n < 0 || n >= m.questions.length) return;
  m.current = n;
  render();
}, {passive:true});

/* ---------- init ---------- */
osApplyFs();
osBuildChrome();
try{ history.replaceState(osState(), ""); }catch(e){}
OSNAV.lastKey = osRouteKey();
OSNAV.lastView = App.view;
