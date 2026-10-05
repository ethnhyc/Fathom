/* Fathom engine: answer bank, matching, scoring, zones. No DOM. */
(function (G) {
  const F = (G.F = G.F || {});
  F.BANK = F.BANK || [];

  F.PACKS = [
    { key: "all", name: "Open water", icon: "waves" },
    { key: "geo", name: "Geography", icon: "globe" },
    { key: "nat", name: "Nature", icon: "leaf" },
    { key: "sci", name: "Science", icon: "flask" },
    { key: "his", name: "History", icon: "column" },
    { key: "food", name: "Food & drink", icon: "fork" },
    { key: "cul", name: "Arts & culture", icon: "quill" },
    { key: "word", name: "Words", icon: "letters" },
    { key: "sport", name: "Sport & games", icon: "dice" },
  ];

  F.TIERS = [
    { key: "sprat", name: "Sprat", pts: 4, emoji: "\u{1F41F}", blurb: "Half the boat said this." },
    { key: "herring", name: "Red herring", pts: 8, emoji: "\u{1F3A3}", blurb: "The clever pick everyone reaches for." },
    { key: "reef", name: "Reef", pts: 16, emoji: "\u{1FAB8}", blurb: "Known, but not first to mind." },
    { key: "rare", name: "Rare find", pts: 32, emoji: "\u{1F41A}", blurb: "Few divers get this far." },
    { key: "deep", name: "Deep cut", pts: 64, emoji: "\u{1F991}", blurb: "Almost nobody says this." },
    { key: "pearl", name: "Pearl", pts: 100, emoji: "\u{1F9AA}", blurb: "The one answer we hid at the bottom." },
  ];
  F.MISS_EMOJI = "\u2b1b";
  F.M_PER_POINT = 10;

  // Q(pack, difficulty 1-3, prompt, pearl, tier1..tier5)
  // tier strings: "Display=alias=alias | Display | ..."
  F.Q = function (pack, d, q, pearl, t1, t2, t3, t4, t5) {
    F.BANK.push({ id: pack + ":" + q, pack, d, q, pearl, raw: [t1, t2, t3, t4, t5] });
  };

  function norm(s) {
    s = String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\+\+/g, " plusplus ")
      .replace(/#/g, " sharp ")
      .replace(/[\u2019'`\u00b4]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    s = s.replace(/^(the|a|an) /, "");
    s = s.replace(/\bst\b/g, "saint").replace(/\bmt\b/g, "mount").replace(/\bft\b/g, "fort");
    return s.replace(/ /g, "");
  }
  F.norm = norm;

  function depl(k) {
    if (k.length < 4) return k;
    if (k.endsWith("ies")) return k.slice(0, -3) + "y";
    if (/(ss|x|z|ch|sh)es$/.test(k)) return k.slice(0, -2);
    if (k.endsWith("s") && !k.endsWith("ss") && !k.endsWith("us")) return k.slice(0, -1);
    return k;
  }

  function parseList(str) {
    return String(str || "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((item) => {
        const parts = item.split("=").map((p) => p.trim()).filter(Boolean);
        return { display: parts[0], keys: parts.map(norm) };
      });
  }

  // Build (once) the lookup index for a prompt.
  F.prep = function (p) {
    if (p.index) return p;
    p.tiers = p.raw.map(parseList);
    const pearl = parseList(p.pearl)[0];
    p.pearlItem = pearl;
    p.tiers[5] = [pearl];
    const index = new Map();
    const soft = new Map();
    p.tiers.forEach((list, tier) => {
      list.forEach((item) => {
        item.keys.forEach((k) => {
          if (!index.has(k)) index.set(k, { tier, display: item.display });
        });
      });
    });
    index.forEach((v, k) => {
      const d = depl(k);
      if (d !== k && !index.has(d) && !soft.has(d)) soft.set(d, v);
    });
    p.index = index;
    p.soft = soft;
    p.count = p.tiers.reduce((n, l) => n + l.length, 0);
    return p;
  };

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        const c = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
        cur[j] = c;
        if (c < rowMin) rowMin = c;
      }
      if (rowMin > max) return max + 1;
      for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }

  // Returns {status:'ok', tier, display, fuzzy} | {status:'none', key} | {status:'empty'}
  F.match = function (p, input) {
    F.prep(p);
    const k = norm(input);
    if (!k) return { status: "empty" };
    let hit = p.index.get(k) || p.soft.get(k);
    if (!hit) {
      const d = depl(k);
      hit = p.index.get(d) || p.soft.get(d);
    }
    if (hit) return { status: "ok", tier: hit.tier, display: hit.display, fuzzy: false };
    if (k.length >= 5) {
      const max = k.length >= 9 ? 2 : 1;
      let best = null, bestD = max + 1, tie = false;
      p.index.forEach((v, key) => {
        if (key.length < 4) return;
        const dist = lev(k, key, max);
        if (dist < bestD) { bestD = dist; best = v; tie = false; }
        else if (dist === bestD && best && best.display !== v.display) tie = true;
      });
      if (best && bestD <= max && !tie) return { status: "ok", tier: best.tier, display: best.display, fuzzy: true };
    }
    return { status: "none", key: k };
  };

  F.samples = function (p, tier, n) {
    F.prep(p);
    return p.tiers[tier].slice(0, n).map((x) => x.display);
  };

  // Ocean zones (real to Challenger Deep, invented below it)
  F.ZONES = [
    { at: 0, name: "Sunlight zone", note: "Epipelagic. Enough light for kelp and photosynthesis." },
    { at: 200, name: "Twilight zone", note: "Mesopelagic. Light fades out by 1,000 m." },
    { at: 1000, name: "Midnight zone", note: "Bathypelagic. The only light here is made by animals." },
    { at: 4000, name: "Abyssal zone", note: "Abyssopelagic. Cold, flat plains of silt." },
    { at: 6000, name: "Hadal zone", note: "The trenches, named after Hades." },
    { at: 10935, name: "Challenger Deep", note: "The deepest point anyone has measured." },
    { at: 12000, name: "The Salt Stair", note: "Past every chart. From here the ocean is ours to draw." },
    { at: 18000, name: "Whalefall Nave", note: "Bones as tall as cathedrals, picked clean and glowing." },
    { at: 26000, name: "Lanternless Plain", note: "Even the anglerfish switch off down here." },
    { at: 36000, name: "Pressure Choir", note: "The water hums at a pitch you feel in your teeth." },
    { at: 50000, name: "Basalt Library", note: "Columns of rock filed like books nobody returned." },
    { at: 68000, name: "Mantle Tide", note: "The floor itself moves, slowly, like breathing." },
    { at: 90000, name: "Slow Lightning", note: "Sparks cross the dark once an hour." },
    { at: 120000, name: "Ember Reef", note: "Coral made of cooling rock, warm to the touch." },
    { at: 170000, name: "The Last Fathom", note: "No one has written anything below this line." },
  ];
  F.LANDMARKS = [
    { at: 40, name: "Recreational dive limit" },
    { at: 332, name: "Deepest scuba dive on record" },
    { at: 3800, name: "Wreck of the Titanic" },
    { at: 8336, name: "Deepest fish ever filmed" },
    { at: 10935, name: "Challenger Deep" },
  ];
  F.zoneAt = function (m) {
    let z = F.ZONES[0];
    for (const x of F.ZONES) if (m >= x.at) z = x;
    return z;
  };

  F.fmtM = function (m) {
    return Math.round(m).toLocaleString("en-GB") + " m";
  };

  F.shuffle = function (a, rnd) {
    rnd = rnd || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
})(typeof window !== "undefined" ? window : globalThis);
