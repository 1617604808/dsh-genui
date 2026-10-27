# dsh-go integration

There are two compatible paths. An older App can display a read-only native projection of supported `render_ui` results. The complete integration uses the mobile bundle plus the companion App changes: installing this npm package alone cannot add a renderer to an existing native App.

## Complete renderer

`lib/assets/mobile-runtime.js` bundles the shared GenUI renderer and React without the web host's module loader. It supports the built-in component families, including forms, quizzes, computed values, tables, tabs, SVG, plots, ECharts, Mermaid and 3D. Engine bundles and KaTeX fonts are packaged locally; no CDN or host web session is required to load them. External images/audio/video still require reachable media URLs. Relative web-origin media URLs must be resolved by the embedding host; they are not phone filesystem paths. Custom components registered by other web plugins are not included in this bundle.

Build and install the offline assets:

```sh
pnpm install --frozen-lockfile
pnpm run build
node scripts/install-mobile.mjs /path/to/app/assets/genui
```

Declare `assets/genui/` in the Flutter assets list and apply the companion App integration before building the App. Keep the generated runtime, five engine bundles, HTML entry, manifest and license notices together. The install command validates the built inputs before copying and writes a SHA-256 manifest. Re-run it whenever the renderer changes.

The App integration connects:

- Closed `dsh-ui` fences and successful `render_ui` tool results, including cards retained outside collapsed turns.
- Model actions through the originating session's send callback using `[genui-action] <action> <JSON payload>`; stale, background and busy-session actions are gated.
- Native clipboard and session-scoped workspace file previews.
- Session panels with ordered replacement/append, replay deduplication, tab merging and restart restoration.
- Durable, secret-free control state, separated by host, session, message and fence/tool identity.
- Theme, font scale, measured height, expanded views, renderer recovery and a bounded number of live WebViews.

Incomplete streaming fences retain the App's loading/interruption UI. Invalid documents or asset failures offer a retry and the original JSON. The full renderer does not translate advanced components into native approximations.

## Bridge protocol v1

Load the packaged `index.html`, register a `GenuiNative.postMessage(string)` channel, and call `window.__GenuiMobile__.render(frame)` after page load. Serialize `frame` as JSON data; never interpolate model text into HTML or executable JavaScript.

```json
{"version":1,"id":"opaque-card-id","token":"unguessable-mount-token","spec":{"items":[{"type":"button","label":"Continue","action":"continue"}]},"theme":"light","locale":"en","canAct":true,"canOpenFiles":false,"textScale":1}
```

Optional `state` contains the native owner's saved interaction state. Optional `panels` supplies ordered panel documents instead of `spec`; append operations use the same tab-aware merge as web panels. Keep a panel's `id` stable across appends and change it on replacement.

Events carry `version`, `id`, `token` and `type`. Supported events are `ready`, `height`, `state`, `action`, `link`, `file`, `clipboard`, and `error`. Validate ownership, type and size on the native side. A clipboard request also has `request` and `text`; acknowledge it with `window.__GenuiMobile__.reply({id,token,request,ok})`. Other events require no acknowledgement. This protocol gives documents no host credentials, JavaScript execution service or arbitrary native RPC access.

On teardown call `dispose()`, discard the bridge owner, and destroy the native WebView after it detaches. Persist secret-free `state` events before resuming in a fresh renderer. The packaged CSP blocks inline scripts, frames and network requests; lazy engines load from the package directory. External link navigation is delegated to the native host.

## Older App compatibility

`render_ui` retains the complete GenUI fields at the metadata root. When the entire document fits the native subset, it also includes `presentationMeta["dsh-go/view"]`. This path needs no App patch and handles layout, text, metrics, basic charts, tables, progress, steps, key/value lists and callouts.

Advanced or mixed interactive documents receive no partial projection. Native limits are 8 KiB UTF-8, 40 nodes, depth 6 and 16 children per layout, with additional per-component limits. The complete mobile renderer is a separate path and is not restricted to this projection's component vocabulary.

## Verification

```sh
pnpm run check
BROWSER_BIN=/path/to/chrome pnpm run check:mobile-browser
GENUI_BROWSER_TRANSPORT=file BROWSER_BIN=/path/to/chrome pnpm run check:mobile-browser
```

The browser check exercises the built bundle, offline lazy engines, bridge ownership, native clipboard acknowledgement, password exclusion, state restoration, action gating, theme changes and teardown. The companion App tests cover fence identity, collapsed tool-card placement, panel ordering/replay/restore, native bridge validation and background recovery with a fake platform WebView. These checks do not replace Android device acceptance of touch/scroll, GPU availability, renderer loss and the installed App's local/SSH/relay connections.
