/* Sudoku engine: solver, logical step finder (for hints + grading), generator helpers.
   Works in browser (window.SudokuEngine) and node (module.exports). */
(function (root) {
  'use strict';
  const ALL = 0x3fe; // bits 1..9
  const ROW = (i) => (i / 9) | 0;
  const COL = (i) => i % 9;
  const BOX = (i) => ((ROW(i) / 3) | 0) * 3 + ((COL(i) / 3) | 0);

  // Units: 0-8 rows, 9-17 cols, 18-26 boxes
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push([...Array(9)].map((_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push([...Array(9)].map((_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = ((b / 3) | 0) * 3, bc = (b % 3) * 3, u = [];
    for (let k = 0; k < 9; k++) u.push((br + ((k / 3) | 0)) * 9 + bc + (k % 3));
    UNITS.push(u);
  }
  const CELL_UNITS = [...Array(81)].map((_, i) => [ROW(i), 9 + COL(i), 18 + BOX(i)]);
  const PEERS = [...Array(81)].map((_, i) => {
    const s = new Set();
    for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) s.add(j);
    return [...s];
  });
  const POP = new Uint8Array(1024);
  for (let m = 0; m < 1024; m++) { let c = 0, x = m; while (x) { x &= x - 1; c++; } POP[m] = c; }
  const digitsOf = (m) => { const d = []; for (let k = 1; k <= 9; k++) if (m & (1 << k)) d.push(k); return d; };
  const lowDigit = (m) => { for (let k = 1; k <= 9; k++) if (m & (1 << k)) return k; return 0; };

  /* ---------------- Fast backtracking solver (counts solutions up to limit) ------------- */
  function countSolutions(grid, limit = 2, out = null) {
    const g = grid.slice();
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (v) {
        const b = 1 << v;
        if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
        rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
      }
    }
    let count = 0;
    function rec() {
      let best = -1, bestMask = 0, bestCount = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]);
        const c = POP[m];
        if (c < bestCount) { best = i; bestMask = m; bestCount = c; if (c <= 1) break; }
      }
      if (best === -1) { count++; if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i]; return count >= limit; }
      if (bestCount === 0) return false;
      const r = ROW(best), c = COL(best), bx = BOX(best);
      for (let d = 1; d <= 9; d++) {
        const b = 1 << d;
        if (!(bestMask & b)) continue;
        g[best] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        if (rec()) return true;
        rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      }
      g[best] = 0;
      return false;
    }
    rec();
    return count;
  }
  function solve(grid) { const out = new Array(81).fill(0); return countSolutions(grid, 1, out) ? out : null; }

  /* ---------------- RNG ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function randomFull(rnd) {
    const g = new Array(81).fill(0);
    const rows = new Uint16Array(9), cols = new Uint16Array(9), boxes = new Uint16Array(9);
    function rec(i) {
      if (i === 81) return true;
      const r = ROW(i), c = COL(i), bx = BOX(i);
      const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
      for (const d of ds) {
        const b = 1 << d;
        if ((rows[r] | cols[c] | boxes[bx]) & b) continue;
        g[i] = d; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        if (rec(i + 1)) return true;
        rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      }
      g[i] = 0; return false;
    }
    rec(0);
    return g;
  }

  /* ---------------- Candidates ---------------- */
  function computeCandidates(grid) {
    const cand = new Uint16Array(81);
    for (let i = 0; i < 81; i++) {
      if (grid[i]) { cand[i] = 0; continue; }
      let m = ALL;
      for (const p of PEERS[i]) if (grid[p]) m &= ~(1 << grid[p]);
      cand[i] = m;
    }
    return cand;
  }

  /* ---------------- Logical techniques ----------------
     Each finder returns a step or null:
     { tech, place?: {cell, digit}, elim?: [{cell, digit}], cells: [...focus cells], units:[unit ids], digits:[...], pattern: [...] }
  */
  const unitName = (u) => (u < 9 ? { type: 'row', n: u + 1 } : u < 18 ? { type: 'col', n: u - 8 } : { type: 'box', n: u - 17 });

  function findFullHouse(grid, cand) {
    for (let u = 0; u < 27; u++) {
      const empt = UNITS[u].filter((i) => !grid[i]);
      if (empt.length === 1) {
        const i = empt[0];
        let used = 0; for (const j of UNITS[u]) if (grid[j]) used |= 1 << grid[j];
        const d = lowDigit(ALL & ~used);
        if (d && (cand[i] & (1 << d))) return { tech: 'fullHouse', place: { cell: i, digit: d }, cells: [i], units: [u], digits: [d] };
      }
    }
    return null;
  }
  function findHiddenSingle(grid, cand, boxesFirst = true) {
    const order = boxesFirst ? [...Array(9)].map((_, k) => 18 + k).concat([...Array(18)].map((_, k) => k)) : [...Array(27)].map((_, k) => k);
    for (const u of order) {
      for (let d = 1; d <= 9; d++) {
        const b = 1 << d; let pos = -1, n = 0, placed = false;
        for (const i of UNITS[u]) { if (grid[i] === d) { placed = true; break; } if (cand[i] & b) { pos = i; n++; } }
        if (!placed && n === 1) return { tech: 'hiddenSingle', place: { cell: pos, digit: d }, cells: [pos], units: [u], digits: [d] };
      }
    }
    return null;
  }
  function findNakedSingle(grid, cand) {
    for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 1) return { tech: 'nakedSingle', place: { cell: i, digit: lowDigit(cand[i]) }, cells: [i], units: [], digits: [lowDigit(cand[i])] };
    return null;
  }
  function findLocked(grid, cand) {
    // Pointing: in a box, digit restricted to one row/col -> eliminate from rest of that row/col
    for (let bx = 0; bx < 9; bx++) {
      const bu = 18 + bx;
      for (let d = 1; d <= 9; d++) {
        const b = 1 << d;
        const cells = UNITS[bu].filter((i) => cand[i] & b);
        if (cells.length < 2) continue;
        for (const lineType of [0, 1]) {
          const f = lineType === 0 ? ROW : COL;
          if (cells.every((i) => f(i) === f(cells[0]))) {
            const lu = lineType === 0 ? f(cells[0]) : 9 + f(cells[0]);
            const elim = UNITS[lu].filter((i) => BOX(i) !== bx && (cand[i] & b)).map((cell) => ({ cell, digit: d }));
            if (elim.length) return { tech: 'pointing', elim, cells, units: [bu, lu], digits: [d] };
          }
        }
      }
    }
    // Claiming: in a line, digit restricted to one box -> eliminate rest of box
    for (let lu = 0; lu < 18; lu++) {
      for (let d = 1; d <= 9; d++) {
        const b = 1 << d;
        const cells = UNITS[lu].filter((i) => cand[i] & b);
        if (cells.length < 2) continue;
        if (cells.every((i) => BOX(i) === BOX(cells[0]))) {
          const bu = 18 + BOX(cells[0]);
          const elim = UNITS[bu].filter((i) => !UNITS[lu].includes(i) && (cand[i] & b)).map((cell) => ({ cell, digit: d }));
          if (elim.length) return { tech: 'claiming', elim, cells, units: [lu, bu], digits: [d] };
        }
      }
    }
    return null;
  }
  function combos(arr, k, start = 0, cur = [], out = []) {
    if (cur.length === k) { out.push(cur.slice()); return out; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
    return out;
  }
  function findNakedSubset(grid, cand, k) {
    const name = ['', '', 'nakedPair', 'nakedTriple', 'nakedQuad'][k];
    for (let u = 0; u < 27; u++) {
      const empt = UNITS[u].filter((i) => !grid[i] && POP[cand[i]] >= 2 && POP[cand[i]] <= k);
      if (empt.length < k) continue;
      for (const set of combos(empt, k)) {
        let m = 0; for (const i of set) m |= cand[i];
        if (POP[m] !== k) continue;
        const elim = [];
        for (const i of UNITS[u]) if (!grid[i] && !set.includes(i) && (cand[i] & m)) for (const d of digitsOf(cand[i] & m)) elim.push({ cell: i, digit: d });
        if (elim.length) return { tech: name, elim, cells: set, units: [u], digits: digitsOf(m) };
      }
    }
    return null;
  }
  function findHiddenSubset(grid, cand, k) {
    const name = ['', '', 'hiddenPair', 'hiddenTriple', 'hiddenQuad'][k];
    for (let u = 0; u < 27; u++) {
      const empt = UNITS[u].filter((i) => !grid[i]);
      if (empt.length <= k) continue;
      const ds = [];
      for (let d = 1; d <= 9; d++) { const n = empt.filter((i) => cand[i] & (1 << d)).length; if (n >= 1 && n <= k) ds.push(d); }
      if (ds.length < k) continue;
      for (const dset of combos(ds, k)) {
        let m = 0; for (const d of dset) m |= 1 << d;
        const cells = empt.filter((i) => cand[i] & m);
        if (cells.length !== k) continue;
        // every digit must appear
        if (!dset.every((d) => cells.some((i) => cand[i] & (1 << d)))) continue;
        const elim = [];
        for (const i of cells) for (const d of digitsOf(cand[i] & ~m)) elim.push({ cell: i, digit: d });
        if (elim.length) return { tech: name, elim, cells, units: [u], digits: dset };
      }
    }
    return null;
  }
  function findFish(grid, cand, size) {
    const name = size === 2 ? 'xWing' : size === 3 ? 'swordfish' : 'jellyfish';
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      for (const orient of [0, 1]) { // 0: base rows, cover cols
        const base = [];
        for (let l = 0; l < 9; l++) {
          const u = orient === 0 ? l : 9 + l;
          const pos = UNITS[u].filter((i) => cand[i] & b);
          if (pos.length >= 2 && pos.length <= size) base.push({ l, pos });
        }
        if (base.length < size) continue;
        for (const set of combos(base, size)) {
          const coverSet = new Set();
          for (const s of set) for (const i of s.pos) coverSet.add(orient === 0 ? COL(i) : ROW(i));
          if (coverSet.size !== size) continue;
          const baseLines = set.map((s) => s.l);
          const elim = [];
          for (const cl of coverSet) {
            const u = orient === 0 ? 9 + cl : cl;
            for (const i of UNITS[u]) {
              const bl = orient === 0 ? ROW(i) : COL(i);
              if (!baseLines.includes(bl) && (cand[i] & b)) elim.push({ cell: i, digit: d });
            }
          }
          if (elim.length) {
            const cells = []; for (const s of set) cells.push(...s.pos);
            const units = baseLines.map((l) => (orient === 0 ? l : 9 + l)).concat([...coverSet].map((c) => (orient === 0 ? 9 + c : c)));
            return { tech: name, elim, cells, units, digits: [d] };
          }
        }
      }
    }
    return null;
  }
  const sees = (a, b) => a !== b && (ROW(a) === ROW(b) || COL(a) === COL(b) || BOX(a) === BOX(b));
  function findXYWing(grid, cand) {
    const bi = []; for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 2) bi.push(i);
    for (const p of bi) {
      const [x, y] = digitsOf(cand[p]);
      const wings = bi.filter((q) => sees(p, q) && q !== p);
      for (const a of wings) {
        if (!(cand[a] & (1 << x)) || (cand[a] & (1 << y))) continue;
        const z = lowDigit(cand[a] & ~(1 << x)); if (!z) continue;
        for (const c of wings) {
          if (c === a) continue;
          if (cand[c] !== ((1 << y) | (1 << z))) continue;
          const elim = [];
          for (let i = 0; i < 81; i++) if (i !== a && i !== c && i !== p && !grid[i] && (cand[i] & (1 << z)) && sees(i, a) && sees(i, c)) elim.push({ cell: i, digit: z });
          if (elim.length) return { tech: 'xyWing', elim, cells: [p, a, c], units: [], digits: [x, y, z], pivot: p };
        }
      }
    }
    return null;
  }
  function findXYZWing(grid, cand) {
    for (let p = 0; p < 81; p++) {
      if (grid[p] || POP[cand[p]] !== 3) continue;
      const pm = cand[p];
      const wings = PEERS[p].filter((q) => !grid[q] && POP[cand[q]] === 2 && (cand[q] & pm) === cand[q]);
      for (const [a, c] of combos(wings, 2)) {
        if ((cand[a] | cand[c]) !== pm || cand[a] === cand[c]) continue;
        const zm = cand[a] & cand[c]; if (POP[zm] !== 1) continue;
        const z = lowDigit(zm);
        const elim = [];
        for (let i = 0; i < 81; i++) if (i !== p && i !== a && i !== c && !grid[i] && (cand[i] & zm) && sees(i, p) && sees(i, a) && sees(i, c)) elim.push({ cell: i, digit: z });
        if (elim.length) return { tech: 'xyzWing', elim, cells: [p, a, c], units: [], digits: digitsOf(pm), pivot: p };
      }
    }
    return null;
  }


  // Single-digit chains of form strong-weak-strong: skyscraper, 2-string kite, turbot fish
  function strongLinks(grid, cand, d) {
    const b = 1 << d, links = [];
    for (let u = 0; u < 27; u++) {
      const pos = UNITS[u].filter((i) => cand[i] & b);
      if (pos.length === 2) links.push({ a: pos[0], b: pos[1], u });
    }
    return links;
  }
  function findTurbot(grid, cand) {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << d;
      const links = strongLinks(grid, cand, d);
      for (let x = 0; x < links.length; x++) for (let y = x + 1; y < links.length; y++) {
        const L1 = links[x], L2 = links[y];
        for (const [a1, a2] of [[L1.a, L1.b], [L1.b, L1.a]]) for (const [b1, b2] of [[L2.a, L2.b], [L2.b, L2.a]]) {
          if (new Set([a1, a2, b1, b2]).size !== 4) continue;
          if (!sees(a2, b1)) continue;
          if (sees(a1, b2) && false) continue;
          const elim = [];
          for (let i = 0; i < 81; i++) if ((cand[i] & b) && i !== a1 && i !== b2 && i !== a2 && i !== b1 && sees(i, a1) && sees(i, b2)) elim.push({ cell: i, digit: d });
          if (!elim.length) continue;
          const t1 = L1.u < 9 ? 'r' : L1.u < 18 ? 'c' : 'b', t2 = L2.u < 9 ? 'r' : L2.u < 18 ? 'c' : 'b';
          let tech = 'turbotFish';
          if (t1 === t2 && t1 !== 'b') tech = 'skyscraper';
          else if ((t1 === 'r' && t2 === 'c') || (t1 === 'c' && t2 === 'r')) tech = 'twoStringKite';
          return { tech, elim, cells: [a1, a2, b1, b2], units: [L1.u, L2.u], digits: [d], chain: [a1, a2, b1, b2] };
        }
      }
    }
    return null;
  }
  function findWWing(grid, cand) {
    const bi = []; for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 2) bi.push(i);
    for (let x = 0; x < bi.length; x++) for (let y = x + 1; y < bi.length; y++) {
      const A = bi[x], B = bi[y];
      if (cand[A] !== cand[B] || sees(A, B)) continue;
      const [p, q] = digitsOf(cand[A]);
      for (const [link, other] of [[p, q], [q, p]]) {
        for (const L of strongLinks(grid, cand, link)) {
          for (const [e1, e2] of [[L.a, L.b], [L.b, L.a]]) {
            if (e1 === A || e1 === B || e2 === A || e2 === B) continue;
            if (!sees(e1, A) || !sees(e2, B)) continue;
            const elim = [];
            for (let i = 0; i < 81; i++) if (i !== A && i !== B && (cand[i] & (1 << other)) && sees(i, A) && sees(i, B)) elim.push({ cell: i, digit: other });
            if (elim.length) return { tech: 'wWing', elim, cells: [A, B, e1, e2], units: [L.u], digits: [other, link] };
          }
        }
      }
    }
    return null;
  }
  function findUniqueRect(grid, cand) {
    for (let r1 = 0; r1 < 9; r1++) for (let r2 = r1 + 1; r2 < 9; r2++) for (let c1 = 0; c1 < 9; c1++) for (let c2 = c1 + 1; c2 < 9; c2++) {
      const cs = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cs.map(BOX)).size !== 2) continue;
      if (cs.some((i) => grid[i])) continue;
      const bv = cs.filter((i) => POP[cand[i]] === 2);
      if (bv.length !== 3) continue;
      const m = cand[bv[0]];
      if (!bv.every((i) => cand[i] === m)) continue;
      const f = cs.find((i) => !bv.includes(i));
      if ((cand[f] & m) !== m) continue;
      const elim = digitsOf(m).map((digit) => ({ cell: f, digit }));
      return { tech: 'uniqueRectangle', elim, cells: cs, units: [], digits: digitsOf(m), target: f };
    }
    return null;
  }
  function findXYChain(grid, cand, maxLen = 7) {
    const bi = []; for (let i = 0; i < 81; i++) if (!grid[i] && POP[cand[i]] === 2) bi.push(i);
    const biSet = new Set(bi);
    let found = null;
    for (const start of bi) {
      for (const z of digitsOf(cand[start])) {
        const path = [start];
        const dfs = (cell, inDigit) => {
          const outDigit = lowDigit(cand[cell] & ~(1 << inDigit));
          if (path.length >= 3 && outDigit === z) {
            const end = cell, elim = [];
            for (let i = 0; i < 81; i++) if (!path.includes(i) && (cand[i] & (1 << z)) && sees(i, start) && sees(i, end)) elim.push({ cell: i, digit: z });
            if (elim.length) { found = { tech: 'xyChain', elim, cells: path.slice(), units: [], digits: [z], chain: path.slice() }; return true; }
          }
          if (path.length >= maxLen) return false;
          for (const nx of PEERS[cell]) {
            if (!biSet.has(nx) || path.includes(nx) || !(cand[nx] & (1 << outDigit))) continue;
            path.push(nx);
            if (dfs(nx, outDigit)) return true;
            path.pop();
          }
          return false;
        };
        if (dfs(start, z)) return found;
      }
    }
    return null;
  }

  // Ordered by difficulty. weight used for grading score.
  const TECHNIQUES = [
    { id: 'fullHouse', level: 0, w: 1, fn: (g, c) => findFullHouse(g, c) },
    { id: 'hiddenSingle', level: 0, w: 2, fn: (g, c) => findHiddenSingle(g, c) },
    { id: 'nakedSingle', level: 1, w: 4, fn: (g, c) => findNakedSingle(g, c) },
    { id: 'locked', level: 2, w: 20, fn: (g, c) => findLocked(g, c) },
    { id: 'nakedPair', level: 2, w: 25, fn: (g, c) => findNakedSubset(g, c, 2) },
    { id: 'hiddenPair', level: 2, w: 30, fn: (g, c) => findHiddenSubset(g, c, 2) },
    { id: 'nakedTriple', level: 3, w: 40, fn: (g, c) => findNakedSubset(g, c, 3) },
    { id: 'hiddenTriple', level: 3, w: 50, fn: (g, c) => findHiddenSubset(g, c, 3) },
    { id: 'xWing', level: 3, w: 60, fn: (g, c) => findFish(g, c, 2) },
    { id: 'turbot', level: 3, w: 62, fn: (g, c) => findTurbot(g, c) },
    { id: 'xyWing', level: 3, w: 65, fn: (g, c) => findXYWing(g, c) },
    { id: 'nakedQuad', level: 4, w: 80, fn: (g, c) => findNakedSubset(g, c, 4) },
    { id: 'hiddenQuad', level: 4, w: 85, fn: (g, c) => findHiddenSubset(g, c, 4) },
    { id: 'swordfish', level: 4, w: 90, fn: (g, c) => findFish(g, c, 3) },
    { id: 'xyzWing', level: 4, w: 95, fn: (g, c) => findXYZWing(g, c) },
    { id: 'wWing', level: 4, w: 100, fn: (g, c) => findWWing(g, c) },
    { id: 'uniqueRectangle', level: 4, w: 105, fn: (g, c) => findUniqueRect(g, c) },
    { id: 'jellyfish', level: 4, w: 120, fn: (g, c) => findFish(g, c, 4) },
    { id: 'xyChain', level: 4, w: 130, fn: (g, c) => findXYChain(g, c) },
  ];

  const TECH_ALIAS = { pointing: 'locked', claiming: 'locked', skyscraper: 'turbot', twoStringKite: 'turbot', turbotFish: 'turbot' };
  const techEntry = (id) => TECHNIQUES.find((x) => x.id === (TECH_ALIAS[id] || id));
  function applyStep(grid, cand, step) {
    if (step.place) {
      const { cell, digit } = step.place;
      grid[cell] = digit; cand[cell] = 0;
      for (const p of PEERS[cell]) cand[p] &= ~(1 << digit);
    }
    if (step.elim) for (const e of step.elim) cand[e.cell] &= ~(1 << e.digit);
  }

  function nextStep(grid, cand, maxLevel = 99) {
    for (const t of TECHNIQUES) {
      if (t.level > maxLevel) break;
      const s = t.fn(grid, cand);
      if (s) return s;
    }
    return null;
  }

  // Grade a puzzle by logical solving. Returns {solved, maxLevel, score, hardest, counts}
  function grade(puzzle) {
    const grid = puzzle.slice();
    const cand = computeCandidates(grid);
    let maxLevel = 0, score = 0, hardest = 'hiddenSingle';
    const counts = {};
    let guard = 0;
    while (grid.some((v) => !v) && guard++ < 1000) {
      const s = nextStep(grid, cand);
      if (!s) return { solved: false, maxLevel: 5, score: score + 500, hardest: 'beyond', counts };
      const t = techEntry(s.tech);
      counts[s.tech] = (counts[s.tech] || 0) + 1;
      score += t.w;
      if (t.level > maxLevel || (t.level === maxLevel && t.w > (techEntry(hardest) || { w: 0 }).w)) { maxLevel = Math.max(maxLevel, t.level); hardest = s.tech; }
      applyStep(grid, cand, s);
    }
    return { solved: true, maxLevel, score, hardest, counts };
  }

  // Minimal-ish puzzle generation with 180° symmetry
  function generate(rnd, opts = {}) {
    const full = randomFull(rnd);
    const puzzle = full.slice();
    const pairs = [];
    for (let i = 0; i <= 40; i++) pairs.push(i);
    shuffle(pairs, rnd);
    const minGivens = opts.minGivens || 17;
    let givens = 81;
    for (const i of pairs) {
      const j = 80 - i;
      const a = puzzle[i], b = puzzle[j];
      const removing = i === j ? 1 : 2;
      if (givens - removing < minGivens) continue;
      puzzle[i] = 0; puzzle[j] = 0;
      if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = b; }
      else givens -= removing;
    }
    return { puzzle, solution: full, givens };
  }

  // Transform preserving 180° symmetry & logic difficulty
  function transform(puzzleStr, solutionStr, rnd) {
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd);
    const map = [0, ...digits];
    const perm = () => {
      // row permutation p such that p(8-r) = 8 - p(r)
      const p = new Array(9);
      const bandSwap = rnd() < 0.5;
      const sigma = shuffle([0, 1, 2], rnd);
      const mid = rnd() < 0.5 ? [3, 4, 5] : [5, 4, 3];
      const b0 = bandSwap ? 6 : 0, b2 = bandSwap ? 0 : 6;
      for (let k = 0; k < 3; k++) { p[k] = b0 + sigma[k]; p[8 - k] = 8 - p[k]; }
      for (let k = 0; k < 3; k++) p[3 + k] = mid[k];
      // fix: 8 - (b0+sigma) lands in other band correctly
      return p;
    };
    const rp = perm(), cp = perm();
    const tr = rnd() < 0.5;
    let P = '', S = '';
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      let sr = rp[r], sc = cp[c];
      if (tr) [sr, sc] = [sc, sr];
      const idx = sr * 9 + sc;
      const pv = +puzzleStr[idx], sv = +solutionStr[idx];
      P += pv ? map[pv] : '0'; S += map[sv];
    }
    return { puzzle: P, solution: S };
  }

  const api = { UNITS, CELL_UNITS, PEERS, ROW, COL, BOX, POP, ALL, digitsOf, lowDigit, countSolutions, solve, mulberry32, shuffle, randomFull, computeCandidates, nextStep, applyStep, grade, generate, transform, unitName, TECHNIQUES, sees, techEntry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SudokuEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
