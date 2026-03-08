# Bible MCP Server

Give your AI assistant the ability to study the Bible — search by meaning, look up original Hebrew and Greek words, compare translations side by side, trace cross-references, and explore topics across the entire canon.

Connect at [bible.mctx.ai](https://bible.mctx.ai) — works with any MCP-compatible AI client.

---

## What Makes This Different

Most Bible tools offer text lookup. This server goes further: semantic search powered by 155,510 vector embeddings, full original-language analysis, 606,140 cross-references, and topical discovery via Nave's — all accessible through natural conversation with your AI assistant. No other MCP server combines all of these capabilities in one place.

---

## Data at a Glance

| Dataset | Scale |
|---|---|
| English translations | 5 complete (KJV, WEB, ASV, YLT, Darby) — 155,510 verses total |
| Semantic search embeddings | 155,510 vector embeddings |
| Cross-references | 606,140 (OpenBible.info dataset) |
| Strong's concordance entries | 17,543 Hebrew and Greek entries |
| Lexicon definitions | 17,543 entries with short and long definitions |
| Morphology records | 447,734 word-level parsing records (OT Hebrew + NT Greek) |
| Nave's Topical Bible | 5,319 categories, 140,654 verse associations |

---

## Tools

### search_bible
Searches by meaning using semantic similarity. Ask a question or describe a concept in natural language — receive ranked passages that match the intent, not just the keywords. Powered by 155K+ vector embeddings. Filter by translation, book, or testament.

### find_text
Full-text keyword search across all translations or a specific one using FTS5. Results are ordered canonically from Genesis to Revelation.

### compare_translations
Returns any verse or passage in all five translations side by side, making translation choices and textual differences immediately visible.

### cross_references
Finds related passages for a given verse from a dataset of 606,140 cross-references — other parts of scripture that illuminate, echo, or expand on the same idea.

### word_study
Original language analysis for a specific word in a verse. Returns the Hebrew or Greek word, its Strong's number, transliteration, BDB or Thayer lexicon definition, morphological parsing, and every other verse where the same word appears.

### concordance
Finds every verse where a given Hebrew or Greek word (by Strong's number) occurs across the entire Bible.

### topical_search
Discovers verses organized by topic using Nave's Topical Bible — 5,319 curated categories covering biblical subjects, persons, and themes with 140,654 verse associations.

---

## Resources

| URI | Description |
|---|---|
| `bible://translations` | Lists all available translations |
| `bible://{translation}/{book}/{chapter}` | Returns a full chapter |
| `bible://{translation}/{book}/{chapter}/{verse}` | Returns a specific verse with context |

Every verse response includes a structured citation: book, chapter, verse number, and translation.

---

## Example Use Cases

**Word studies in original languages** — Look up "love" in John 3:16, see whether the Greek is *agape* or *phileo*, and trace every verse where that same word appears across the New Testament.

**Comparative translation study** — Show how five translations render a passage and where meaningful differences in word choice appear.

**Topical research** — Find what the Bible says about patience, justice, or covenant using Nave's organized topic index across 5,319 categories.

**Semantic search** — Surface passages that speak to a theme even when the exact word is absent. Search by concept, not keyword.

**Sermon and teaching preparation** — Gather cross-references, compare translations, and study original language nuances for a passage — all in one conversation.

---

## How to Connect

Visit [mctx.ai](https://mctx.ai) to subscribe and get connection instructions for your MCP client.
