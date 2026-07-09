# Micro Lessons (web app)

Next.js app over the Marble Skill Taxonomy: age-ordered micro-topics, prerequisite unlocks, quizzes, and (when run locally) **AI-generated lessons and quizzes** — including **fully personalized** versions for your child.

The hosted website and personalized lesson features were created by [Kei Sakai](https://kunani.dev) ([@KeiSakaiX](https://x.com/KeiSakaiX)).

## Features (local)

- **AI agent lessons & quizzes** — generate a short tutorial parents can read aloud, plus a quiz grounded in the taxonomy evidence
- **Personalized for your child** — profile their **name**, **interests**, and **pets**; the agent folds those into examples so ideas feel familiar (name in the story, pet names in scenes, hobbies as analogies)
- **Standard vs personalized cache** — keep a generic cache for GitHub Pages, and a separate local personalized cache that never ships publicly
- **Pregenerate** — batch-generate many topics into the selected cache

## Two modes

| | **GitHub Pages (hosted)** | **Local development** |
|---|---|---|
| Build | `npm run build:pages` | `npm run dev` |
| UI | Dashboard, lessons, quiz, progress | Full UI + Settings + Pregenerate + Generate |
| Lessons | Shipped `data/lessons-cache.json` | Same + optional `lessons-cache-personalized.json` |
| Progress | Browser `localStorage` (export/import) | Same |
| AI keys | Not used | Settings → `localStorage` only |

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

Hosted website & personalized lessons © [Kei Sakai](https://kunani.dev) · [@KeiSakaiX](https://x.com/KeiSakaiX)
