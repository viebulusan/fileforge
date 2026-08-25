// Local, offline paraphrasing: synonym substitution + structural variation.
// Privacy-first by design — the text never leaves the browser.

const SYNONYMS = {
  about: ['regarding', 'concerning', 'on the subject of'],
  accept: ['take on', 'agree to', 'approve'],
  accurate: ['precise', 'exact', 'correct'],
  actually: ['in fact', 'in reality', 'genuinely'],
  add: ['append', 'include', 'attach'],
  additional: ['extra', 'further', 'added'],
  advantage: ['benefit', 'upside', 'strength'],
  allow: ['permit', 'let', 'enable'],
  already: ['by now', 'previously', 'thus far'],
  also: ['additionally', 'as well', 'likewise'],
  although: ['even though', 'while', 'though'],
  always: ['invariably', 'at all times', 'without fail'],
  amazing: ['remarkable', 'astonishing', 'striking'],
  among: ['amongst', 'within', 'between'],
  amount: ['quantity', 'volume', 'sum'],
  answer: ['reply', 'response', 'solution'],
  appear: ['seem', 'look', 'emerge'],
  approach: ['method', 'strategy', 'way'],
  ask: ['request', 'inquire', 'pose'],
  assist: ['help', 'support', 'aid'],
  attempt: ['try', 'endeavour', 'effort'],
  avoid: ['sidestep', 'dodge', 'steer clear of'],
  bad: ['poor', 'poor-quality', 'substandard'],
  basic: ['fundamental', 'core', 'elementary'],
  beautiful: ['lovely', 'striking', 'elegant'],
  become: ['turn into', 'grow into', 'develop into'],
  begin: ['start', 'commence', 'set out'],
  believe: ['think', 'hold', 'trust'],
  best: ['finest', 'top', 'optimal'],
  better: ['superior', 'improved', 'stronger'],
  big: ['large', 'sizable', 'substantial'],
  build: ['construct', 'assemble', 'put together'],
  business: ['company', 'firm', 'enterprise'],
  buy: ['purchase', 'acquire', 'pick up'],
  call: ['ring', 'phone', 'contact'],
  careful: ['cautious', 'wary', 'attentive'],
  change: ['alter', 'modify', 'adjust'],
  choose: ['select', 'pick', 'go with'],
  common: ['widespread', 'prevailing', 'routine'],
  company: ['business', 'firm', 'organisation'],
  complete: ['finish', 'conclude', 'wrap up'],
  consider: ['weigh', 'contemplate', 'reflect on'],
  correct: ['right', 'accurate', 'proper'],
  create: ['make', 'produce', 'craft'],
  crucial: ['vital', 'critical', 'pivotal'],
  current: ['present', 'existing', 'ongoing'],
  decide: ['choose', 'resolve', 'settle'],
  decrease: ['reduce', 'lower', 'diminish'],
  deep: ['profound', 'far-reaching', 'thorough'],
  definite: ['clear-cut', 'unambiguous', 'firm'],
  demonstrate: ['show', 'illustrate', 'display'],
  describe: ['outline', 'depict', 'portray'],
  different: ['distinct', 'varying', 'divergent'],
  difficult: ['hard', 'demanding', 'tough'],
  discover: ['find', 'uncover', 'come across'],
  discuss: ['talk over', 'examine', 'cover'],
  early: ['ahead of time', 'premature', 'initial'],
  easy: ['simple', 'straightforward', 'painless'],
  effective: ['successful', 'productive', 'efficient'],
  effort: ['work', 'labour', 'exertion'],
  emphasize: ['stress', 'highlight', 'underscore'],
  enable: ['allow', 'empower', 'facilitate'],
  encourage: ['urge', 'spur', 'nudge'],
  enough: ['sufficient', 'ample', 'adequate'],
  ensure: ['make certain', 'guarantee', 'secure'],
  especially: ['particularly', 'notably', 'above all'],
  essential: ['vital', 'indispensable', 'key'],
  establish: ['set up', 'found', 'create'],
  every: ['each', 'each and every', 'all'],
  exactly: ['precisely', 'specifically', 'just'],
  examine: ['inspect', 'analyse', 'study'],
  excellent: ['outstanding', 'first-rate', 'superb'],
  example: ['instance', 'case', 'sample'],
  explain: ['clarify', 'spell out', 'account for'],
  explore: ['investigate', 'probe', 'delve into'],
  famous: ['well-known', 'renowned', 'celebrated'],
  fast: ['quick', 'rapid', 'swift'],
  feel: ['sense', 'perceive', 'experience'],
  few: ['a handful of', 'scattered', 'limited'],
  find: ['locate', 'discover', 'track down'],
  finish: ['complete', 'wrap up', 'conclude'],
  first: ['initial', 'opening', 'earliest'],
  focus: ['concentrate', 'zero in', 'centre'],
  follow: ['trail', 'pursue', 'come after'],
  free: ['complimentary', 'no-cost', 'unrestricted'],
  full: ['complete', 'entire', 'whole'],
  fun: ['enjoyable', 'entertaining', 'amusing'],
  future: ['time ahead', 'years to come', 'prospect'],
  get: ['obtain', 'receive', 'secure'],
  give: ['provide', 'offer', 'supply'],
  goal: ['objective', 'aim', 'target'],
  good: ['solid', 'strong', 'fine'],
  great: ['excellent', 'outstanding', 'formidable'],
  grow: ['expand', 'develop', 'flourish'],
  hard: ['difficult', 'tough', 'demanding'],
  help: ['assist', 'support', 'lend a hand'],
  hide: ['conceal', 'mask', 'tuck away'],
  high: ['tall', 'elevated', 'steep'],
  honest: ['truthful', 'candid', 'forthright'],
  hope: ['wish', 'aspire', 'trust'],
  huge: ['immense', 'vast', 'massive'],
  idea: ['notion', 'concept', 'thought'],
  important: ['significant', 'weighty', 'major'],
  improve: ['enhance', 'refine', 'upgrade'],
  include: ['cover', 'incorporate', 'embrace'],
  increase: ['raise', 'boost', 'grow'],
  indicate: ['suggest', 'signal', 'point to'],
  information: ['details', 'data', 'facts'],
  insight: ['understanding', 'perception', 'awareness'],
  instead: ['rather', 'alternatively', 'in place of that'],
  interest: ['curiosity', 'engagement', 'attention'],
  issue: ['problem', 'matter', 'concern'],
  keep: ['retain', 'hold onto', 'maintain'],
  know: ['be aware', 'recognise', 'understand'],
  large: ['big', 'sizeable', 'expansive'],
  later: ['afterwards', 'subsequently', 'down the line'],
  learn: ['grasp', 'pick up', 'absorb'],
  leave: ['depart', 'exit', 'move on from'],
  let: ['allow', 'permit', 'enable'],
  likely: ['probable', 'expected', 'on the cards'],
  listen: ['hear out', 'pay attention', 'tune in'],
  little: ['small', 'modest', 'slight'],
  long: ['lengthy', 'extended', 'drawn-out'],
  look: ['appear', 'seem', 'come across as'],
  lose: ['misplace', 'forfeit', 'drop'],
  main: ['primary', 'principal', 'chief'],
  major: ['leading', 'central', 'significant'],
  make: ['create', 'produce', 'build'],
  maybe: ['perhaps', 'possibly', 'conceivably'],
  mean: ['signify', 'denote', 'imply'],
  might: ['may', 'could', 'may well'],
  modern: ['contemporary', 'current-day', 'up to date'],
  moment: ['instant', 'juncture', 'point in time'],
  money: ['funds', 'cash', 'capital'],
  more: ['additional', 'greater', 'further'],
  most: ['the majority of', 'nearly all', 'the greater part'],
  move: ['shift', 'relocate', 'transport'],
  much: ['a great deal', 'considerably', 'substantially'],
  need: ['require', 'call for', 'demand'],
  new: ['fresh', 'novel', 'recent'],
  next: ['following', 'subsequent', 'upcoming'],
  nice: ['pleasant', 'agreeable', 'pleasing'],
  now: ['at present', 'currently', 'these days'],
  obvious: ['clear', 'evident', 'apparent'],
  offer: ['provide', 'put forward', 'extend'],
  often: ['frequently', 'regularly', 'repeatedly'],
  old: ['ageing', 'long-standing', 'former'],
  only: ['merely', 'just', 'solely'],
  opportunity: ['chance', 'opening', 'prospect'],
  other: ['alternative', 'remaining', 'different'],
  part: ['portion', 'section', 'piece'],
  people: ['individuals', 'persons', 'folks'],
  plan: ['scheme', 'blueprint', 'roadmap'],
  point: ['argument', 'idea', 'angle'],
  possible: ['feasible', 'achievable', 'conceivable'],
  powerful: ['potent', 'strong', 'commanding'],
  practice: ['habit', 'routine', 'custom'],
  problem: ['issue', 'difficulty', 'snag'],
  produce: ['generate', 'yield', 'turn out'],
  provide: ['supply', 'give', 'furnish'],
  purpose: ['aim', 'intent', 'rationale'],
  quality: ['standard', 'calibre', 'grade'],
  quick: ['fast', 'speedy', 'rapid'],
  quite: ['fairly', 'rather', 'somewhat'],
  real: ['genuine', 'actual', 'true'],
  reason: ['cause', 'motive', 'ground'],
  reduce: ['cut', 'trim', 'scale back'],
  remember: ['recall', 'bear in mind', 'keep in mind'],
  remove: ['take away', 'strip out', 'eliminate'],
  repeat: ['reiterate', 'do again', 'duplicate'],
  replace: ['swap', 'substitute', 'stand in for'],
  result: ['outcome', 'upshot', 'consequence'],
  reveal: ['disclose', 'unveil', 'bring to light'],
  rich: ['wealthy', 'affluent', 'moneyed'],
  right: ['correct', 'proper', 'fitting'],
  same: ['identical', 'equivalent', 'matching'],
  say: ['state', 'mention', 'note'],
  search: ['look for', 'hunt for', 'seek out'],
  see: ['notice', 'observe', 'spot'],
  seem: ['appear', 'come across', 'look'],
  select: ['choose', 'pick out', 'opt for'],
  serious: ['grave', 'earnest', 'weighty'],
  service: ['offering', 'provision', 'work'],
  several: ['a few', 'various', 'multiple'],
  show: ['demonstrate', 'reveal', 'display'],
  significant: ['notable', 'material', 'marked'],
  similar: ['comparable', 'akin', 'alike'],
  simple: ['plain', 'uncomplicated', 'basic'],
  small: ['little', 'modest', 'compact'],
  solve: ['resolve', 'work out', 'crack'],
  soon: ['shortly', 'before long', 'any day now'],
  special: ['unique', 'distinctive', 'exceptional'],
  start: ['begin', 'kick off', 'launch'],
  stay: ['remain', 'stick around', 'linger'],
  stop: ['halt', 'cease', 'put an end to'],
  story: ['tale', 'account', 'narrative'],
  strategy: ['plan', 'game plan', 'approach'],
  strong: ['sturdy', 'robust', 'powerful'],
  success: ['achievement', 'win', 'triumph'],
  suggest: ['propose', 'put forward', 'hint at'],
  support: ['back', 'bolster', 'shore up'],
  sure: ['certain', 'confident', 'positive'],
  take: ['grab', 'seize', 'accept'],
  talk: ['speak', 'chat', 'converse'],
  task: ['job', 'assignment', 'chore'],
  teach: ['instruct', 'school', 'coach'],
  tell: ['inform', 'notify', 'let know'],
  thing: ['item', 'element', 'aspect'],
  think: ['believe', 'reckon', 'judge'],
  though: ['although', 'even so', 'still'],
  through: ['via', 'by way of', 'across'],
  time: ['period', 'spell', 'stretch'],
  today: ['nowadays', 'these days', 'right now'],
  together: ['jointly', 'collectively', 'as one'],
  top: ['leading', 'premier', 'highest'],
  total: ['overall', 'combined', 'whole'],
  true: ['accurate', 'valid', 'correct'],
  try: ['attempt', 'have a go', 'test out'],
  understand: ['grasp', 'comprehend', 'fathom'],
  use: ['employ', 'utilise', 'draw on'],
  usually: ['typically', 'normally', 'as a rule'],
  very: ['highly', 'extremely', 'decidedly'],
  view: ['perspective', 'standpoint', 'take'],
  want: ['wish for', 'desire', 'seek'],
  way: ['route', 'path', 'avenue'],
  well: ['capably', 'ably', 'skilfully'],
  whole: ['entire', 'full', 'complete'],
  wide: ['broad', 'expansive', 'sweeping'],
  win: ['triumph', 'prevail', 'come out ahead'],
  wish: ['desire', 'hope for', 'long for'],
  wonderful: ['marvellous', 'delightful', 'splendid'],
  work: ['operate', 'function', 'do the job'],
  world: ['globe', 'planet', 'society'],
  write: ['compose', 'draft', 'pen'],
  wrong: ['mistaken', 'incorrect', 'off base'],
}

