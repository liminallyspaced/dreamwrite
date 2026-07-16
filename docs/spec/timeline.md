# Timeline — Specification

**Source:** frame-by-frame analysis of the reference clip
(`SaveClip.App_AQNYBpmLwIrzlY6iZWZ9AuL4sA63KMcQnz2KLkIT7Pswf-nMr8mDGWwgD0ZL0k6cTCP-Tybyy9hExFIw_0cZ7Shz-EaticTmj-UH8cA.mp4`, 8.4s, 720×1280, 30fps, captioned *"the ultimate TIMELINE tool for my fictional worlds"*)

Extracted at 2fps → 17 frames, screen region cropped and upscaled. Content is a Star Wars canon timeline.

> **Directive:** take the reference's **interaction model** exactly. Do **not** take its skin.
> The reference is blue-gradient glassmorphism. Platen is monochrome carbon/ink/paper.
> See ADR-0002.

---

## 1. What the reference actually does

### 1.1 The axis

A thin horizontal rule with tick marks and labels reading:

```
25 BBY   20 BBY   15 BBY   10 BBY   5 BBY   0   5 ABY   10 ABY   15 ABY
```

**This is the single most important observation in the clip.** The axis is not a Gregorian date line — it's a **custom era system**. BBY/ABY = Before/After the Battle of Yavin, an in-universe epoch with a user-defined zero point and a sign flip across it.

A fictional-world timeline that can only speak Gregorian is useless. Custom calendars are not a nice-to-have here; they are the feature.

### 1.2 Two item kinds

The clip shows **two visually and structurally distinct** things on one axis:

**Instants** → pills, rendered **above** the axis.
Small rounded capsules: circular icon + label. Each anchors to a point on the axis via a **thin leader line** down to a **small colored dot on the axis line**, the dot matching the pill's colour.

Observed: *Battle of Christophsis, Great Purge of Mandalore, Battle of Kashyyyk, Battle of Coruscant, Siege of Mandalore, Battle of Ryloth, Escape from Kamino, First Battle of Geonosis, Duel on Mustafar, Battle of Atollon, Siege of Lothal, Attack on Lothal, Liberation of Lothal, Mission to Malachor, Battle of Scarif, Battle of Yavin, Rescue of Princess Leia, Duel on Cloud City, Battle of Hoth, Rescue of Han Solo, Battle of Endor, Battle of Jakku.*

**Spans** → thick bars, rendered **below** the axis, lane-packed on multiple rows, several with **image/texture fills**.

Observed: *Clone Wars* (dark, short), *Galactic Empire* (purple, image-filled, long), *Great Jedi Purge* (orange, long), *Galactic Civil War* (black), plus a pale bar at far left.

**Note:** `Luke Skywalker`, `Leia Skywalker Organa Solo`, and `Din Djarin` appear among the pills. Those are **characters**, not events — so the timeline surfaces *entities*, not just events. This directly supports the linked-entity-graph decision (ADR-0003): a character's lifespan is a span; a scene is an instant; they share one axis.

### 1.3 The staircase — lane packing

Pills stack upward in lanes in a distinctive staircase. Crucially, **each pill's footprint on the axis is its rendered label width, not its duration** — an instant has zero duration but a ~120px pill.

**Therefore lane assignment is a function of zoom and must be recomputed on every zoom change.** At low zoom, pills collide and stack high; at high zoom they spread and flatten. This is visible in the clip: the staircase changes shape as the view moves.

This is the subtle part of the whole feature. See §3.3.

### 1.4 The detail card

Clicking a pill opens a card. From frame 08 (`Siege of Lothal`):

- **Header strip** (floating above the card): circular icon · title · a colour/refresh button · a **calendar chip showing the date (`6 BBY`)** · a trash/delete button
- **Body card:** a large **image** filling the top; below it the title (`Siege of Lothal`), the date (`6 BBY`), and a description (`The Ghost crew ignites open rebellion on Lothal.`)
- An **expand arrow** (↗) at the image's top-right, and a **close ✕**

