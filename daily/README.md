# Daily dive prompts

Each file here holds the 7 prompts for one day's daily dive, for example `2026-10-06.json`. The
game (`index.html`) fetches today's file when a player starts the daily dive. These prompts never
join the main bank, so they only ever appear in that day's daily dive. If a day has no file, the
game falls back to a seeded pick of 7 prompts from the main bank, so a missing day breaks nothing.

The date is the player's local calendar day. Files are written a day ahead.

## Format

```json
{
  "date": "2026-10-06",
  "prompts": [
    {
      "pack": "nat",
      "d": 1,
      "q": "Name a type of bird",
      "pearl": "Hoatzin",
      "tiers": [
        "Robin|Sparrow|Eagle|Pigeon=Dove|Owl|Parrot",
        "Penguin|Ostrich|Flamingo",
        "Blackbird|Magpie|Kingfisher|...",
        "Hoopoe|Nightjar|...",
        "Shoebill|Kakapo|..."
      ]
    }
  ]
}
```

- `pack`: one of `geo`, `nat`, `sci`, `his`, `cul`, `food`, `word`, `sport`.
- `d`: difficulty, 1 (anyone can name ten), 2 (most people can name five) or 3 (needs some knowledge).
- `q`: always starts "Name a …" / "Name an …". The AI answer checker only accepts prompts in that form.
- `pearl`: the single rarest answer that most people would still accept once they hear it. Aliases go after `=`.
- `tiers`: five strings, rarest last. Answers are separated by `|`; alternative spellings or names of the same answer by `=`.
  1. Sprat: the obvious answers almost everyone gives (at least 5).
  2. Red herring: the "clever" answers people reach for thinking they're rare, which are actually common. These must still be correct answers (at least 2).
  3. Reef: solid, less obvious answers (at least 15, ideally 25+).
  4. Rare find: answers a well-read player might come up with (at least 6).
  5. Deep cut: genuinely obscure but correct answers.

Matching ignores case, accents, punctuation, spaces and a leading "the/a/an", so don't list
spelling variants that only differ in those ways. Plain ASCII only.

## Quality bar

Match the existing bank: everyday, fun categories with lots of right answers, not niche
trivia. Every listed answer must be correct for the prompt, nothing may appear twice in one
prompt, and the pearl must not also be in a tier. A good prompt has 60+ accepted answers.

Each day: at most 2 prompts from any pack, at most 1 prompt with `d: 3`, and no prompt that is
already in the main bank (`tools/bank.txt`) or in another day's file. Aim for variety across the
week too.

## Checking a file

```
node daily/tools/check.mjs daily/2026-10-06.json
```

It prints `OK` when the file is ready, or lists every problem. Only push files that pass.
