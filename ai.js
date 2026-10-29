// "Auto" flashcards: turns notes (or just a topic) into cards using the person's own Claude or
// ChatGPT subscription, through the official command-line apps signed in on this computer:
// Claude Code (`claude`) for Claude Pro/Max, and Codex (`codex`) for ChatGPT Plus/Pro.
// No API keys: each app keeps its own sign-in, and usage counts toward the person's plan.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROVIDERS = {
  claude: {
    name: 'Claude',
    app: 'Claude Code',
    bin: 'claude',
    install: 'curl -fsSL https://claude.ai/install.sh | bash',
    login: 'claude auth login --claudeai'
  },
  openai: {
    name: 'ChatGPT',
    app: 'Codex',
    bin: 'codex',
    install: 'npm install -g @openai/codex',
    login: 'codex login'
  }
};
const MAX_MATERIAL = 50000; // characters of pasted notes
const FRONT_MAX = 1000;
const BACK_MAX = 1000;
const GENERATE_TIMEOUT = 3 * 60 * 1000;

const SYSTEM = `You write flashcards for spaced-repetition study, like Anki.
Each card tests one fact, definition or idea. The front is a clear question or prompt that makes sense on its own; the back is a short, correct answer (a phrase or one or two sentences).
If the user pastes notes, base the cards only on those notes and cover the most important points first. If they give just a topic, cover its core ideas accurately.
Avoid yes/no questions, and never put the answer on the front. Write in the same language as the material.`;

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: { front: { type: 'string' }, back: { type: 'string' } },
        required: ['front', 'back'],
        additionalProperties: false
      }
    }
  },
  required: ['cards'],
  additionalProperties: false
};

function userPrompt(material, count) {
  return `Make up to ${count} flashcards (fewer if the material is short) from this:\n\n<material>\n${material}\n</material>`;
}

// ---------- finding the CLIs ----------
// Apps opened from the Dock don't get the terminal's PATH, so ask the login shell for it once.
let shellPathPromise = null;
function shellPath() {
  if (process.platform === 'win32') return Promise.resolve('');
  if (!shellPathPromise) {
    shellPathPromise = new Promise((resolve) => {
      execFile(process.env.SHELL || '/bin/zsh', ['-ilc', 'echo "__PATH__$PATH"'], { timeout: 8000 }, (_err, out) => {
        const m = /__PATH__(.*)/.exec(out || '');
        resolve(m ? m[1].trim() : '');
      });
    });
  }
  return shellPathPromise;
}

async function childEnv() {
  const home = os.homedir();
  const extra = [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin'];
  const PATH = [await shellPath(), process.env.PATH, ...extra].filter(Boolean).join(path.delimiter);
  return { ...process.env, PATH };
}

function findBin(bin, env) {
  const names = process.platform === 'win32' ? [bin + '.cmd', bin + '.exe', bin] : [bin];
  for (const dir of env.PATH.split(path.delimiter)) {
    for (const n of names) {
      const f = path.join(dir, n);
      try {
        fs.accessSync(f, fs.constants.X_OK);
        return f;
      } catch (e) {
        // not here, keep looking
      }
    }
  }
  return null;
}

function run(file, args, { input = '', env, cwd, timeout = 15000 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const child = spawn(file, args, { env, cwd, shell: process.platform === 'win32' });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on('error', () => {}); // the CLI may exit before reading everything
    child.stdin.end(input);
  });
}

const lastLine = (text) => String(text || '').trim().split('\n').filter(Boolean).pop() || '';

// ---------- status: installed? signed in? ----------
// returns { installed, loggedIn, account, commands }
async function status(provider) {
  return { ...(await checkCli(provider)), commands: { install: PROVIDERS[provider].install, login: PROVIDERS[provider].login } };
}
async function checkCli(provider) {
  const p = PROVIDERS[provider];
  const env = await childEnv();
  const bin = findBin(p.bin, env);
  if (!bin) return { installed: false, loggedIn: false };

  if (provider === 'claude') {
    const r = await run(bin, ['auth', 'status', '--json'], { env });
    try {
      const s = JSON.parse(r.stdout);
      const plan = s.subscriptionType ? ` (${s.subscriptionType[0].toUpperCase()}${s.subscriptionType.slice(1)})` : '';
      return { installed: true, loggedIn: !!s.loggedIn, account: s.authMethod === 'claude.ai' ? `Claude subscription${plan}` : 'an Anthropic API account' };
    } catch (e) {
      return { installed: true, loggedIn: false };
    }
  }
  const r = await run(bin, ['login', 'status'], { env });
  const text = `${r.stdout}\n${r.stderr}`;
  const loggedIn = r.code === 0 && /logged in/i.test(text);
  return { installed: true, loggedIn, account: /chatgpt/i.test(text) ? 'ChatGPT subscription' : 'an OpenAI API key' };
}