The header is an *inline edit toolbar*, not chrome — date and delete are one click from the pill.

### 1.5 The dock

A floating rounded dock, bottom-centre, glassy. Left to right (frame 13):

| Slot | Icon | Read as |
|------|------|---------|
| 1 | pointer arrow | Select tool |
| 2 | clock/time — **active**, cream highlight | Time/timeline tool |
| — | divider | |
| 3 | open book | Story / encyclopedia |
| 4 | gear | Settings |
| — | divider | |
| 5 | calendar | Calendar config |
| 6 | filter/sort lines | Filter / layers |

A tool-mode switcher plus utilities. **In Platen this is largely redundant with the radial wheel** — see §5.

### 1.6 Navigation

A grab/hand cursor is visible mid-pan (frame 13). Pan and zoom along the time axis.

---

## 2. What we build differently, and why

| Reference | Platen | Why |
|-----------|--------|-----|
| Blue glassmorphism, starfield | Ink on cream paper; letterpress pills; colour only semantic (thread/character coding) | ADR-0002 — one coherent product, not two stapled together |
| Bottom dock, 6 tools | Radial wheel (MMB) + minimal dock | The wheel is Platen's idiom; a dock duplicates it |
| Events are standalone records | Events **are entities** — a timeline event can *be* a script scene | ADR-0003 — the whole reason to build this rather than use Aeon |
| Cloud, "Give Feedback" beta | Offline, local file | Platen's identity |

---

## 3. Data model

### 3.1 The core decision: absolute integer ticks

> **Store one absolute integer `t` per item. Calendars are a display/parse layer only. Layout math never touches calendar logic.**

This is the Unix-time trick, and it is what makes arbitrary fictional calendars tractable. A world with 13-month years, 5-day weeks, three overlapping epochs and a sign flip at zero is *only* hard if calendar rules leak into layout. They must not.

```js
// Layout only ever sees this:
x = (t - camera.t0) * camera.pxPerTick

// Calendars only ever do this:
format(t) -> "6 BBY"
parse("6 BBY") -> t
```

#### 🎯 This is not just tidy — it's the opening the market leaves

**Aeon Timeline's calendars become immutable once populated.** After a single event exists you can
rename months and eras but cannot change anything affecting date arithmetic. It's a recurring,
long-standing user complaint ([forum][aeon-lock1], [forum][aeon-lock2]).

That's an admission they store **resolved** dates rather than a canonical instant plus a projection.
Corroborating smell: custom calendars **break Aeon's JSON export entirely** ([forum][aeon-export]).
And multiple-calendars-per-project has been requested and unfulfilled for years ([forum][aeon-multi]) —
which is exactly what you'd expect if dates are baked against one calendar.

Meanwhile **World Anvil publicly closed** a request for adjustable Day/Month/Year timescales as
unimplementable, saying it *"would require incredibly complicated calculations to account for arbitrary
amounts and durations of months, days"* ([World Anvil][wa-closed]). The category leader gave up on this
exact problem.

**Store the canonical instant; make the calendar a pure display/parse layer, and:**

| Their limitation | Falls out for free |
|------------------|--------------------|
| Calendar locks after first event | Calendar edits are just **re-renders** |
| One calendar per project | Multiple calendars are **a field** |
| Custom calendars break JSON export | Export is integers — **nothing to break** |

This single decision leapfrogs the market leader on its most-complained-about limitation. It costs
nothing extra to do it right *now*, and it is very expensive to retrofit — which is precisely why Aeon
hasn't.

### 3.2 Shapes

**Tick granularity:** the tick is the **smallest unit the calendar addresses** — day for most story
work, second if time-of-day matters. *Not* years: a year is not a fixed number of days once leap rules
exist, so a year-tick can't be a linear axis. The calendar layer does the div/mod work to turn a tick
into `6 BBY` or `12 Marchen 1024`.

