# Fluid Tabs documentation

The Next.js / Fumadocs website for react-native-collapsible-fluid-tabs.

Live site: [fluid-tabs.vercel.app](https://fluid-tabs.vercel.app).

The site lives in `docs/` in the package repository. It has its own npm lockfile and dependencies, separate from the native example’s Yarn workspace.

## Run locally

Use Node.js 22 or later (developed and checked with Node.js 24).

```sh
cd docs
npm ci
npm run dev
```

Open http://localhost:3000. To use another port: `npm run dev -- --port 3015`.

- `/` — landing page and framed demo
- `/docs` — guides, search, and API reference
- `/examples` — interactive example
- `/studio` — local recording and screenshot preview studio (excluded from indexing)

## Add your new recordings

1. Open `/studio` and choose an MP4, WebM, MOV, GIF, or screenshot. This preview stays in the browser; it does not upload or publish the file.
2. Try the black or silver iPhone 18 Pro frame and a white, mist, graphite, or black backdrop. Fullscreen is useful for presenting or capturing the framed result.
3. Put the finished media in `public/demos/`.
4. Update the first entry in `lib/demos.ts`:

```ts
{
  id: 'profile',
  title: 'The profile',
  description: 'A collapsing header and a connected feed.',
  video: '/demos/profile.mp4',
  poster: '/demos/profile-poster.png',
  fit: 'contain',
}
```

For a GIF or screenshot, use `image: '/demos/profile.gif'` instead of `video`. No layout edits are needed. The homepage and examples page use the same first entry. Video controls remain available and recordings do not autoplay.

The default preview is an interactive Expo web export of the real example, served in an iframe. React Native Web renders the screen, and the library runs its own tabs and scrolling. This bundle updates when you export and sync the example; it does not watch the library source. The website supplies the bezel and a transparent status overlay. Its iframe declares a simulated top safe area that the example applies only inside the phone preview, so content can scroll behind the notch. Standalone web and native use their normal safe areas. The small `public/demo/frame.css` overlay prevents fractional-pixel seams when the preview is scaled, without changing measured heights or gesture coordinates.

See `public/demos/README.md` for media guidance.

## Edit the docs

Write MDX in `docs/content/docs/` from the repository root (or `content/docs/` from this folder). Each folder's `meta.json` controls navigation order. The site’s “Edit this page” links open the relevant source file on GitHub; generated API pages link to their TypeScript source comments.

Open a PR against `main`. Review the Vercel preview and the Documentation check before merging. Merging to `main` deploys the site automatically. Fork previews require a maintainer’s authorization.

Six API pages are generated from the library's TypeScript interfaces, so props remain searchable and are included in the Markdown/LLM endpoints. To refresh those pages, peer requirements, and the existing web demo:

```sh
npm run docs:sync
# Refresh API pages without replacing the embedded demo:
npm run docs:sync -- --skip-demo
# Check for API/peer drift without writing files:
npm run docs:check
# Or specify a different library folder:
npm run docs:sync -- "C:/path/to/react-native-collapsible-fluid-tabs"
```

The default source is the parent repository (`..`). This command only reads that library; it writes into this docs project. It does not build or edit the native example.

Generated files: `lib/generated/library.json` and six files under `content/docs/api/` (container, tab, tab-bar, header-values, tab-bar-values, ref). Handwritten guides, hooks, and navigation files are preserved. Review guides and runnable examples when the native API changes.

The demo copier uses an existing `example/dist` web export. Export a fresh web build in the library project before syncing when the example has changed. Previously copied hashed assets are retained so an open preview can finish loading. `docs:check` reads the parent library source and runs in GitHub’s Documentation check. The Vercel build uses the committed generated files and demo bundle.

## Checks

```sh
npm run check
```

Runs route/type checking, ESLint, and a production build. The copied Expo bundle is excluded from this site's linting.

With the library folder available, run `npm run docs:check` to detect stale API pages and `npm run docs:examples` to compile the complete quick-start, provider, hook, and header pass-through examples against its built declarations. Run `yarn prepare` in the library first. Partial composition snippets are illustrative and are reviewed separately.

Search uses the site's Fumadocs index through a Beui command palette. There is no paid search service or API key. Content is also exposed at `/llms.txt`, `/llms-full.txt`, and per-page Markdown URLs.

## Deployment

The existing `fluid-tabs` Vercel project connects to this GitHub repository:

- Root Directory: `docs`
- Framework: Next.js
- Production branch: `main`
- Node.js: 24.x
- Install: `npm ci`
- Build: `npm run build`

Pull requests get preview deployments. Merged changes deploy to [fluid-tabs.vercel.app](https://fluid-tabs.vercel.app); this does not publish an npm release. The project retains its domain and Vercel Analytics history.

After connecting a custom domain, set `SITE_URL` to its full HTTPS URL and redeploy. Otherwise metadata uses Vercel’s production project URL.

## Visual sources

- beUI tabs, animated sidebar navigation, command palette, and circular theme toggle. The sidebar keeps Fumadocs routing and Base UI disclosures. The command palette uses Base UI for modal focus management and the Fumadocs search index for results.
- Inter and Geist Mono, self-hosted through Next.js Google Fonts.
- Reicon icons, imported individually.
- GitHub, React, Expo, npm, X, and Shopify brand SVGs recovered from the Reicon catalog at `62511d9b07f91be25801a8a014323b9e5e331a09`, the parent of the supplied removal commit.
- Official Legend logomark from legendapp.com, displayed beside Legend List.
- Official Software Mansion monochrome symbol from brand.swmansion.com, displayed beside Reanimated.
- iPhone 18 Pro bezel PNGs with a CSS screen mask. Asset sources and terms are recorded in `public/devices/sources.json` and `THIRD_PARTY_NOTICES.md`.

See `THIRD_PARTY_NOTICES.md` and `public/brands/sources.json` for attribution and asset provenance.