// ---------- generating ----------
async function generateWithClaude(bin, env, cwd, material, count) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(CARD_SCHEMA),
    '--system-prompt', SYSTEM,
    '--tools', '', // no file or shell access: it only writes cards
    '--safe-mode', // ignore the person's own Claude Code customizations
    '--no-session-persistence'
  ];
  const r = await run(bin, args, { input: userPrompt(material, count), env, cwd, timeout: GENERATE_TIMEOUT });
  if (r.timedOut) throw new Error('Claude took too long. Try shorter notes or fewer cards.');
  let out;
  try {
    out = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(lastLine(r.stderr) || lastLine(r.stdout) || 'Claude Code stopped unexpectedly.');
  }
  if (out.is_error) throw new Error(out.result || 'Claude Code reported an error.');
  return out.structured_output ? out.structured_output.cards : JSON.parse(out.result).cards;
}

async function generateWithCodex(bin, env, cwd, material, count) {
  const schemaFile = path.join(cwd, 'schema.json');
  const outFile = path.join(cwd, 'cards.json');
  fs.writeFileSync(schemaFile, JSON.stringify(CARD_SCHEMA));
  const args = [
    'exec',
    '--ignore-user-config', // the person's Codex settings (e.g. a model their plan can't use) shouldn't break this
    '--skip-git-repo-check',
    '--sandbox', 'read-only',
    '--ephemeral',
    '--output-schema', schemaFile,
    '-o', outFile,
    '-'
  ];
  const input = `${SYSTEM}\nDon't run commands or read files; just reply with the cards.\n\n${userPrompt(material, count)}`;
  const r = await run(bin, args, { input, env, cwd, timeout: GENERATE_TIMEOUT });
  if (r.timedOut) throw new Error('ChatGPT took too long. Try shorter notes or fewer cards.');
  if (r.code !== 0) {
    const errLine = r.stderr.split('\n').filter((l) => l.startsWith('ERROR:')).pop();
    let msg = errLine ? errLine.slice(6).trim() : lastLine(r.stderr);
    try {
      msg = JSON.parse(msg).error.message;
    } catch (e) {
      // not JSON; keep the plain line
    }
    throw new Error(msg || 'Codex stopped unexpectedly.');
  }
  return JSON.parse(fs.readFileSync(outFile, 'utf8')).cards;
}

// returns { cards: [{ front, back }] } or { error }
async function generateCards(provider, material, count) {
  const p = PROVIDERS[provider];
  const text = String(material || '').trim();
  if (!text) return { error: 'Paste some notes or type a topic first.' };
  if (text.length > MAX_MATERIAL) {
    return { error: `That's ${text.length.toLocaleString()} characters; the limit is ${MAX_MATERIAL.toLocaleString()}. Split your notes into parts.` };
  }
  const n = [5, 10, 20].includes(count) ? count : 10;
  const env = await childEnv();
  const bin = findBin(p.bin, env);
  if (!bin) return { error: `${p.app} isn't installed. Press “change” to set it up.`, needsSetup: true };

  // run in an empty folder so the CLI never sees any project files
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'promise-pet-ai-'));
  try {
    const raw = provider === 'openai' ? await generateWithCodex(bin, env, cwd, text, n) : await generateWithClaude(bin, env, cwd, text, n);
    const cards = (Array.isArray(raw) ? raw : [])
      .map((c) => ({ front: String(c.front || '').trim().slice(0, FRONT_MAX), back: String(c.back || '').trim().slice(0, BACK_MAX) }))
      .filter((c) => c.front && c.back);
    if (!cards.length) return { error: 'No cards came back. Try adding more detail to your notes.' };
    return { cards };
  } catch (err) {
    console.error('card generation failed', err);
    if (err instanceof SyntaxError) return { error: `${p.name} sent back cards I couldn't read. Try again.` };
    return { error: `${p.name}: ${err.message}` };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

// Opens Terminal (macOS) running the install or sign-in command; elsewhere the page shows it to copy.
function openInTerminal(provider, step) {
  const p = PROVIDERS[provider];
  const command = step === 'install' ? p.install : p.login;
  if (process.platform !== 'darwin') return false;
  execFile('osascript', ['-e', 'tell application "Terminal" to activate', '-e', `tell application "Terminal" to do script ${JSON.stringify(command)}`]);
  return true;
}

module.exports = { PROVIDERS, status, generateCards, openInTerminal, FRONT_MAX, BACK_MAX };
