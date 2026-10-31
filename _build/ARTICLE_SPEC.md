# Shekinah blog article spec (read fully before writing)

Site: https://shekinahsda.org, a Haitian Seventh-day Adventist church at 205 E Carver St, Alvarado, Texas. Verified facts you may use: Sabbath School Saturday 10:00 AM, Divine Service 11:00 AM, prayer meeting online on Zoom every Tuesday and Wednesday at 7:30 PM, worship in Kreyòl and English, church family shares a meal after Sabbath service, free Bible studies (/bible-study/), prayer requests (/prayer-request/), Plan Your Visit (/plan-your-visit/), What We Believe (/beliefs/), YouTube live worship. Do NOT invent any other church program, event, schedule, testimony, member story, quote from a pastor, statistic, or search volume.

## Voice
Write as an experienced Seventh-day Adventist pastor and Bible teacher: warm, Christ-centered, pastoral, practical, never harsh toward other Christians. Doctrine must match Scripture and the official Seventh-day Adventist Fundamental Beliefs (adventist.org/beliefs). Cite the belief number when relevant. Quote the KJV only (public domain), word for word; verify every quote against a KJV source (for example biblegateway.com KJV or kingjamesbibleonline.org). Reference format: "Genesis 2:2 to 3" (write "to", never a hyphen or dash in ranges). Distinguish clearly between what the Bible directly says and interpretation. Never make up a verse or assume a teaching.