#### Calendar — informed by Aeon Timeline

Aeon Timeline is the market leader for fiction timelines; its calendar model is battle-tested and
worth following rather than reinventing. ([Aeon KB][aeon-cal], [Aeon custom calendars][aeon-fantasy])

```js
Calendar {
  id, name,
  tickUnit: 'day',                  // smallest addressable unit. day (typical) or second.

  eras: [{                          // Aeon calls these eras; the video's BBY/ABY are two of them
    id, name: 'Before the Battle of Yavin', abbr: 'BBY',
    direction: -1,                  // -1 counts backwards from the origin, +1 forwards
    length: Infinity | Number,      // in years
    startTick,                      // where this era begins on the absolute axis
    leapYears?: { rule: 'western' | custom },   // default: /4 except /100 but including /400
  }],

  months: [{ id, name: 'January', abbr: 'Jan', days: 31, leapDays: 31 }],
  weekdays: [{ id, name: 'Monday', abbr: 'Mon' }],
  anchorWeekday,                    // which weekday is day 1 of the final era
  hoursPerDay?: 24,
}
```

#### Invariants — take these from Aeon, they're non-obvious

1. **Two infinite bookend eras are mandatory.** *"In all calendar systems, there must be one backwards
   era of infinite length, and one forwards era of infinite length (equivalent to our BC and AD), so
   that any point in time can be correctly labelled."* ([Aeon KB][aeon-cal])
   This is a **total-coverage invariant**: without it, some `t` has no label. It is exactly the
   BBY/ABY pattern in the reference clip. **Enforce it at calendar-creation time**, not at render.
2. **Eras number from 1, not 0.** (Note: the reference clip shows a `0` tick on its axis — Star Wars
   treats the Battle of Yavin as year zero. Either the reference deviates from Aeon here, or `0` is
   the boundary label rather than a year. Unresolved; low stakes.)
3. **At least one month and at least one weekday** must exist. Usefully, *"you can setup a single
   month that lasts the duration of a year and effectively ignore the value"* — which is precisely
   what a year-granularity timeline like the reference's needs.
4. **One day must be anchored as the first day of the final era** — the equivalent of declaring
   01/01/0001 AD a Monday. Without an anchor, weekdays are uncomputable.
5. **Aeon draws a hard line below the day:** hours subdivide into fixed 60-minute units, minutes into
   60 seconds — not customizable. A pragmatic boundary; **copy it.** Custom seconds-per-minute buys
   nothing and costs a lot.

#### Items

```js
TimelineItem {
  id,
  entityId?,                        // <-- the link. null = timeline-only item
  kind: 'instant' | 'span',
  t0: number,                       // absolute ticks. THE only field layout reads
  t1?: number,                      // spans only
  lane: number | null,              // null = auto-pack; number = user-pinned
  title, description,
  color, icon,
  assetId?,                         // content-addressed image (see ADR-0004)

  // fuzzy dates — see §3.5
  t0Earliest?, t0Latest?,           // start range
  t1Earliest?, t1Latest?,           // end range
}
```

#### The relational model — steal Aeon's roles

Aeon's join is richer than a bare edge, and the extra field is what makes it useful
([Aeon key concepts][aeon-concepts], [entity types & roles][aeon-roles]):

- **Event** — an occurrence at a time/place for a duration.
- **Entity** — people, locations, arcs. Has a name, a type, and **optional birth/death (start/end)
  dates**. → **A character lifespan is not an event; it's an entity with dates.** That's exactly how the
  clip's `Luke Skywalker` / `Din Djarin` pills model — and it yields **age-at-event for free**.
- **Relationship** — many-to-many event↔entity, **and each relationship carries a role.** A person isn't
  merely "linked to" an event; they're a *Participant* or an *Observer*. Aeon's fiction template also
  ships Friend/Family on Character↔Character — so **entity↔entity edges exist too**, not just
  event↔entity.
