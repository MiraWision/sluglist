/**
 * Inline assets for the report. Kept as plain strings so the generated file
 * needs no build step and no external request: a strict reading of "one file,
 * opens from file://, works offline".
 *
 * Design brief: a document, not a dashboard. One ~720px column, a system font
 * stack, three verdict colours and nothing else decorative. It has to survive
 * being forwarded to a client who will read it once and judge the work by it.
 */

export const REPORT_CSS = `
*,*::before,*::after{box-sizing:border-box}
/* One palette, always light. A report is a document that gets forwarded,
   printed and screenshotted, and it must look the same to everyone who opens
   it — following the reader's OS would make two people describing "the report"
   describe different pages. Print inherits this, so paper matches the screen. */
:root{
  --ink:#14171a; --dim:#5b6672; --line:#e3e7ea; --bg:#fff; --soft:#f6f8f9;
  --link:#0b5fca; --quote:#0f1418;
  --pass:#1a7f4b; --pass-bg:#e8f5ee;
  --fail:#b3261e; --fail-bg:#fdecea;
  --skip:#6b7480; --skip-bg:#eef1f3;
}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em}
a{color:var(--link)}
.doc{max-width:760px;margin:0 auto;padding:64px 20px 96px}
p{margin:0 0 12px}
.dim{color:var(--dim)}
.nb{color:var(--dim);font-size:.9rem}

/* The header: a title, one sentence saying what this is, and the provenance. */
.page{padding-bottom:28px;border-bottom:1px solid var(--line)}
.page h1{font-size:2.1rem;line-height:1.2;margin:0 0 12px;letter-spacing:-.022em}
.page .lede{color:var(--dim);font-size:1.02rem;margin:0 0 6px}
.page .source{color:var(--dim);font-size:.85rem;margin:0}
.page .source code{font-size:.92em}

.tiles{display:flex;flex-wrap:wrap;gap:10px;margin:28px 0 12px}
.tile{flex:1 1 96px;padding:14px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line);text-align:center}
.tile .n{display:block;font-size:1.9rem;font-weight:650;line-height:1.1;letter-spacing:-.02em}
.tile .l{display:block;font-size:.76rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);margin-top:2px}
.tile-pass .n{color:var(--pass)} .tile-fail .n{color:var(--fail)}
.tile-skip .n,.tile-none .n{color:var(--skip)}
.summary-line{font-size:.9rem;color:var(--dim);margin:0}

/* Section headings — "Checklist", "Reports" — are signposts, not titles: the
   headings a reader scans are the ones on the blocks themselves. */
.section-title{font-size:.76rem;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);
  font-weight:650;margin:56px 0 0}
.group{font-size:.74rem;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);
  font-weight:650;margin:36px 0 -8px}
.session-mark{font-size:.8rem;color:var(--dim);margin:32px 0 -12px}

/* Every checked item and every filed report is the same kind of block: a
   number, a heading, a row of scannable tags, then the words and the proof. */
.report{padding:44px 0;border-bottom:1px solid var(--line)}
.report-head{display:flex;gap:12px;align-items:baseline}
.num{flex:none;font-size:.78rem;font-weight:650;color:var(--dim);
  background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:2px 7px}
.report h3{font-size:1.32rem;line-height:1.3;margin:0;letter-spacing:-.012em;font-weight:640;
  text-transform:none;color:var(--ink)}
.report h4{font-size:.95rem;margin:20px 0 6px}
.report ul{margin:0 0 12px;padding-left:20px}
.report li{margin-bottom:3px}

.tags{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.tag{font-size:.76rem;padding:2px 9px;border-radius:999px;background:var(--soft);
  border:1px solid var(--line);color:var(--dim);white-space:nowrap}
.tag-page code{color:var(--ink)}
.tag-dim{border-style:dashed}
/* The verdict rides in the same row: it is one more fact about the item, and a
   reader scanning a column of blocks reads colour before words. */
.tag-verdict{font-weight:650;text-transform:uppercase;letter-spacing:.05em;font-size:.71rem;padding:3px 10px}
.tag-pass{background:var(--pass-bg);border-color:transparent;color:var(--pass)}
.tag-fail{background:var(--fail-bg);border-color:transparent;color:var(--fail)}
.tag-skip,.tag-not-tested{background:var(--skip-bg);border-color:transparent;color:var(--skip)}
.tag-link{padding:0}
.tag-link a{display:block;padding:2px 9px;color:inherit;text-decoration:none}
.tag-link:hover{border-color:var(--dim)}

/* What the person wrote, or what the tester saw. The accent bar says "these
   are not my words" — its colour carries the verdict on a checked item. */
.quote{margin:18px 0 0;padding-left:16px;border-left:3px solid var(--pass);color:var(--quote)}
.quote p{margin:0 0 10px}
.quote p:last-child{margin-bottom:0}
.quote-fail{border-left-color:var(--fail)}
.quote-skip,.quote-not-tested{border-left-color:var(--line)}
.quote-label{
  display:block;font-size:.7rem;font-weight:650;text-transform:uppercase;letter-spacing:.06em;
  color:var(--dim);margin-bottom:5px;
}
.linked{margin:14px 0 0;font-size:.85rem;color:var(--dim)}
.cont{color:var(--dim);font-size:.85em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.attachments{list-style:none;padding:0;margin:14px 0 0;font-size:.88rem}
.attachments li{margin-bottom:4px}

.fix{margin:18px 0 0;padding:10px 13px;border-radius:8px;background:var(--soft);
  border:1px solid var(--line);font-size:.9rem}
.badge{
  display:inline-block;padding:2px 9px;border-radius:999px;
  font-size:.71rem;font-weight:650;text-transform:uppercase;letter-spacing:.05em;
  background:var(--skip-bg);color:var(--skip);white-space:nowrap;
}
.badge-fix-fixed{background:var(--pass-bg);color:var(--pass)}
.badge-fix-wontfix,.badge-fix-needs_info{background:var(--skip-bg);color:var(--skip)}

.shots{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 0}
.shot{margin:0;width:132px}
.shot-open{
  display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:8px;
  background:var(--soft);cursor:zoom-in;overflow:hidden;line-height:0;
  transition:border-color .14s ease,transform .14s ease;
}
.shot-open:hover{border-color:var(--dim);transform:translateY(-1px)}
.shot-open:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.shot-open img{width:100%;height:88px;object-fit:cover;object-position:top center;display:block}
figcaption{font-size:.72rem;color:var(--dim);margin-top:5px;line-height:1.3}

/* The evidence a reader only wants when they doubt the text: every field of
   the frontmatter, the session's context, and the action trail. A 25-step
   trail is longer than the report it belongs to, so it travels folded. */
.details{margin:22px 0 0;border:1px solid var(--line);border-radius:10px;background:var(--soft)}
.details summary{cursor:pointer;list-style:none;padding:11px 14px;font-size:.86rem;color:var(--dim);
  display:flex;align-items:center;gap:9px;user-select:none;border-radius:10px}
.details summary::-webkit-details-marker{display:none}
.details summary:hover{color:var(--ink)}
.chev{flex:none;width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;
  transform:rotate(-45deg);transition:transform .16s ease;margin-left:2px}
.details[open] .chev{transform:rotate(45deg)}
.details-body{padding:2px 14px 16px;border-top:1px solid var(--line)}
.meta-table{margin:14px 0 0;font-size:.85rem;display:grid;gap:1px;background:var(--line);
  border:1px solid var(--line);border-radius:8px;overflow:hidden}
.meta-table .row{display:grid;grid-template-columns:170px minmax(0,1fr);gap:12px;background:var(--bg);padding:7px 11px}
.meta-table dt{color:var(--dim)}
.meta-table dd{margin:0;word-break:break-word}
.trail-title{font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);
  margin:20px 0 8px;font-weight:650}
.trail{margin:0;padding-left:22px;font-size:.82rem;color:var(--dim)}
.trail li{margin-bottom:5px;word-break:break-word}
.trail code{color:var(--ink)}
.stamp{display:inline-block;min-width:104px;padding-right:10px;color:var(--dim)}

.page-foot{margin-top:48px;font-size:.82rem;color:var(--dim)}

/* A plain fixed overlay rather than <dialog>: the top layer is one dependency
   too many for a file that gets forwarded and opened in arbitrary preview
   panes, where a modal dialog can end up invisible. The backdrop is .86 and not
   opaque on purpose — the article stays legible behind it, so the overlay reads
   as "looking closer", not as "navigated away". */
.lightbox{position:fixed;inset:0;z-index:999;display:none;flex-direction:column;
  background:rgba(8,10,12,.86);color:#f2f5f7}
.lightbox.open{display:flex}
.lb-stage{flex:1;display:flex;align-items:center;justify-content:center;padding:56px 56px 8px;min-height:0}
.lb-stage img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;cursor:zoom-out}
/* A full-page capture is many times taller than the screen; contained, it is a
   110px strip. Fit the width and let the overlay scroll instead. */
.lb-stage.tall{align-items:flex-start;overflow-y:auto;overscroll-behavior:contain;padding-top:56px}
.lb-stage.tall img{max-height:none;width:min(1100px,100%);object-fit:fill}
/* The caption sits over the dimmed article, so it gets its own footing —
   without it the filename reads on top of whatever paragraph is behind. */
.lb-bar{flex:none;display:flex;align-items:center;justify-content:center;gap:14px;
  padding:18px 56px 22px;font-size:.82rem;color:#aab4bf;text-align:center;
  background:linear-gradient(to top,rgba(8,10,12,.96),rgba(8,10,12,0))}
/* The caption says what the picture is; the file name says which artifact it
   is. Full size is where someone checking the evidence needs both. */
.lb-file{color:#7d8792;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
.lb-count{font-variant-numeric:tabular-nums}
.lb-close,.lb-nav{position:fixed;border:none;background:rgba(255,255,255,.1);color:#f2f5f7;
  cursor:pointer;border-radius:50%;width:40px;height:40px;font-size:20px;line-height:1;
  display:flex;align-items:center;justify-content:center}
.lb-close:hover,.lb-nav:hover{background:rgba(255,255,255,.2)}
.lb-close{top:16px;right:16px}
.lb-nav-prev{left:12px;top:50%;transform:translateY(-50%)}
.lb-nav-next{right:12px;top:50%;transform:translateY(-50%)}
.lb-nav[hidden]{display:none}

@media (max-width:640px){
  .meta-table .row{grid-template-columns:minmax(0,1fr);gap:2px}
  .stamp{min-width:0;padding-right:8px}
  .page h1{font-size:1.75rem}
}
@media print{
  :root{--ink:#000;--dim:#444;--line:#bbb;--bg:#fff;--soft:#f5f5f5}
  body{font-size:11pt}
  .doc{max-width:none;padding:0}
  .report{break-inside:avoid;padding:26px 0}
  /* Thumbnails keep a fixed height on paper too. Let a full-page capture size
     itself and one 1280x6000 evidence shot becomes a page of its own — Chrome
     drops it and prints the blank. The file itself is where a reader zooms. */
  .shot{width:31%}
  .shot-open{cursor:default}
  .shot-open img{height:130px}
  .lightbox{display:none!important}
  /* On paper a spoiler cannot be opened, so it is not one: the summary row
     disappears and the evidence prints as an ordinary appendix. The viewer
     script opens every <details> on beforeprint so nothing is dropped. */
  .details{break-inside:avoid}
  .details summary{display:none}
  .details-body{border-top:none}
}
`.trim();

