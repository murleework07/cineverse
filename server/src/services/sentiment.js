/**
 * Lightweight lexicon-based sentiment analyser tuned for movie reviews.
 * Handles negation ("not good"), intensifiers ("really great") and
 * contrastive "but" clauses (text after "but" is weighted higher).
 * Returns a score in [-1, 1] and a label.
 */
const LEXICON = {
  // positive
  amazing: 3, awesome: 3, brilliant: 3, masterpiece: 4, masterful: 3, stunning: 3, superb: 3,
  excellent: 3, outstanding: 3, phenomenal: 3, perfect: 3, flawless: 3, incredible: 3,
  beautiful: 2, gorgeous: 2, great: 2, good: 1.5, enjoyable: 2, fun: 1.5, funny: 1.5, hilarious: 2.5,
  moving: 2, gripping: 2, captivating: 2, compelling: 2, engaging: 2, thrilling: 2, clever: 2,
  love: 2.5, loved: 2.5, loving: 2, like: 1, liked: 1.5, enjoy: 1.5, enjoyed: 2, recommend: 2,
  memorable: 2, powerful: 2, fantastic: 3, wonderful: 3, charming: 2, heartfelt: 2, solid: 1.5,
  touching: 2, impressive: 2, fresh: 1, original: 1.5, best: 2.5, nice: 1, decent: 0.5, epic: 2.5,
  // negative
  bad: -2, terrible: -3, awful: -3, horrible: -3, worst: -3.5, boring: -2.5, dull: -2, bland: -1.5,
  waste: -3, wasted: -2.5, disappointing: -2.5, disappointed: -2.5, mess: -2, messy: -1.5,
  predictable: -1.5, slow: -1, tedious: -2.5, cliche: -1.5, cliched: -1.5, weak: -1.5, poor: -2,
  stupid: -2.5, pointless: -2.5, overrated: -2, forgettable: -2, confusing: -1.5, hate: -3, hated: -3,
  annoying: -2, cringe: -2, lazy: -2, flat: -1.5, unwatchable: -3.5, garbage: -3.5, trash: -3,
  mediocre: -1.5, overlong: -1.5, bloated: -1.5, shallow: -1.5, painful: -2, ugly: -1.5,
};

const NEGATORS = new Set(['not', 'no', 'never', "isn't", "wasn't", "don't", "didn't", "doesn't", 'hardly', 'nothing', 'neither', 'nor', "aren't", "can't", 'cannot', 'without']);
const INTENSIFIERS = { very: 1.5, really: 1.5, extremely: 1.8, so: 1.3, incredibly: 1.8, absolutely: 1.7, truly: 1.4, quite: 1.2, super: 1.5, totally: 1.5, slightly: 0.6, somewhat: 0.7, kinda: 0.7 };

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function analyze(text = '') {
  const tokens = tokenize(text);
  let total = 0;
  let hits = 0;
  let afterBut = false;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'but' || tok === 'however' || tok === 'although') { afterBut = true; total *= 0.5; continue; }
    const base = LEXICON[tok];
    if (base === undefined) continue;

    let value = base;
    // look back a 3-token window for modifiers
    for (let j = Math.max(0, i - 3); j < i; j++) {
      const prev = tokens[j];
      if (NEGATORS.has(prev)) value *= -0.75;
      if (INTENSIFIERS[prev]) value *= INTENSIFIERS[prev];
    }
    if (afterBut) value *= 1.5;
    total += value;
    hits++;
  }

  if (hits === 0) return { score: 0, label: 'neutral' };
  // normalise into [-1, 1] (similar to VADER's alpha normalisation)
  const score = total / Math.sqrt(total * total + 15);
  const rounded = Math.round(score * 1000) / 1000;
  const label = rounded >= 0.2 ? 'positive' : rounded <= -0.2 ? 'negative' : 'neutral';
  return { score: rounded, label };
}

module.exports = { analyze, tokenize };
