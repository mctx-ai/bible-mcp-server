# Bible MCP Server

Give your AI assistant the ability to study the Bible — search by meaning, look up original Hebrew and Greek words, compare translations side by side, trace cross-references, and explore topics across the entire canon.

This server is available at [bible.mctx.ai](https://bible.mctx.ai). Connect it to any MCP-compatible AI client to unlock deep Bible study capabilities.

---

## What It Does

The Bible MCP Server provides verified scripture text from five public domain English translations alongside a rich set of study tools. Every verse returned includes a structured citation with book, chapter, verse number, and translation — so your AI assistant can cite its sources precisely.

**Data sources:**
- 5 complete English translations (31,102 verses each)
- Strong's Hebrew and Greek concordance
- 340,000+ cross-references
- Morphological analysis for original language study
- Nave's Topical Bible

---

## Supported Translations

| Abbreviation | Full Name |
|---|---|
| KJV | King James Version |
| WEB | World English Bible |
| ASV | American Standard Version |
| YLT | Young's Literal Translation |
| DBY | Darby Translation |

---

## Tools

### search_bible
Searches the Bible by meaning using semantic similarity. Ask a question or describe a concept in natural language and receive ranked passages that match the intent — not just the keywords. Filter by translation, book, or testament.

### find_text
Searches for an exact keyword or phrase across all translations or a specific one. When no translation filter is provided, results include matches from all five supported translations. Results are ordered canonically from Genesis to Revelation.

### compare_translations
Returns the same verse or passage in all five translations side by side, making textual differences and translation choices immediately visible.

### cross_references
Finds related passages for a given verse — other parts of scripture that illuminate, echo, or expand on the same idea.

### word_study
Performs an original language analysis for a specific word in a verse. Returns the Hebrew or Greek word, its Strong's number, transliteration, definition, BDB or Thayer lexicon entry, morphological parsing, and other verses where the same word appears.

### concordance
Finds every verse where a given Hebrew or Greek word (identified by Strong's number) occurs across the entire Bible.

### topical_search
Discovers verses organized around a topic using Nave's Topical Bible — a curated index of thousands of biblical subjects, persons, and themes.

---

## Resources

Resources let AI clients read structured data directly from the server.

| URI | Description |
|---|---|
| `bible://translations` | Lists all available translations with their full names and abbreviations |
| `bible://{translation}/{book}/{chapter}` | Returns a full chapter of scripture |
| `bible://{translation}/{book}/{chapter}/{verse}` | Returns a specific verse with surrounding context |

---

## Example Use Cases

**Comparative Bible study** — Ask the AI to show how different translations render a verse and explain meaningful differences in word choice.

**Word studies in original languages** — Look up a word like "love" in John 3:16 and trace whether the Greek is *agape*, *phileo*, or something else — then find every other verse where that same Greek word appears.

**Topical research** — Find what the Bible says about patience, justice, or prayer using Nave's organized topic index.

**Sermon and teaching preparation** — Gather cross-references, compare translations, and study original language nuances for a passage — all in one conversation.

**Theological investigation** — Search by concept rather than keyword to surface passages that speak to a theme even when the exact word is absent.

---

## How to Connect

Visit [mctx.ai](https://mctx.ai) to subscribe to this server and get connection instructions for your MCP client.
