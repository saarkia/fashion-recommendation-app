import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const outputPath = resolve(root, "public/assets/RetailNext-Executive-Briefing.pdf");
const briefingPath = "/briefing";

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return port;
}

async function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server or Chrome debugging endpoint may still be starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  for (const command of ["google-chrome", "chromium", "chromium-browser"]) {
    const result = spawnSync("which", [command], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }

  throw new Error("Chrome or Chromium was not found. Set CHROME_PATH to the browser executable.");
}

function createCdpClient(wsUrl) {
  return new Promise((resolveConnect, rejectConnect) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const listeners = new Map();
    let sequence = 0;

    socket.onopen = () => {
      resolveConnect({
        on(method, callback, sessionId = "") {
          const key = sessionId ? `${sessionId}:${method}` : method;
          const callbacks = listeners.get(key) || [];
          callbacks.push(callback);
          listeners.set(key, callbacks);
        },
        send(method, params = {}, sessionId = "") {
          const id = ++sequence;
          const message = { id, method, params };
          if (sessionId) message.sessionId = sessionId;
          socket.send(JSON.stringify(message));
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolveSend, rejectSend });
          });
        },
        close() {
          socket.close();
        }
      });
    };

    socket.onerror = () => rejectConnect(new Error(`Could not connect to Chrome DevTools at ${wsUrl}`));
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolveSend, rejectSend } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          rejectSend(new Error(message.error.message || JSON.stringify(message.error)));
        } else {
          resolveSend(message.result || {});
        }
        return;
      }

      const keys = [
        message.sessionId ? `${message.sessionId}:${message.method}` : "",
        message.method
      ].filter(Boolean);
      for (const key of keys) {
        for (const callback of listeners.get(key) || []) {
          callback(message.params || {}, message.sessionId);
        }
      }
    };
  });
}

async function waitForRuntimeValue(sendPage, expression, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await sendPage("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (response.result?.value) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for page condition: ${expression}`);
}

async function renderPdf() {
  const appPort = await getFreePort();
  const debugPort = await getFreePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "retailnext-briefing-pdf-"));
  const chromePath = chromeExecutable();
  let appProcess;
  let chromeProcess;
  let cdp;

  try {
    appProcess = spawn(process.execPath, ["server/index.mjs"], {
      cwd: root,
      env: { ...process.env, PORT: String(appPort) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    appProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitForHttp(`http://127.0.0.1:${appPort}${briefingPath}`);

    chromeProcess = spawn(chromePath, [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--disable-gpu",
      "--no-default-browser-check",
      "--no-first-run",
      "about:blank"
    ], {
      stdio: ["ignore", "ignore", "pipe"]
    });
    chromeProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);

    const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
    cdp = await createCdpClient(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const sendPage = (method, params = {}) => cdp.send(method, params, sessionId);

    await sendPage("Page.enable");
    await sendPage("Runtime.enable");
    await sendPage("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sendPage("Emulation.setEmulatedMedia", { media: "print" });
    await sendPage("Page.navigate", { url: `http://127.0.0.1:${appPort}${briefingPath}` });
    await waitForRuntimeValue(sendPage, "document.readyState === 'complete'");
    await waitForRuntimeValue(sendPage, "Boolean(document.querySelector('#architectureDetail')?.textContent.trim())");
    await waitForRuntimeValue(sendPage, "Array.from(document.images).every((image) => image.complete)", 10000);

    await mkdir(dirname(outputPath), { recursive: true });
    const pdf = await sendPage("Page.printToPDF", {
      printBackground: true,
      displayHeaderFooter: false,
      landscape: false,
      paperWidth: 15,
      paperHeight: 10.42,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      scale: 1,
      preferCSSPageSize: false
    });
    await writeFile(outputPath, Buffer.from(pdf.data, "base64"));
    console.log(`Rendered ${outputPath}`);
  } finally {
    if (cdp) cdp.close();
    if (chromeProcess && !chromeProcess.killed) chromeProcess.kill();
    if (appProcess && !appProcess.killed) appProcess.kill();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

renderPdf().catch((error) => {
  console.error(error);
  process.exit(1);
});
