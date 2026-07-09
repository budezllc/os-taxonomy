# Micro Lessons

Browse primary/elementary **micro-topics** in learning order, read short tutorials, take quizzes, and track progress in your browser.

This project packages a static learning site on top of the open [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) dataset (1,590 topics, prerequisite graph, curriculum alignment).

The **hosted website**, **AI lesson/quiz generation**, and **personalized lessons for your child** were created by [Kei Sakai](https://kunani.dev) ([@KeiSakaiX](https://x.com/KeiSakaiX)).

## Features

- **Curriculum path** — topics ordered by age and hard prerequisites so kids unlock the next idea when they’re ready
- **AI-generated lessons & quizzes** — locally, an AI agent writes a short read-aloud tutorial plus a quick quiz for each micro-topic (OpenAI-compatible APIs: LM Studio, Ollama, OpenAI, etc.)
- **Personalized for your child** — in Settings, add their **name**, **interests** (cookies, Roblox, sewing…), and **pets** (name + type). When you generate in **Personalized** mode, lessons weave those in naturally — addressing them by name, using pet names in examples, and tying ideas to what they already love — for fully personalized lessons for your child
- **Two lesson caches** — **Standard** (generic, ships to GitHub Pages) vs **Personalized** (local only, gitignored; never published)
- **Progress in the browser** — mark complete, export/import JSON; no accounts required

The hosted GitHub Pages site serves pre-generated **standard** lessons. Full AI generation and personalization run when you use the app locally.

## Hosted site (GitHub Pages)

The public site is a **static** export — no server, no accounts, no API keys:

- Browse and filter topics; open pre-generated lessons and quizzes
- Mark lessons complete — progress stays in **your browser** (`localStorage`)
- **Export / Import** progress JSON to move between devices
- Generation UI (Settings, Pregenerate) is **not** included on the hosted site

### Deploy checklist

1. Commit the app under `web/`, the workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml), and the **standard** lesson cache [`web/data/lessons-cache.json`](web/data/lessons-cache.json) (~3.5 MB).
2. Push to `main` or `master` (or run the workflow manually).
3. In the GitHub repo: **Settings → Pages → Source → GitHub Actions**.
4. After the workflow succeeds, the site is at:

`https://<user>.github.io/<repo>/`

Do **not** commit `web/data/lessons-cache-personalized.json` (gitignored). It can contain a child’s name, pets, and likes for local use only.

## Run locally (full generation + personalization)

Locally you get Settings, Pregenerate, and Generate/Regenerate so an AI agent can create or refresh lessons and quizzes. Keys stay in the browser (`localStorage`) — never in env files or the repo.

1. Open **Settings → Learner profile** — child’s name, pets, and interests  
2. Choose **Lesson cache → Personalized** for child-specific lessons, or **Standard** for the public cache  
3. Generate one lesson, or use **Pregenerate** to batch the curriculum  

```bash
cd web
npm install
npm run prepare-data
npm run dev
```

See [`web/README.md`](web/README.md) for Settings details.

After regenerating **standard** lessons, commit updates to `web/data/lessons-cache.json` so the hosted site picks them up. Personalized lessons stay on your machine.

```bash
# from repo root — static export → web/out
npm run build:pages
```

## Taxonomy data

Source JSON lives in [`data/`](data/):

| File | Contents |
|---|---|
| [`data/topics.json`](data/topics.json) | Micro-topics (nodes) |
| [`data/dependencies.json`](data/dependencies.json) | Prerequisite edges |
| [`data/curriculum-standards.json`](data/curriculum-standards.json) | Source standards |
| [`data/clusters.json`](data/clusters.json) | Domain summaries |
| [`data/manifest.json`](data/manifest.json) | Counts + checksums |

Validate:

```bash
npm run validate
```

## Security notes

- No server-side AI keys. Local generation uses Settings → browser storage only.
- `.env` / `.env.local` are gitignored; [`web/.env.example`](web/.env.example) is documentation only.
- Personalized lesson cache and progress files are gitignored and stripped from Pages builds.
- Never force-add ignored secret or personalized files.

## Attribution

If you use this dataset, cite it as in [`CITATION.cff`](CITATION.cff):

> Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com · licensed under ODbL 1.0 (database) and CC BY-SA 4.0 (content). Authors: Guillaume Boniface-Chang; Generative Spark, Inc. (Marble).

See [LICENSE](LICENSE), [LICENSE-CONTENT](LICENSE-CONTENT), and [PROVENANCE.md](PROVENANCE.md).

## License

| Layer | License |
|---|---|
| Database (structure, IDs, relationships) | [ODbL 1.0](LICENSE) |
| Marble-authored text content | [CC BY-SA 4.0](LICENSE-CONTENT) |
| `curriculum-standards.json` | Upstream licenses — [PROVENANCE.md](PROVENANCE.md) |

Micro Lessons hosted site, AI-generated lessons & quizzes, and personalized child lessons © [Kei Sakai](https://kunani.dev) · [@KeiSakaiX](https://x.com/KeiSakaiX)
