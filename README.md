# ISS Paper II · Official Statistics Hub

A single-file, offline, mobile-first practice dashboard for the **UPSC Indian Statistical Service (ISS)**
**Official Statistics** syllabus. It is built on top of the existing *ISS Stats Paper II* standalone mock
platform (720 authentic PYQs) and adds a complete **Official Statistics** hub.

Open `index.html` in any browser (Android Chrome recommended). No server, no network, no install.

## What is inside

| Tab | Content | Sets | MCQs |
|---|---|---|---|
| Book 1-329 | Every page of the book, from UN FPOS, the Indian statistical system and MoSPI, through the NSC (Rangarajan) report, education indicators, PLFS, NSO Vision 2024 and the ASI manual (concepts, blocks, fieldwork, estimation, ready reference), to environmental-economic accounts | B01-B17 | 754 |
| Notes 1-19 | All 19 topic notes: MoSPI, NSO, NSC, FOD, NSS rounds, ICT, agriculture, CPI & WPI, industry, labour, national accounts, SRS, vital statistics & Census, NFHS, trade, PLFS, SDGs & FPOS, CoS Act, misc | N01-N14 | 587 |
| UPSC+ Syllabus | The rest of the ISS syllabus that the book and notes do not cover (see below) | X01-X12 | 496 |
| Full Forms | The 100-row abbreviation list plus 133 supplementary acronyms; list, flashcards and quiz modes | FF1-FF5 | 233 |
| Exam Pointers | Bullet revision notes per topic; high-yield lines are highlighted | 32 blocks | 420 bullets |

Each set has 40-50 questions. Every question has an **explanation** and an **exam shortcut**, and many carry
a **tip** that flags recent changes. The question types mirror UPSC: factual, statement ("1 and 2 only"),
match-the-list, chronology, assertion-reason, odd-one-out, conceptual and numerical.

**UPSC+ sets:**

- **X01** Index numbers: formulae, tests, numericals
- **X02** International system, standards and classifications
- **X03** Publications, agencies and periodicity
- **X04** Social sector: health, education, gender, disability
- **X05** Poverty, inequality, HCES and development indices
- **X06** Census 2011, Census 2027 and demographic measures
- **X07** National accounts concepts (SNA 2008, the 2011-12 series, I-O, State accounts)
- **X08** Money, banking, fiscal, external and energy statistics
- **X09** Recent results (2023-26) and data platforms
- **X10** Fundamentals: quality, errors, methods, dissemination
- **X11** Agriculture, livestock, MSME, industry and services
- **X12** Labour and employment concepts

## Mobile / Android architecture

- **Bottom navigation** below 900 px: Home · Official · Pointers · Full forms · More. On desktop there is a tab strip instead.
- **Android back button** works through the History API. Back during a test asks whether to continue, submit or leave. Back closes an open sheet or modal. A finished test is replaced by its result, so Back never returns to it.
- **Swipe** left and right between questions and flashcards. The view scrolls to the top on navigation and to the feedback after answering.
- The **More** sheet holds analytics, history, bookmarks, mistakes, theme, export, import, reset and **text size (S/M/L/XL)**.
- Safe-area insets, 44-52 px touch targets, `hover:none` fixes, a compact exam header on phones, and dark mode.
- Progress is stored in `localStorage` (`iss_p2_*`, `os_*`). Official Statistics practice is kept out of the PYQ analytics.

## Repository layout

```
build/build_official.py        build + validation script
src/base/ISS-Stats-Paper2-Standalone.html   original dashboard (unmodified base)
src/official/os-module.js      hub views, routing, history, gestures
src/official/os-module.css     hub styles (light/dark, mobile)
src/official/content/
  book/B01-B17.txt             book sets (pp. 1-329)
  notes/N01-N14.txt            topic-notes sets (topics 1-19)
  extra/X01-X12.txt            UPSC+ syllabus sets
  fullforms.tsv                abbreviations + near-miss distractors
  pointers/*.md                bullet exam pointers
index.html                     built output (open this)
```

## Content format

Question sets (`*.txt`):

```
@set N05
@title ...
@note 5              (notes sets only)
@topic NSS: History & Sampling Design
Q: Question text (tables use | pipes |, statements are numbered 1. 2. 3.)
A) ...
B) ...
C) ...
D) ...
ANS: A
T: Statement | Match | Chronology | Assertion-Reason | Odd-one-out | Conceptual | Numerical | Factual
D: Easy | Medium | Hard
P: page reference (optional)
EXP: explanation (**bold** allowed)
SC: exam shortcut
TIP: optional recent-change note
```

Pointers (`pointers/*.md`): `# title`, `@source`, `@group notes|book|extra|fullforms|strategy`,
`## section`, `- bullet`, `! high-yield bullet`.

## Build

```
python3 build/build_official.py          # validate + write index.html
python3 build/build_official.py --check  # validate only
```

The build fails on any of these:

- a malformed question
- a missing explanation or shortcut
- duplicate options
- a `$` character (it is reserved for maths rendering)
- a marker in the base page that has moved

It warns when:

- a set falls outside 40-50 questions
- two question stems are near-duplicates
- a set's answer key is skewed

A deterministic balancer spreads correct answers across A-D. It keeps Statement and Assertion-Reason
options in their canonical order and leaves numeric ladders sorted.