/**
 * The viewer: an overlay, arrows within one report, and the tall-image rule.
 *
 * The full-size image is the SAME data URI as the thumbnail (the thumbnail is
 * CSS-scaled), so opening one costs nothing and the file carries each image
 * exactly once.
 */
export const REPORT_JS = `
(function(){
  var box=document.getElementById('lightbox');
  var stage=document.getElementById('lb-img');
  var caption=document.getElementById('lb-caption');
  var file=document.getElementById('lb-file');
  var counter=document.getElementById('lb-count');
  var prev=document.getElementById('lb-prev');
  var next=document.getElementById('lb-next');
  if(!box||!stage)return;
  var group=[];
  var index=0;

  function open(on){
    box.classList.toggle('open',on);
    box.hidden=!on;
    // Lock the article behind the overlay, or the wheel scrolls past it.
    document.body.style.overflow=on?'hidden':'';
    if(!on){stage.parentElement.scrollTop=0;stage.removeAttribute('src');}
  }

  function paint(){
    var shot=group[index];
    if(!shot)return;
    var img=shot.querySelector('img');
    if(!img)return;
    stage.parentElement.classList.remove('tall');
    stage.parentElement.scrollTop=0;
    stage.src=img.src;
    stage.alt=img.alt||'';
    caption.textContent=img.alt||'';
    if(file)file.textContent=img.getAttribute('data-file')||'';
    counter.textContent=group.length>1?(index+1)+' / '+group.length:'';
    prev.hidden=next.hidden=group.length<2;
  }

  function step(delta){
    if(group.length<2)return;
    index=(index+delta+group.length)%group.length;
    paint();
  }

  document.addEventListener('click',function(event){
    var button=event.target.closest?event.target.closest('.shot-open'):null;
    if(button){
      var figure=button.parentElement;
      // The arrows walk the figures of THIS report, not of the whole document.
      group=Array.prototype.slice.call(figure.parentElement.querySelectorAll('.shot'));
      index=group.indexOf(figure);
      paint();
      open(true);
      return;
    }
    if(!box.classList.contains('open'))return;
    // Anywhere but the arrows closes: the image, the caption bar, the backdrop.
    if(!(event.target.closest&&event.target.closest('.lb-nav'))){open(false);}
  });

  document.addEventListener('keydown',function(event){
    if(!box.classList.contains('open'))return;
    if(event.key==='Escape'){open(false);}
    if(event.key==='ArrowRight'){event.preventDefault();step(1);}
    if(event.key==='ArrowLeft'){event.preventDefault();step(-1);}
  });

  // A page capture is many times taller than the screen. Contained it becomes
  // an unreadable strip, so fit the width and scroll the overlay instead.
  stage.addEventListener('load',function(){
    var tall=stage.naturalWidth>0&&stage.naturalHeight/stage.naturalWidth>1.4;
    stage.parentElement.classList.toggle('tall',tall);
  });

  if(prev)prev.addEventListener('click',function(){step(-1);});
  if(next)next.addEventListener('click',function(){step(1);});

  // Paper has no spoilers: open every details block before printing.
  window.addEventListener('beforeprint',function(){
    var all=document.querySelectorAll('details');
    for(var i=0;i<all.length;i++){all[i].open=true;}
  });
})();
`.trim();