const CONNECTORS = {
  however: ['that said', 'even so', 'all the same'],
  therefore: ['as a result', 'consequently', 'so'],
  moreover: ['what is more', 'on top of that', 'besides'],
  furthermore: ['in addition', 'beyond that', 'also worth noting'],
  meanwhile: ['at the same time', 'in the meantime', 'concurrently'],
  overall: ['all things considered', 'on balance', 'in sum'],
  finally: ['lastly', 'to close', 'in the end'],
  first: ['to begin', 'for a start', 'first off'],
  additionally: ['also', 'plus', 'on top of that'],
  consequently: ['as a consequence', 'thus', 'which means'],
  nevertheless: ['nonetheless', 'even so', 'regardless'],
  indeed: ['in truth', 'certainly', 'to be sure'],
  similarly: ['much like that', 'in the same vein', 'likewise'],
  currently: ['at present', 'right now', 'these days'],
  recently: ['lately', 'of late', 'not long ago'],
}

const CONTRACTIONS = [
  [/\bdon't\b/gi, ['do not', "don't"]],
  [/\bcan't\b/gi, ["cannot", "can't", 'cannot']],
  [/\bwon't\b/gi, ['will not', "won't"]],
  [/\bit's\b/gi, ['it is', "it's"]],
  [/\bthey're\b/gi, ['they are', "they're"]],
  [/\bi'm\b/gi, ['I am', "I'm"]],
  [/\bisn't\b/gi, ['is not', "isn't"]],
  [/\bdoesn't\b/gi, ['does not', "doesn't"]],
  [/\byou're\b/gi, ['you are', "you're"]],
  [/\bwe're\b/gi, ['we are', "we're"]],
  [/\bthere's\b/gi, ['there is', "there's"]],
  [/\bthat's\b/gi, ['that is', "that's"]],
]

function mulberry32(seed) {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function matchCase(replacement, original) {
  if (original === original.toUpperCase() && original.length > 1) {
    return replacement.toUpperCase()
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1)
  }
  return replacement
}

export function countWords(text) {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

// Don't stack articles ("a a handful of").
const ARTICLE_START = /^(?:a|an|the)\s/i

const WORD_TOKEN = /^[\w'’]+$/
const OBJECT_NEXT = new Set(['to', 'me', 'him', 'her', 'us', 'them', 'it'])
// After a preposition, multi-word verb phrases read badly
// ("ask users for lend a hand") — prefer single-word synonyms there too.
const PREV_PREPOSITION = new Set([
  'for', 'with', 'about', 'from', 'of', 'in', 'on', 'at', 'by', 'into',
])

/** Chance (0..1) that a word with a known synonym actually gets swapped. */
const SUB_CHANCE = 0.55
/** Keep re-rolling internally until the variant moves at least this much. */
const MIN_CHANGED_PERCENT = 5

/** Percentage of words that differ between two versions of a text. */
export function diffPercent(original, result) {
  const before = original.match(/\S+/g) ?? []
  const after = result.match(/\S+/g) ?? []
  const len = Math.max(before.length, after.length)
  if (len === 0) return 0
  let diff = Math.abs(before.length - after.length)
  for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
    if (before[i].toLowerCase() !== after[i].toLowerCase()) diff += 1
  }
  return Math.round((diff / len) * 100)
}

function paraphraseOnce(text, rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)]

  const tokens = text.match(/[\w'’]+|\s+|[^\w\s'’]+/g) ?? []

  const neighbourWord = (index, step) => {
    for (let j = index + step; j >= 0 && j < tokens.length; j += step) {
      if (WORD_TOKEN.test(tokens[j])) return tokens[j].toLowerCase()
      if (!/^\s+$/.test(tokens[j])) break
    }
    return null
  }

  let output = tokens
    .map((token, i) => {
      if (!WORD_TOKEN.test(token)) return token
      const bare = token.toLowerCase().replace(/[’]/g, "'")
      const options = SYNONYMS[bare]
      if (!options || rand() > SUB_CHANCE) return token

      let pool = options.filter((option) => option.toLowerCase() !== bare)

      const next = neighbourWord(i, 1)
      if (next != null && OBJECT_NEXT.has(next)) {
        // Multi-word verb phrases can't take a bare object ("lend a hand me",
        // "wish for to go") — keep only single-word synonyms here.
        const safe = pool.filter((option) => !option.includes(' '))
        if (safe.length > 0) pool = safe
      }
      const prev = neighbourWord(i, -1)
      if (prev != null && PREV_PREPOSITION.has(prev)) {
        const safe = pool.filter((option) => !option.includes(' '))
        if (safe.length > 0) pool = safe
      } else if (prev === 'a' || prev === 'an' || prev === 'the') {
        const safe = pool.filter((option) => !ARTICLE_START.test(option))
        if (safe.length > 0) pool = safe
      }

      if (pool.length === 0) return token
      return matchCase(pick(pool), token)
    })
    .join('')

  // Connective swaps (sentence-starting words).
  output = output.replace(
    /(^|[.!?]\s+)(However|Therefore|Moreover|Furthermore|Meanwhile|Overall|Finally|Additionally|Consequently|Nevertheless|Indeed|Similarly|Currently|Recently)\b/g,
    (_m, prefix, word) =>
      `${prefix}${matchCase(
        pick(CONNECTORS[word.toLowerCase()] ?? [word]),
        word,
      )}`,
  )

  // Contraction expansion/contraction — alternate direction per run.
  const expand = rand() > 0.5
  for (const [pattern, forms] of CONTRACTIONS) {
    if (expand && pattern.test(output)) {
      output = output.replace(pattern, (word) => matchCase(forms[0], word))
    } else if (!expand) {
      const contracted = forms.find((f) => f.includes("'"))
      if (contracted) {
        const full = new RegExp(
          `\\b${forms[0].replace(' ', '\\s+')}\\b`,
          'gi',
        )
        output = output.replace(full, (word) => matchCase(contracted, word))
      }
    }
  }

  // Trim doubled spaces left behind.
  output = output.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?;:])/g, '$1')

  return { text: output, changedPercent: diffPercent(text, output) }
}

/**
 * Paraphrase `text`. Same seed → same output; bump seed for another variant.
 * Internally re-rolls (deterministically) so short texts always visibly change.
 */
export function paraphrase(text, seed = Date.now()) {
  let best = null
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rand = mulberry32((seed + attempt * 0x9e3779b9) >>> 0)
    const result = paraphraseOnce(text, rand)
    if (best == null || result.changedPercent > best.changedPercent) {
      best = result
    }
    if (best.changedPercent >= MIN_CHANGED_PERCENT) break
  }
  return best
}
