# Micro Lessons (web app)

Next.js app over the Marble Skill Taxonomy: age-ordered micro-topics, prerequisite unlocks, quizzes, and (when run locally) **AI-generated lessons and quizzes** — including **fully personalized** versions for your child.

The hosted website and personalized lesson features were created by [Kei Sakai](https://kunani.dev) ([@KeiSakaiX](https://x.com/KeiSakaiX)).

## Features (local)

- **AI agent lessons & quizzes** — generate a short tutorial parents can read aloud, plus a quiz grounded in the taxonomy evidence
- **Personalized for your child** — profile their **name**, **interests**, and **pets**; the agent folds those into examples so ideas feel familiar (name in the story, pet names in scenes, hobbies as analogies)
- **Standard vs personalized cache** — keep a generic cache for GitHub Pages, and a separate local personalized cache that never ships publicly
- **Pregenerate** — batch-generate many topics into the selected cache

## Two modes

| | **GitHub Pages (hosted)** | **Private LAN (Docker)** | **Local development** |
|---|---|---|---|
| Build | `npm run build:pages` | `npm run build:private` + Docker | `npm run dev` |
| UI | Dashboard, lessons, quiz, progress | Same (personalized text) | Full UI + Settings + Pregenerate + Generate |
| Lessons | Shipped `lessons-cache.json` | Baked `lessons-cache-personalized.json` | Both caches (toggle in Settings) |
| Progress | Browser `localStorage` (export/import) | Same | Same |
| AI keys | Not used | Not used | Settings → `localStorage` only |

## Local development

```bash
cd web
npm install
npm run prepare-data   # copies taxonomy + lessons into public/data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Settings

- **Lesson cache** — **Standard** writes `data/lessons-cache.json` (commit this for Pages). **Personalized** writes `data/lessons-cache-personalized.json` (gitignored) and uses the learner profile for totally personalized lessons for your child.
- **Learner profile** — child’s name, pets (name + type), and interests/likes (browser only; used when Personalized is selected).
- **AI connection** — OpenAI-compatible Base URL, API key, model. Keys never leave the browser.

No server env is required for AI. See [`.env.example`](.env.example).

## Static / GitHub Pages build

```bash
cd web
# optional locally: NEXT_PUBLIC_BASE_PATH=/your-repo-name
npm run build:pages
# output: web/out
```

CI ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)) sets:

- `NEXT_PUBLIC_STATIC_SITE=true` — hides generation UI; empties personalized cache in the export
- `NEXT_PUBLIC_BASE_PATH=/<repo>` — project Pages URL prefix

Enable **Settings → Pages → GitHub Actions** on the repository after the first successful workflow run.

Site URL: `https://<user>.github.io/<repo>/`

## Private personalized static site (LAN / Portainer)

For a child-specific site on your home network — personalized lessons baked into a static nginx container, no AI at runtime.

**Prerequisites:** `web/data/lessons-cache-personalized.json` exists (generate locally with **Settings → Personalized**).

### 1. Build static export (your PC)

```powershell
cd web
npm run build:private
# output: web/out (includes personalized JSON under out/data/)
```

Or from the repo root: `npm run build:private` (no `cd` needed).

This sets `NEXT_PUBLIC_PERSONALIZED_SITE=true`, copies the real personalized cache, and hides Settings / Pregenerate / Generate like GitHub Pages.

### 2. Build Docker image

**Must run from the repo root** — build context needs `data/` + `web/`. If you're still in `web/` after step 1, go up one level first.

```powershell
cd ..
docker build -f web/Dockerfile.private -t micro-lessons-private:latest .
```

Export for Umbrel (copy the tar to the host, then load there):

```powershell
docker save micro-lessons-private:latest -o micro-lessons-private.tar
```

Or run the all-in-one script from the repo root:

```powershell
.\package-private.bat
```

In Cursor: **Terminal → Run Task… → Package private + Docker**

On Umbrel / Portainer host:

```powershell
docker load -i micro-lessons-private.tar
```

### 3. Deploy in Portainer (manual)

1. Open Portainer on Umbrel: `http://neotheone.local:9000`
2. **Stacks → Add stack** — paste or upload [`docker-compose.private.yml`](../docker-compose.private.yml)
3. Ensure `micro-lessons-private:latest` exists on the host
4. Deploy — publishes port **8080** on the LAN

Daughter's PC: **`http://neotheone.local:8080`** (or the host's LAN IP).

Progress stays in **her browser** localStorage (export/import works). Do **not** port-forward 8080 to the internet.

### Refreshing lessons

After regenerating personalized lessons locally:

```powershell
cd web
npm run build:private
cd ..
docker build -f web/Dockerfile.private -t micro-lessons-private:latest .
# redeploy stack in Portainer (recreate container)
```

## Data

| File | Role |
|---|---|
| [`../data/topics.json`](../data/topics.json) | Taxonomy topics |
| [`../data/dependencies.json`](../data/dependencies.json) | Prerequisites |
| [`data/lessons-cache.json`](./data/lessons-cache.json) | **Published** lessons (~3.5 MB; track in git) |
| `data/lessons-cache-personalized.json` | Local personalized lessons (**gitignored**) |
| `data/progress.json` | Legacy file progress (**gitignored**; UI uses `localStorage`) |

`npm run prepare-data` / `build:pages` copies taxonomy + the **standard** lesson cache into `public/data/` (generated copies are gitignored).

## Security

- Do not commit `.env`, `.env.local`, API keys, or `lessons-cache-personalized.json`.
- Spot-check `lessons-cache.json` before publishing — it should not contain personal names from the learner profile.
- Pages builds never ship the personalized cache (forced empty when `NEXT_PUBLIC_STATIC_SITE=true`).
- Private Docker builds **include** personalized JSON in the image only — never commit `lessons-cache-personalized.json` or push the image to a public registry.

Hosted website & personalized lessons © [Kei Sakai](https://kunani.dev) · [@KeiSakaiX](https://x.com/KeiSakaiX)
