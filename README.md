# X Archive Daemon

Kisa aciklama: X uzerinden post toplayan, bunlari yerel SQLite arsivine yazan ve MCP ile ajanlara kullandiran daemon tabanli bir arsivleme ve akilli arama projesi.

X Archive Daemon archives posts from X into a local SQLite database, exposes them through a daemon-first architecture, and optionally adds a local semantic analysis layer for smarter retrieval.

## Install First

If you work with coding agents, the easiest setup flow is:

1. Give the repository link to the agent.
2. Ask the agent to install dependencies.
3. Ask the agent to create the local secret file.
4. Ask the agent to start the daemon and the MCP bridge.

Manual setup:

```bash
npm install
```

Create `.secrets/x.json`:

```json
{
  "authMode": "bearer_token",
  "bearerToken": "YOUR_X_BEARER_TOKEN"
}
```

Start the daemon:

```bash
npm run daemon:start
```

Start the MCP bridge:

```bash
npm run mcp:start
```

## What This Project Does

This project has three layers:

- `ingest`
  - fetch posts from X
  - store them in SQLite
- `analysis`
  - optional
  - adds local embeddings, topic labels, and educational scoring
- `semantic search`
  - searches analyzed posts locally
  - gives the agent a small, relevant candidate set

Scenario:

- `ingest` = put boxes into storage
- `analysis` = attach labels to the boxes
- `semantic search` = find the right boxes quickly

## Architecture

- `daemon`
  - the real execution engine
  - exposes:
    - `GET /health`
    - `GET /tools`
    - `POST /invoke`
- `MCP`
  - thin stdio bridge for agents
  - exposes the same tools to the model
- `SQLite`
  - stores posts, scopes, sync runs, billing estimates, and optional analysis results

## Core Features

### 1. Smart, low-cost ingest

The system avoids paying twice for the same coverage.

Example:

- first you fetch the latest `50`
- later you ask for the latest `100`
- it does not re-fetch the first `50`
- it fetches only the missing `50`

This works for:

- `latest N` timeline
- `latest N` original posts
- exact repeated date windows
- exact repeated search queries

### 2. Original posts by default

When a user generically says "fetch posts" or "archive tweets", the default tool is:

- `ingest.accounts.original_backfill`

This excludes:

- replies
- retweets
- quote tweets

That keeps the archive cleaner and cheaper.

### 3. Media URLs are stored, files are not downloaded

If a post contains images:

- files are not downloaded
- only `mediaUrls` are stored

This keeps disk and network usage low.

### 4. Optional analysis layer

Analysis is off by default.

That means:

- you can archive posts without analyzing them
- you can analyze the same archive later
- old and newly ingested posts are both supported

### 5. Local semantic search

Once analysis exists, you can search with natural language prompts like:

- "teaching posts about coding"
- "monolith vs microservices"
- "backend and architecture advice"

The system then:

- searches the analyzed local archive
- scores candidates locally
- lets the agent work on a narrow, relevant subset

## Tool Groups

- `sources.accounts.resolve`
- `ingest.accounts.backfill`
- `ingest.accounts.original_backfill`
- `ingest.accounts.sync`
- `ingest.search.backfill`
- `archive.posts.list`
- `archive.posts.search`
- `archive.posts.semantic_search`
- `archive.accounts.list`
- `archive.accounts.get`
- `archive.billing.summary`
- `analysis.posts.run`
- `analysis.labels.list`
- `archive.insights.summary`

MCP also exposes:

- `system.daemon.start`

## Risk Model

### `safe-read`

- read-only
- does not change X or the local archive

### `operator-write`

- writes into the local SQLite archive
- may consume X API credits
- does not create, delete, like, reply, or DM on X

Note:

- `analysis.posts.run` is also `operator-write`
- but it does not consume X API credits
- it only writes local analysis data and uses CPU

## Performance Reference

Measured system:

- Apple Silicon `M4 mini`
- `16 GB` RAM
- local embedding model on CPU

Measured analysis speed:

- `900` posts = about `30.69s`
- `100` posts = about `3.41s`
- `980` posts = about `33.42s` expected total

Important:

- this is not a large generative LLM benchmark
- this is local tagging + embedding + semantic retrieval preparation

## Local Model

The current analysis layer uses one small local model:

- `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`

Its role is:

- post embeddings
- label-description embeddings
- query embeddings
- similarity-based tagging
- semantic retrieval

This layer does not generate final answers.
It builds a local meaning layer on top of the archive.

## How Analysis Works

When analysis runs, each post gets signals such as:

- educational score
- matched labels
- topic scores
- reply/noise/technical flags

Tagging is based on:

- rule-based signals
- embedding similarity
- a fixed label catalog with descriptions

## Label Catalog

The repository includes a versioned label catalog with Turkish descriptions.

Examples:

- `software_architecture`
- `monolith_vs_microservices`
- `backend_api`
- `database_sql`
- `database_indexing`
- `caching`
- `distributed_systems`
- `testing_qa`
- `clean_code`
- `code_review`
- `security_appsec`
- `authentication_authorization`
- `ci_cd_release`
- `ai_assisted_coding`
- `vibe_coding`
- `prompting_for_engineering`
- `technical_decision_making`

## Quick Start

Check daemon health:

```bash
curl http://127.0.0.1:3200/health
```

List available tools:

```bash
curl http://127.0.0.1:3200/tools
```

Estimate original-post ingest:

```bash
curl -X POST http://127.0.0.1:3200/invoke \
  -H 'content-type: application/json' \
  -d '{
    "tool": "ingest.accounts.original_backfill",
    "input": {
      "username": "sampleauthor",
      "searchMode": "recent",
      "targetCount": 100,
      "estimateOnly": true
    }
  }'
```

Run local analysis:

```bash
curl -X POST http://127.0.0.1:3200/invoke \
  -H 'content-type: application/json' \
  -d '{
    "tool": "analysis.posts.run",
    "input": {
      "username": "sampleauthor",
      "limit": 200,
      "onlyUnanalyzed": true
    }
  }'
```

Run semantic search:

```bash
curl -X POST http://127.0.0.1:3200/invoke \
  -H 'content-type: application/json' \
  -d '{
    "tool": "archive.posts.semantic_search",
    "input": {
      "username": "sampleauthor",
      "query": "teaching posts about coding",
      "educationalOnly": true,
      "limit": 10
    }
  }'
```

## Model Packaging Note

The repository is public and safe to clone, but the local model files are not stored in git history because of GitHub file size limits.

The codebase is public-ready.
Model packaging is handled separately from normal git push history.
