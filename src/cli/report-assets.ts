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
:root{
  --ink:#14171a; --dim:#5b6672; --line:#e3e7ea; --bg:#fff; --soft:#f6f8f9;
  --pass:#1a7f4b; --pass-bg:#e8f5ee;
  --fail:#b3261e; --fail-bg:#fdecea;
  --skip:#6b7480; --skip-bg:#eef1f3;
  --link:#0b5fca;
}
@media (prefers-color-scheme:dark){
  :root{
    --ink:#e7ebee; --dim:#9aa5b1; --line:#2a3138; --bg:#14171a; --soft:#1b2025;
    --pass:#6ddba0; --pass-bg:#12301f;
    --fail:#ff9c94; --fail-bg:#381a17;
    --skip:#9aa5b1; --skip-bg:#232a30;
    --link:#7db3ff;
  }
}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
a{color:var(--link)}
.doc{max-width:720px;margin:0 auto;padding:56px 20px 80px}

h1{font-size:1.9rem;line-height:1.25;margin:0 0 16px;letter-spacing:-.02em}
h2{font-size:1.3rem;margin:48px 0 8px;padding-bottom:8px;border-bottom:1px solid var(--line)}
h3{font-size:1.02rem;margin:32px 0 12px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em}
h4{font-size:.95rem;margin:18px 0 6px}
p{margin:0 0 12px}

.meta{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:.87rem;color:var(--dim);margin:0 0 8px}
.meta b{font-weight:600;color:var(--ink);font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;margin-right:6px}
.dim{color:var(--dim)}
.nb{color:var(--dim);font-size:.9rem}

.tiles{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0 12px}
.tile{flex:1 1 96px;padding:14px 12px;border-radius:10px;background:var(--soft);border:1px solid var(--line);text-align:center}
.tile .n{display:block;font-size:1.9rem;font-weight:650;line-height:1.1;letter-spacing:-.02em}
.tile .l{display:block;font-size:.76rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);margin-top:2px}
.tile-pass .n{color:var(--pass)} .tile-fail .n{color:var(--fail)}
.tile-skip .n,.tile-none .n{color:var(--skip)}
.summary-line{font-size:.9rem;color:var(--dim)}

.items{list-style:none;margin:0;padding:0}
.item{padding:14px 0;border-top:1px solid var(--line)}
.item:first-child{border-top:none}
.item-head{display:flex;gap:10px;align-items:baseline}
.item-title{flex:1}

.badge{
  display:inline-block;flex:none;padding:2px 9px;border-radius:999px;
  font-size:.71rem;font-weight:650;text-transform:uppercase;letter-spacing:.05em;
  background:var(--skip-bg);color:var(--skip);white-space:nowrap;
}
.badge-pass{background:var(--pass-bg);color:var(--pass)}
.badge-fail{background:var(--fail-bg);color:var(--fail)}
.badge-fix-fixed{background:var(--pass-bg);color:var(--pass)}
.badge-fix-wontfix,.badge-fix-needs_info{background:var(--skip-bg);color:var(--skip)}

.observed{margin:8px 0 0;font-size:.92rem}
.observed-label{
  font-size:.7rem;font-weight:650;text-transform:uppercase;letter-spacing:.06em;
  color:var(--dim);margin-right:7px;
}
.linked{margin:6px 0 0;font-size:.88rem;color:var(--dim)}

.shots{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 4px}
.shot{margin:0;flex:0 1 220px}
.shot-open{
  display:block;width:100%;padding:0;border:1px solid var(--line);border-radius:8px;
  background:var(--soft);cursor:zoom-in;overflow:hidden;line-height:0;
}
.shot-open:hover{border-color:var(--dim)}
.shot-open img{width:100%;height:150px;object-fit:cover;object-position:top center;display:block}
figcaption{font-size:.72rem;color:var(--dim);margin-top:4px;word-break:break-all;line-height:1.35}

.issue{padding:22px 0;border-top:1px solid var(--line)}
.issue h3{text-transform:none;letter-spacing:normal;color:var(--ink);font-size:1.06rem;margin:0 0 10px;display:flex;gap:9px;align-items:baseline}
.issue-id{
  flex:none;font-size:.72rem;font-weight:650;color:var(--dim);
  background:var(--soft);border:1px solid var(--line);border-radius:5px;padding:1px 6px;
}
.issue ul{margin:0 0 12px;padding-left:20px}
.issue li{margin-bottom:3px}
.cont{color:var(--dim);font-size:.85em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.attachments{list-style:none;padding:0;font-size:.88rem}
.attachments li{margin-bottom:4px}

.fix{margin:0 0 12px;padding:9px 12px;border-radius:8px;background:var(--soft);border:1px solid var(--line);font-size:.9rem}

.page-foot{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);font-size:.8rem;color:var(--dim)}

dialog#lightbox{
  border:none;padding:0;background:transparent;max-width:96vw;max-height:96vh;
  overflow:visible;
}
dialog#lightbox::backdrop{background:rgba(0,0,0,.85)}
#lightbox-img{max-width:96vw;max-height:92vh;display:block;border-radius:6px}
#lightbox-close{
  position:absolute;top:-14px;right:-14px;width:34px;height:34px;border-radius:50%;
  border:none;background:#fff;color:#000;font-size:22px;line-height:1;cursor:pointer;
}

@media print{
  :root{--ink:#000;--dim:#444;--line:#bbb;--bg:#fff;--soft:#f4f4f4}
  body{font-size:11pt}
  .doc{max-width:none;padding:0}
  dialog#lightbox{display:none!important}
  .shot-open{cursor:default}
  .shot{flex:0 1 30%}
  .shot-open img{height:auto}
  .item,.issue{break-inside:avoid}
  h2{break-after:avoid}
  a{text-decoration:none;color:#000}
}
`.trim();

/**
 * Lightbox: a native `<dialog>` driven by ~20 lines. The full-size image is the
 * SAME data URI as the thumbnail (the thumbnail is CSS-scaled), so opening it
 * costs nothing and the file carries each image exactly once.
 */
export const REPORT_JS = `
(function(){
  var dialog=document.getElementById('lightbox');
  var image=document.getElementById('lightbox-img');
  if(!dialog||!image||typeof dialog.showModal!=='function')return;
  document.addEventListener('click',function(event){
    var button=event.target.closest?event.target.closest('.shot-open'):null;
    if(button){
      var img=button.querySelector('img');
      if(!img)return;
      image.src=img.src;
      image.alt=img.alt||'';
      dialog.showModal();
      return;
    }
    if(event.target===dialog||event.target.id==='lightbox-close'){dialog.close();}
  });
  dialog.addEventListener('close',function(){image.removeAttribute('src');});
})();
`.trim();
