# thingboard 🖼️

**Thingboard** is just a simple **board** for writing **things** down. Frequently when I'm working, I find myself looking for places to jot stuff down to help me think and organize, but I don't want to be shuffling pieces of paper around, and it's nice to be able to copy-paste notes from other tools I use. Thingboard fulfills this need for me by being a board for Post-it style notes I can move and resize. It now syncs in real-time across devices via InstantDB (free tier, zero backend code). Old localStorage data is auto-migrated on first load.

You can try thingboard deployed on [Repl.it](https://thingboard.thesephist.repl.co) or [Vercel](https://thingboard.thesephist.vercel.app/).

Thingboard is a fully static, client-side rendered app built on a small pair of libraries:

- [Torus](https://github.com/thesephist/torus) for UI rendering
- [paper.css](https://thesephist.github.io/paper.css/) for easy aesthetics that match with the rest of my productivity tools.

![Thingboard screenshot](screenshot.png)

## Persistence & Real-time Cloud Sync (2026 update)

Thingboard now uses **[InstantDB](https://www.instantdb.com/)** (`@instantdb/core`) for cloud persistence **with zero backend code**.

- ✅ Real-time sync across all your devices/tabs (core requirement)
- ✅ Excellent offline support (changes queue and sync when back online)
- ✅ Free tier that **never pauses**
- ✅ No authentication / login (personal scratchpad only — see security note below)
- ✅ Works great for future Electron desktop app (same data layer)

### Quick Start (Development)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — your notes now sync in real time.

### Build & Deploy (Netlify / Vercel / etc.)

```bash
npm run build
```

The `dist/` folder is a fully static site. Deploy exactly like before:

- **Netlify**: Connect repo → Build command: `npm run build` → Publish directory: `dist`
- Same for Vercel, Cloudflare Pages, GitHub Pages, etc. Zero config.

### Data Model

Thingboard stores boards and sticky notes in InstantDB:

- `boards`: one document per board, including its cloud-synced name and timestamps.
- `things`: one document per sticky note, including `value`, `x`, `y`, `width`, `height`, and `boardId`.

Each sticky note ("Thing") is still an independent document in the `things` collection. The `boardId` field assigns it to a board, so the app can show one active board at a time while keeping the full board list in the cloud.

### Important: Permissions (No Auth)

Because there is **no authentication**, anyone who has your `APP_ID` can read/write the data.

**For your personal use this is fine and by design right now.**

- By default InstantDB treats all permissions as `true` (open).
- Your app is already configured with the provided App ID.
- No action needed in the dashboard for basic use.
- Later (optional): you can add `instant.perms.ts` + `npx instant-cli push` to lock it down or add simple device-scoped rules if you ever add lightweight auth.

### Migration from Old localStorage

On first load with the new version:
- If your browser still has old localStorage data **and** your InstantDB app is empty, it will automatically bulk-create everything on the default cloud board and clear the old local copy.
- Existing cloud notes without a `boardId` are assigned to the default board.
- Future loads are 100% driven by the cloud.

### Future Electron / Desktop App

The `@instantdb/core` + your Torus logic in `src/main.js` is plain JavaScript. You can share (or symlink) the data layer between the web build and an Electron main/renderer process. Offline + realtime will feel native on desktop. When you're ready, just `npm install electron` and reuse the same `init` + `subscribeQuery` + `transact` calls.

### Files Changed in This Update

- `package.json` + `vite.config.js` (minimal Vite setup — still deploys as static site)
- `src/main.js` (the brains — InstantDB wired in, Torus UI untouched)
- `index.html` (loads Torus global + Vite module entry)
- `public/` (contains the vendored `torus.min.js`, `paper.min.css`, `main.css` so URLs stay the same)
- `.gitignore` (standard for Node/Vite)

Old `main.js` (root) was removed (logic lives in `src/` now).

### Troubleshooting

- "No data appearing": Check browser console for InstantDB errors (wrong APP_ID?).
- Permissions errors later: Open the InstantDB dashboard → your app → Permissions/Sandbox to debug.
- Want to nuke everything and start fresh: In the InstantDB dashboard, delete the app and create a new one, then update the `APP_ID` constant.

Enjoy your cross-device, real-time, zero-backend sticky-note brain! 🧠✨

---

*Original pure-localStorage version lives in git history.*

