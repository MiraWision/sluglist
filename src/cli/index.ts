import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  isSessionDir,
  latestSessionDir,
  readSession,
  sessionName,
} from "../node/read";
import { formatBytes } from "./embed";
import { buildReport } from "./report";
import { createDevServer } from "./server";

/**
 * The sluglist CLI.
 *
 * - `sluglist dev` — a local sidecar that receives feedback artifacts from the
 *   LocalConnector and writes them into `.sluglist/`. Run it alongside your dev
 *   server; a Claude Code skill then reads the folder and fixes the issues.
 * - `sluglist report` — renders a finished session into one self-contained HTML
 *   file you can send to whoever asked for the work.
 */

interface Args {
  command: string;
  dir: string;
  port: number;
  help: boolean;
  /** Positional argument after the command (`report [session-dir]`). */
  target: string;
  /** `-o` output path for `report`. */
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "",
    dir: ".sluglist",
    port: 4477,
    help: false,
    target: "",
    out: "",
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (token === "--port" || token === "-p") {
      args.port = Number.parseInt(rest[++i] ?? "", 10);
    } else if (token === "--dir" || token === "-d") {
      args.dir = rest[++i] ?? args.dir;
    } else if (token === "--out" || token === "-o") {
      args.out = rest[++i] ?? args.out;
    } else if (!token.startsWith("-")) {
      if (args.command) {
        args.target ||= token;
      } else {
        args.command = token;
      }
    }
  }
  return args;
}

const USAGE = `sluglist — local feedback sidecar and session reports

Usage:
  npx sluglist dev [--port <n>] [--dir <path>]
  npx sluglist report [session-dir] [-o <file.html>] [--dir <path>]

Commands:
  dev      Receive artifacts from a LocalConnector and write them to disk.
           Also serves checklists read-only from <dir>/checklists/<name>.json
           at GET /checklists/<name>.json, so the widget can load one without
           copying it into your app's public folder.
  report   Render a session as one self-contained HTML file (offline, no
           external requests) — the proof artifact you send to a client.

Options:
  -p, --port <n>     dev: port to listen on (127.0.0.1 only). Default 4477.
  -d, --dir <path>   Artifact folder. Default .sluglist
  -o, --out <file>   report: output path. Default report.html in the session.
  -h, --help         Show this help.

Pair with a LocalConnector in your app:
  createFeedbackWidget({ project, connectors: [new LocalConnector()] })

Report the newest session, zero config:
  npx sluglist report
`;

/**
 * Resolve which session folder to report on: an explicit path (either the
 * session itself or a folder containing sessions), otherwise the newest
 * session under `--dir`.
 */
async function resolveSessionDir(args: Args): Promise<string | null> {
  if (args.target) {
    const target = resolve(args.target);
    if (await isSessionDir(target)) {
      return target;
    }
    return await latestSessionDir(target);
  }
  const root = resolve(args.dir);
  if (await isSessionDir(root)) {
    return root;
  }
  return await latestSessionDir(root);
}

async function runReport(args: Args): Promise<void> {
  const dir = await resolveSessionDir(args);
  if (!dir) {
    const where = args.target || args.dir;
    process.stderr.write(
      `No session found in ${resolve(where)}.\n` +
        "Pass a session folder explicitly: npx sluglist report <session-dir>\n"
    );
    process.exit(1);
  }

  const bundle = await readSession(dir);
  const result = await buildReport(bundle);
  const out = args.out ? resolve(args.out) : join(dir, "report.html");
  await writeFile(out, result.html, "utf8");

  for (const warning of result.warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
  process.stdout.write(
    `${sessionName(dir)} → ${out}  (${formatBytes(result.bytes)})\n`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || (args.command !== "dev" && args.command !== "report")) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  if (args.command === "report") {
    await runReport(args);
    return;
  }

  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65_535) {
    process.stderr.write(`Invalid --port: ${args.port}\n`);
    process.exit(1);
  }

  // Folder-rename compatibility: the default folder is now `.sluglist/`. If a
  // project still has the old `.snaglist/` from before the rename (and no new
  // folder yet), point it out once — but never rename it automatically.
  if (existsSync(".snaglist") && !existsSync(".sluglist")) {
    process.stderr.write(
      "note: found a legacy `.snaglist/` folder. sluglist now writes to " +
        "`.sluglist/`. Rename it (`mv .snaglist .sluglist`) to keep past " +
        "sessions together, or pass `--dir .snaglist` to keep using it.\n"
    );
  }

  const absDir = resolve(args.dir);
  const host = "127.0.0.1";
  const server = createDevServer({
    dir: args.dir,
    host,
    onFile: ({ sessionId, path, bytes }) => {
      process.stdout.write(`  ← ${sessionId}/${path}  (${bytes} bytes)\n`);
    },
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      process.stderr.write(
        `Port ${args.port} is already in use. Try --port <n>.\n`
      );
    } else {
      process.stderr.write(`Server error: ${error.message}\n`);
    }
    process.exit(1);
  });

  server.listen(args.port, host, () => {
    process.stdout.write(
      `sluglist dev listening on http://${host}:${args.port}\n` +
        `writing feedback to ${absDir}\n` +
        "waiting for reports (Ctrl+C to stop)…\n"
    );
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