- **Role cardinality is configured per role** — each role declares whether an event takes many entities
  or exactly one (*"an event may be allocated to a single project, but may have multiple people working
  on it"*). **This is the subtle bit most clones miss.**

This refines ADR-0003's `links: [{from, to, rel}]` — `rel` should be a **first-class role** with its own
cardinality, not a free-string tag.

**Steal from StoryLegend** ([docs][storylegend]) instead of Aeon here: it types **event→event** edges
*semantically* — **Causes · Consequence of · Depends on · Happens alongside · Foreshadows** — with
continuity checks that flag when stated dates contradict a declared dependency. Same expressive power as
Aeon's Finish-to-Start / Start-to-Start vocabulary, far more legible to a writer. For a screenwriting
app, "Foreshadows" beats "Finish-to-Start."

#### Container

```js
Timeline {
  id, name,
  calendarId,
  items: [TimelineItem],
  tracks?: [{ id, name, filter }], // optional named rows (per-character, per-thread)
}
```

### 3.3 Lane packing — the algorithm

Screen-space greedy sweep. Recomputed on zoom change, not on pan.

```
pack(items, camera):
  # footprint is SCREEN space: an instant's width is its label, not its duration
  for each item:
    left  = x(t0) - (kind == 'instant' ? labelWidth/2 : 0)
    right = kind == 'span' ? x(t1) : left + labelWidth

  sort by left
  lanes = []                      # lanes[i] = rightmost edge used in lane i
  for item in items:
    L = lowest i where lanes[i] + GAP <= item.left
    if none: L = lanes.length
    item.lane = L
    lanes[L] = item.right
```

O(n · lanes). Fine for thousands of items. Instants pack **up**, spans pack **down**. Pinned lanes (`lane !== null`) are reserved before the sweep.

This reproduces the reference's staircase exactly.

### 3.4 Fuzzy dates — take Aeon's model, it's better than the obvious one

Fiction needs *"sometime during the Clone Wars."* The naive model is a `precision: 'circa' | 'range'`
enum. **Aeon's is better** ([Aeon: uncertainty][aeon-fuzzy]):

**Each boundary gets its own range** → four stored values, two ranges:

```
t0Earliest ──── t0Latest        t1Earliest ──── t1Latest
     └── start uncertainty ─┘        └── end uncertainty ─┘
```

**And the rendering encodes it directly:** the bar **fades in** to full opacity across the start range,
and **fades out** across the end range. The visual *is* the data — no legend, no icon, no explanation.
That's the right answer and it's cheap.

⚠️ Aeon's docs are internally inconsistent on framing (*"four dates instead of the usual two"* vs. "two
independent ranges") — same model; trust the 4-value reading. **Overlap/validation rules are
undocumented** (what if `t0Latest > t1Earliest`?) — we'll have to decide those ourselves.

### 3.5 Relative and dependent dates — deferred, but don't foreclose

Aeon splits these into two mechanisms, which is worth knowing before we build either:

- **Relative dates** are a **project-wide mode**, not a per-event property ([Aeon][aeon-rel]). Formats:
  Weekly (`Week 0, Week 1…`), Daily (`10am Day 3`), Time (`02:32:34`) — all offsets from an arbitrary
  zero. Converting to Absolute prompts for a real zero date and re-derives everything from stored offsets.
- **Dependencies** are separate ([Aeon][aeon-dep]). Four PM-style types (Finish-to-Start,
  Finish-to-Finish, Start-to-Start, Start-to-Finish) that assert **ordering only** — "B blocked by A"
  means B starts *no earlier than* A ends, **not** immediately after. The richer form is **constraints**:
  a comparison operator **plus an offset** — that's what actually expresses *"3 days after X."*
  Violation handling is a real design axis (manual / semi-manual / automatic; auto mode preserves the
  user's most recent edit and moves everything else).

**Deferred to after the timeline ships.** But keep `t0` computed-friendly rather than assuming it's
always user-set — that's the only thing that would be expensive to retrofit. Prefer StoryLegend's
narrative vocabulary (§3.2) over PM jargon when we do build it.

---

## 4. Rendering

DOM + CSS transforms on a single transform layer, with viewport culling. Canvas2D **only** for the axis, ticks, grid and leader lines (cheap, non-interactive, redrawn per frame).

Rationale: pills need text, icons, focus rings, and inline editing — all free in DOM, all expensive to rebuild on canvas. The reference's ~25 pills are trivial; even 5,000 culled to viewport is fine. Revisit only if measured.

**Camera:**

```js
screenX = (t - camera.t0) * camera.pxPerTick
laneY   = axisY ∓ (lane * LANE_H + LANE_GAP)   // ∓: instants up, spans down
```

The timeline camera is **X-locked-to-time, Y-locked-to-lanes**. The board camera is free in both. *The timeline is a constrained board* — same kernel, different constraints. This is why we build the timeline first (ADR-0001): it validates the kernel at lower cost.

---

## 5. Interaction

| Gesture | Action |
|---------|--------|
| Drag empty space / MMB-drag | Pan |
| Wheel | Zoom about cursor (time axis) |
| Ctrl+Wheel | Zoom faster |
| Click pill | Open detail card |
| Drag pill horizontally | Change date (snap to unit; Alt = free) |
| Drag pill vertically | Pin to a lane |
| Drag span edge | Resize |
| **MMB hold** | Radial: *New event · New period · Link to scene · Set date · Filter · Fit all · Calendar · Jump to…* |
| `F` | Fit all |
| `Esc` | Deselect / close card |

**MMB is double-booked with pan.** Resolution in ADR-0005: on MMB-down start the 140ms timer *and* record origin; >6px movement before it fires = pan, cancel the wheel.

---

## 6. Open questions

1. **Multiple timelines per project?** (main plot / character A / flashbacks). Model allows it; UI cost is real. Defer to a switcher.
2. **Vertical timelines?** Reference is horizontal only. Skip.
3. **Relative/dependent dates** — Aeon supports *"exact calendar dates or flexible relative dates"*
   ([Aeon][aeon-dates]), and it's their real edge. High value, high cost (dependency graph + cycle
   detection). Deferred; revisit after the timeline ships. Don't paint the model into a corner:
   keep `t0` computed-not-stored-friendly.
4. **Era numbering from 0 or 1** — see §3.2 invariant 2. Low stakes, but pick one.
5. **Fuzzy-date overlap validation** — Aeon doesn't document it. What if `t0Latest > t1Earliest`? Ours to decide.

---

## 7. Reference app — UNIDENTIFIED

Not identified, and **not guessed at.** The distinguishing evidence (starfield glassmorphism, the bottom
dock, image-filled era bars) is visual and isn't text-indexed anywhere reachable.

> **The cheapest next step isn't more searching — check the clip's caption or bio link for the handle.**
> That beats any amount of text search.

Two unconfirmed leads, both worth five minutes of your own time:

- **timelines.studio** (<https://www.timelines.studio/>, GPL-3.0, <https://github.com/sreegjl/timelines>) —
  has the **exact Events / Spans / Eras primitive triad**, and ships a theme called "Nebula" that could
  plausibly be the starfield. But its demo content is Ancient Greece. **Primitive model is a bullseye**;
  being GPL-3.0, it's also readable.
- **vvd.world** (<https://vvd.world/>) — TikTok-viral in 2025, has a timelines tool **in beta** (fits the
  "Give Feedback" button). **Could not verify — the site returns HTTP 403 to fetch.** Circumstantially
  the best fit for indie+beta+TikTok promo; evidentially nothing.

**Ruled out on visuals:** Aeon Timeline, LegendKeeper, World Anvil, Campfire, Plottr, Chronica,
Chronicon, Preceden.

**Closest *feature* match: StoryLegend** (<https://timeline.storylegend.app/docs/>) — custom era names +
year numbering, era bands, entity linking, typed dependencies, continuity checks. Visually wrong (plain
light/dark toggle, no dock, no feedback button), but the best thing to study for the model.

### Where the market actually leaves a gap

| Tool | Relational model | Calendar |
|------|-----------------|----------|
| Aeon Timeline | rich (roles, cardinality, dependencies) | rich — **but locks after first use, single, breaks JSON export** |
| World Anvil | rich | weak — Chronicles has a **fixed arbitrary lane count** users say turns them off entirely; vertical Timelines are *"not great at showing events that happen concurrent with each other"* by their own admission |
| Campfire | good (bidirectional Calendar↔Timeline, Arcs, Gantt) | real fantasy eras; modular pricing polarising |
| Plottr | — | **cosmetic only** — dates are *labels*; users "replace default text with whatever calendar unit they want." No arithmetic. |
| LegendKeeper | — | good (month names, day counts, leap years, Harptos/Exandria/Tamriel presets) — a funnel into the paid wiki |

**The gap:** everyone has *either* a rich relational model *or* a rich calendar. Nobody combines a
canonical-instant date core, per-boundary fuzzy ranges, narrative-typed dependencies with offsets,
lifespans as first-class dated entities with role-typed M2M links, and good concurrency rendering.

The clip's demo — infinite bookend eras, lane-packed period bars, lifespan pills, staircase leader lines
— showcases **precisely the axis where the incumbents are weakest.**

---

## Sources

- [aeon-cal]: <https://help.timeline.app/article/172-edit-calendar-window> — Aeon Timeline 3, Edit Calendar Window
- [aeon-fantasy]: <https://help.aeontimeline.com/article/109-custom-fantasy-calendars-ipad> — Custom/Fantasy Calendars
- [aeon-dates]: <https://www.aeontimeline.com/guides/add-and-customize-dates> — Add and Customize Dates
- [aeon-concepts]: <https://help.aeontimeline.com/article/20-key-concepts> — Key Concepts (Event / Entity / Relationship)
- [aeon-roles]: <https://help.aeontimeline.com/article/90-entity-types-and-roles-ipad> — Entity Types and Roles
- [aeon-fuzzy]: <https://help.timeline.app/article/181-how-to-handle-uncertainty-in-dates> — Handling uncertainty in dates
- [aeon-rel]: <https://help.timeline.app/article/148-what-are-relative-dates> — Relative dates
- [aeon-dep]: <https://help.timeline.app/article/142-dependencies-and-constraints> — Dependencies and constraints
- [aeon-lock1]: <https://forum.timeline.app/t/unable-to-edit-calendar-after-timeline-additions/767> — calendar locks after use
- [aeon-lock2]: <https://forum.timeline.app/t/cant-edit-calendar-settings/3115> — same
- [aeon-export]: <https://forum.timeline.app/t/custom-calendar-breaks-json-export/3617> — custom calendars break JSON export
- [aeon-multi]: <https://forum.timeline.app/t/request-multiple-calendars/906> — multiple calendars requested, unfulfilled
- [wa-closed]: <https://www.worldanvil.com/community/voting/suggestion/0b45f541-b57a-487f-bc5f-39a092e679a0/view> — World Anvil closes adjustable timescales as unimplementable
- [storylegend]: <https://timeline.storylegend.app/docs/> — StoryLegend (typed narrative event→event edges)
- Reference clip: `SaveClip.App_AQNYBpmLwIrzlY6iZWZ9AuL4sA63KMcQnz2KLkIT7Pswf-nMr8mDGWwgD0ZL0k6cTCP-Tybyy9hExFIw_0cZ7Shz-EaticTmj-UH8cA.mp4` — **source app unidentified**