## Hard style rules
- Full paragraphs of 3 to 5 sentences. No one sentence paragraphs. No bullet lists in the body.
- NO hyphens or dashes anywhere in the text (no -, –, —). Write "plant based", "one on one", "well being", "self care" etc. The only exception is the proper name "Seventh-day Adventist".
- Natural, human, conversational wording. No emoji, no symbols that look automated, no "In conclusion", no "In today's fast paced world".
- Begin with a relatable situation (never presented as a real person's story).
- Structure: intro (2 to 3 paragraphs), "## The short answer" or a short orienting section, main teaching under ## and ### headings, practical application, "## Reflection questions" (one paragraph containing 2 to 3 questions), "## A word of encouragement", "## A prayer" (original, short), "## Your next step" (one relevant action: free Bible study, prayer request, plan a visit, watch worship), then the sources block.

## Visual blocks (required, 4 to 6 per article, spread out; each is ONE paragraph line in the file)
- `[[stats]] value | label || value | label || value | label` (exactly 3 tiles; values short like "7th", "8 hours", "1 cup")
- `[[callout]] Title || point || point || point` (2 to 6 points, short)
- `[[steps]] Title | short text || Title | short text ...` (3 to 5 steps)
- Timeline: consecutive lines each `[[time]] When | Title | Detail`
- Table: first line `[[table]] Header | Header` (2 or 3 columns), then one `[[table]] cell | cell` line per row, consecutive
- Internal link card to a related existing article: `[[link]] Article title | /blog/slug/`
- Inline photo: `![alt text](UNSPLASH_PHOTO_ID)` (2 per article)
- Sources at the very end, consecutive lines: `[[source]] Source title | https://full.url` (4 to 8 real pages you actually opened; for health and recipe claims use credible sources like NIH, CDC, Mayo Clinic, Harvard T.H. Chan, AHA, Sleep Foundation; for doctrine use adventist.org and the Bible). Keep exact URLs you fetched.
Headings: `## Heading`, `### Subheading`. KJV block quote: `> "verse text" Book 1:2, KJV`.

Recipe articles: include an actual original recipe written as paragraphs plus a `[[table]] Ingredient | Amount` table and a `[[steps]]` method strip. Plant based (no meat, fish, or dairy) and Adventist friendly (no alcohol, no coffee). Nutrition claims must be general and sourced. Cultural details about Haiti must be accurate (for example soup joumou and January 1, 1804 independence) and verified.

Health articles: general wellness education only, no diagnosis or medical advice, suggest seeing a doctor where appropriate, connect to the Adventist health message (the eight natural remedies commonly taught: nutrition, exercise, water, sunlight, temperance, air, rest, trust in God) and Scripture. Every number (hours of sleep, cups of water, minutes of exercise) must come from a source you opened.

## Images
Pick 3 free Unsplash photos per article (1 featured, 2 inline) that fit the topic. For each, open the photo page on unsplash.com with WebFetch and record the og:image photo id (the part after "photo-" and before "?", for example 1747738609473-9e92707075eb), the photographer name, and Unsplash username. Only use photos the page says are "Free to use under the Unsplash License" (never Unsplash+). Do not reuse any photo id already on the site: check the CREDITS object in _build/index.src.html. Prefer photos without identifiable faces of real people.

## Existing articles you can link to with [[link]]
Always get the current list from content-defaults.json (each post's slug, or its title slugified). The list below may be out of date.
- Why Do Seventh-day Adventists Worship on Saturday? | /blog/why-do-seventh-day-adventists-worship-on-saturday/
- What Happens When You Die? What the Bible Really Teaches | /blog/what-happens-when-you-die-bible/
- Resting in His Presence: What the Sabbath Teaches Us About Trust | /blog/resting-in-his-presence-what-the-sabbath-teaches-us-about-trust/
- Five Ways to Build Faith at the Dinner Table | /blog/five-ways-to-build-faith-at-the-dinner-table/
- When Prayer Feels Quiet | /blog/when-prayer-feels-quiet/
- The Gift of Rest: Why Sleep Is Part of Our Worship | /blog/the-gift-of-rest-why-sleep-is-part-of-our-worship/
- Walk With Me: Starting a Sabbath Afternoon Walking Group | /blog/walk-with-me-starting-a-sabbath-afternoon-walking-group/
- Water First: Small Habits for Big Energy | /blog/water-first-small-habits-for-big-energy/
- Eating for Life: Simple Plant Based Meals from Our Kitchen | /blog/eating-for-life-simple-plant-based-meals-from-our-kitchen/
- Soup Joumou, Plant Based: A Freedom Tradition for the Whole Table | /blog/soup-joumou-plant-based-a-freedom-tradition-for-the-whole-table/
- Diri ak Pwa the Healthy Way | /blog/diri-ak-pwa-the-healthy-way/
- Does Hell Burn Forever? What the Bible Really Says About Hell | /blog/does-hell-burn-forever-what-the-bible-says/

## AI search (AEO) and conversion rules (required for every article)
The build turns the article itself into structured data for Google and AI answer engines (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews). Write so the page can be quoted accurately:
- Answer first. "## The short answer" comes right after the intro and its first paragraph directly answers the title in plain words (about 40 to 70 words) before adding nuance. If the title is a question, this paragraph becomes the main FAQ answer in the page markup.
- Question headings. Write most ## and ### headings as the real questions people type (for example "### How long does pikliz last in the fridge?"). The first one or two sentences under each question must answer it completely on their own, so they still make sense when quoted alone. Every heading ending in "?" is turned into a FAQ entry automatically, so only use a question mark when the paragraph below truly answers it.
- Include a section of 3 to 5 common questions (for example "## Honest questions people ask" or "## Questions people ask") with each question as a ### heading followed by one full paragraph answer.
- Name things clearly: say "Seventh-day Adventist", "Shekinah Haitian Seventh-day Adventist Church in Alvarado, Texas", the Bible book and verse, and the official source by name (for example "the NIH Office of Dietary Supplements") inside the sentence, so a quoted passage carries its own attribution.
- Facts must be specific and sourced: numbers with units and the source named in the text, plus the matching [[source]] line.
- Conversion: every article needs at least one [[link]] card to a related article, the "## Your next step" section with ONE action that fits the category (Bible Answers: free Bible study; Devotional: prayer request or worship; Health and Recipes: plan a visit and share the meal after Sabbath service), and a warm, specific invitation to Shekinah in that section using only the verified church facts above. The page template already adds Bible study, visit, prayer, and beliefs buttons below every article, so do not paste raw URLs into the prose.
- Metadata: seoTitle should lead with the main keyword (under 60 characters). metaDesc (120 to 158 characters) should answer the question or promise the benefit and include the main keyword. The excerpt is shown as the article summary under the title, so make it one clear sentence that stands alone.
- Recipes: the ingredient table header must be exactly `[[table]] Ingredient | Amount` (a second table such as "Epis ingredient | Amount" is fine), the method must be a `[[steps]]` strip placed after the ingredient table, and the first `[[stats]]` should give real times and yield using these labels so Google recipe results can read them: `20 min | Prep time || 15 min | Cook time || 6 servings | Makes` (values like "20 min", "1 hour", "1 hour 15 min", "6 servings", "2 quarts").

## Publishing guardrails (enforced by _build/guardrails.py; add_posts.py refuses articles that fail)
- Keyword first. Choose the primary keyword from the "planned" queue in `_build/keyword-map.json` (high priority first, matching category and language) unless fresh research shows a clearly better one. Never target a keyword listed under "owned": that article already holds it. To improve an owned topic, update that article with "replace": true instead of writing a new one.
- keywords: the primary keyword first, then 5 to 8 secondary keywords. The primary keyword (or nearly all its words) must appear in the title, seoTitle, metaDesc and the first 100 words. Use at least one secondary keyword in a ## or ### heading. Do not repeat the primary keyword so often that it reads as stuffing (under about 2.5 percent of words).
- No duplicates: a new slug must not exist (unless "replace": true), the title must not be near identical to an existing title, and no more than a few shared phrases with any existing article. Write every article fresh.
- Double fact check: two separate checkers (two subagents that did not write the article, working one after the other) each verify every KJV quote word for word, every reference in context, doctrine against adventist.org, every number against its opened source, and church facts. Record both in the .json as "factcheck": [{"by": "checker 1", "date": "...", "result": "pass", "notes": "..."}, {"by": "checker 2", ...}]. Only "pass" counts; fix and recheck until both pass.
- AEO: "## The short answer" (Kreyòl: "## Repons kout la") first paragraph 40 to 80 words; 4 or more question headings; a "## Questions people ask" (Kreyòl: "## Kesyon moun poze") section.
- SEO: metaDesc 120 to 158 characters; 2 or more [[link]] cards to pages that exist (existing /blog/slug/ or main pages like /plan-your-visit/, /bible-study/, /prayer-request/, /beliefs/); 4 or more [[source]] lines; minimum words: Bible Answers 2,300, Devotional 1,300, Health 1,450, Recipes 1,200.
- After a successful publish, add_posts.py records the primary keyword as owned and removes it from the planned queue.

## Neutral doctrine articles (topics marked "neutral": true in keyword-map.json)
Jimmy's priority topics (Oct 31, 2026) teach Bible truth as Seventh-day Adventists understand it, but the article never names the denomination: no "Seventh-day Adventist", "Adventist", "Adventism" or "SDA" in the title, metadata, excerpt or body (the [[source]] list may still cite adventist.org pages). Present each teaching as what Scripture says, quote the KJV, and where Christians disagree, describe the other views fairly and explain from the Bible why this article reads it this way. The "Your next step" invitation still welcomes readers to a free Bible study and to Shekinah in Alvarado, Texas, but call it "Shekinah church in Alvarado, Texas", not by its full name. Set "neutral": true in the .json. This overrides the AEO rule that asks to name "Seventh-day Adventist" in the text.
These articles need THREE fact check passes: the usual two, plus a third with "type": "doctrine" that checks every teaching against the official Seventh-day Adventist Fundamental Beliefs (adventist.org/beliefs) and the Biblical Research Institute (adventistbiblicalresearch.org), and confirms that each point where Seventh-day Adventists differ from other denominations (the seventh day Sabbath, the state of the dead and conditional immortality, the historicist reading of Daniel, the 66 book canon, Scripture alone) is stated the Seventh-day Adventist way and not blended with another tradition's view. Historical claims (Nicaea, Constantine's 321 law, Laodicea, Qumran) must cite primary or scholarly sources the checker opened.

## Research (do this before writing each article)
Search the web for the topic the way a real person would. Note the questions people ask (People Also Ask style), what the top ranking pages cover, and what they miss. Write to fill those gaps with more depth, clearer Scripture, practical steps, and the Haitian and local angle where natural. Do not invent search volumes.

## Output per article (write files into the folder you are given; publish with: python3 _build/add_posts.py <folder>)
1. `<slug>.md` the article body only (no H1 title, no byline), in the format above.
2. `<slug>.json` with keys: cat, title, slug, author, date, seoTitle (under 60 characters), metaDesc (120 to 158 characters), excerpt (one sentence), verse (a KJV verse with reference, as "\"text\" Book 1:2, KJV"), keywords (primary + 5 to 8 secondary), factcheck (two passes, see guardrails), featured {id, name, username, alt}, images [{id, name, username, alt}] for the two inline photos, research {intent, questions_people_ask, competitor_gaps, sources_checked}.
Length targets: Bible Answers 2,500 to 3,500 words; Devotional 1,400 to 2,000 words; Health 1,600 to 2,400; Recipes 1,300 to 2,000.
Before finishing, re-read each article and fix: any hyphen or dash, any single sentence paragraph, any bullet list, any unverifiable claim, any KJV quote you did not check word for word.
