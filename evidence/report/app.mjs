/**
 * "Reportly" — a small demo app for the sluglist end-to-end run.
 *
 * Three pages (dashboard / reports / settings) and one DELIBERATE BUG, chosen
 * so the run exercises all three evidence shapes:
 *   - a visible result   → Reports table renders (pass, screenshot proves it)
 *   - an invisible result→ Export downloads a CSV (pass, only the downloaded
 *                          file's name and size prove it — the screen shows
 *                          nothing)
 *   - a broken feature   → Settings Save shows no confirmation (fail + issue)
 *
 * Pass BUG=0 to run the fixed build.
 */
import { createServer } from "node:http";

const BUGGY = process.env.BUG !== "0";
const PORT = Number(process.env.PORT || 5099);

const NAV = `
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/reports">Reports</a>
  <a href="/settings">Settings</a>
</nav>`;

const STYLE = `
body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;color:#14171a}
nav{background:#12263f;padding:12px 24px;display:flex;gap:20px}
nav a{color:#cfe0f5;text-decoration:none;font-weight:600}
main{padding:28px 24px;max-width:840px}
h1{font-size:1.6rem;margin:0 0 18px}
table{border-collapse:collapse;margin-top:14px}
th,td{border:1px solid #d6dde4;padding:7px 14px;text-align:left}
th{background:#f4f7f9}
button{font:inherit;padding:7px 15px;border:1px solid #12263f;background:#fff;border-radius:6px;cursor:pointer}
button.primary{background:#12263f;color:#fff}
.toolbar{display:flex;gap:10px;margin-top:6px}
.toast{margin-top:16px;padding:10px 14px;background:#e8f5ee;border:1px solid #1a7f4b;color:#12603a;border-radius:6px;display:none}
.toast.show{display:block}
label{display:block;margin:14px 0}
input[type=text]{font:inherit;padding:6px 10px;border:1px solid #c8d1d9;border-radius:5px;width:260px}
`;

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title} · Reportly</title><style>${STYLE}</style></head>
<body>${NAV}<main>${body}</main></body></html>`;
}

const ROWS = [
  ["Q1 revenue", 412],
  ["Q2 revenue", 388],
  ["Churn cohort", 97],
];

const PAGES = {
  "/dashboard": () =>
    page(
      "Dashboard",
      `<h1>Good afternoon, Dana</h1>
       <p>You have <b id="open-count">3</b> open reports this quarter.</p>`
    ),

  "/reports": () =>
    page(
      "Reports",
      `<h1>Reports</h1>
       <div class="toolbar">
         <button id="print">Print</button>
         <button id="export" class="primary">Export CSV</button>
       </div>
       <table><thead><tr><th>Report</th><th>Rows</th></tr></thead><tbody>
       ${ROWS.map(([n, r]) => `<tr><td>${n}</td><td>${r}</td></tr>`).join("")}
       </tbody></table>
       <script>
         document.getElementById('export').addEventListener('click', function(){
           var csv = 'Report,Rows\\n' +
             ${JSON.stringify(ROWS.map(([n, r]) => `${n},${r}`).join("\n"))};
           var blob = new Blob([csv], {type:'text/csv'});
           var a = document.createElement('a');
           a.href = URL.createObjectURL(blob);
           a.download = 'reports-2026-08.csv';
           document.body.appendChild(a); a.click(); a.remove();
         });
       </script>`
    ),

  "/settings": () =>
    page(
      "Settings",
      `<h1>Settings</h1>
       <label>Display name <input type="text" id="name" value="Dana Marek"></label>
       <label><input type="checkbox" id="digest" checked> Send me the weekly digest</label>
       <button id="save" class="primary">Save</button>
       <div class="toast" id="toast">Settings saved</div>
       <script>
         document.getElementById('save').addEventListener('click', function(){
           // BUG: looks up the wrong element id, so the confirmation never shows.
           var el = document.getElementById(${BUGGY ? "'tost'" : "'toast'"});
           if (el) el.classList.add('show');
         });
       </script>`
    ),
};

createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  const route = path === "/" ? "/dashboard" : path;
  const render = PAGES[route];
  if (!render) {
    res.writeHead(404, { "content-type": "text/html" });
    res.end(page("Not found", "<h1>404</h1>"));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(render());
}).listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `reportly on http://127.0.0.1:${PORT} (bug: ${BUGGY ? "on" : "off"})\n`
  );
});
