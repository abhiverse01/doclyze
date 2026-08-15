/**
 * OCR confidence analysis — distinguishes likely-genuine text from
 * likely-garbage OCR output (stamps, logos, decorative elements).
 *
 * v8: Tesseract.js provides per-word confidence scores that we previously
 * discarded (same class of bug v6 fixed for PDF layout data).
 *
 * Architecture:
 * 1. Retain per-line confidence from Tesseract's recognize() output
 * 2. Apply a gibberish heuristic (dictionary membership + structural signals)
 * 3. Segment OCR output into high-confidence and low-confidence regions
 * 4. Only high-confidence text feeds into entity extraction, heading
 *    detection, and completeness scoring
 * 5. Low-confidence text is preserved but tagged as noise
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single OCR line with confidence metadata. */
export interface OCRLine {
  text: string;
  confidence: number; // 0-100 from Tesseract
  isLikelyNoise: boolean;
}

/** Result of OCR confidence analysis. */
export interface OCRConfidenceResult {
  /** High-confidence text — safe for structured extraction */
  highConfidenceText: string;
  /** Low-confidence/noise text — preserved but excluded from extraction */
  lowConfidenceText: string;
  /** Individual lines with their confidence analysis */
  lines: OCRLine[];
  /** Fraction of text that is high-confidence (0-1) */
  highConfidenceRatio: number;
  /** Overall mean confidence of high-confidence lines */
  meanConfidence: number;
}

// ─── Common word list ─────────────────────────────────────────────────────

/**
 * A reasonably-sized common English word list for dictionary-membership check.
 * ~500 most common English words. Doesn't need to be exhaustive — combined
 * with Tesseract's own confidence scores, this provides strong separation.
 * Words are stored lowercased for O(1) lookup.
 */
const COMMON_WORDS = new Set<string>([
  // Articles, prepositions, conjunctions, pronouns
  'a', 'an', 'the', 'and', 'or', 'but', 'not', 'no', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'if', 'while', 'about', 'up',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself',
  'we', 'our', 'ours', 'you', 'your', 'yours', 'he', 'him', 'his', 'she',
  'her', 'hers', 'they', 'them', 'their', 'theirs', 'what', 'which', 'who',
  'whom', 'whose', 'any', 'many', 'much',
  // Common verbs
  'said', 'say', 'get', 'go', 'make', 'know', 'think', 'take', 'see', 'come',
  'want', 'look', 'use', 'find', 'give', 'tell', 'work', 'call', 'try', 'ask',
  'need', 'feel', 'become', 'leave', 'put', 'mean', 'keep', 'let', 'begin',
  'seem', 'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe',
  'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay',
  'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand',
  'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend',
  'grow', 'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider',
  'appear', 'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay',
  'fall', 'cut', 'reach', 'kill', 'remain', 'suggest', 'raise', 'pass', 'sell',
  'require', 'report', 'decide', 'pull', 'develop', 'receive', 'agree', 'support',
  'hit', 'produce', 'eat', 'cover', 'catch', 'draw', 'choose', 'cause', 'point',
  // Common nouns
  'time', 'year', 'people', 'way', 'day', 'man', 'woman', 'child', 'world',
  'life', 'hand', 'part', 'place', 'case', 'week', 'company', 'system', 'program',
  'question', 'work', 'government', 'number', 'night', 'point', 'home', 'water',
  'room', 'mother', 'area', 'money', 'story', 'fact', 'month', 'lot', 'right',
  'study', 'book', 'eye', 'job', 'word', 'business', 'issue', 'side', 'kind',
  'head', 'house', 'service', 'friend', 'father', 'power', 'hour', 'game',
  'line', 'end', 'member', 'law', 'car', 'city', 'community', 'name',
  'president', 'team', 'minute', 'idea', 'body', 'information', 'back', 'parent',
  'face', 'others', 'level', 'office', 'door', 'health', 'person', 'art',
  'war', 'history', 'party', 'result', 'change', 'morning', 'reason', 'research',
  'girl', 'guy', 'moment', 'air', 'teacher', 'force', 'education', 'date',
  // Common adjectives
  'good', 'new', 'first', 'last', 'long', 'great', 'little', 'own', 'other',
  'old', 'right', 'big', 'high', 'different', 'small', 'large', 'next', 'early',
  'young', 'important', 'few', 'public', 'bad', 'same', 'able', 'free', 'sure',
  'real', 'full', 'special', 'easy', 'clear', 'recent', 'certain', 'personal',
  'open', 'red', 'difficult', 'available', 'likely', 'short', 'single', 'medical',
  'current', 'wrong', 'private', 'past', 'foreign', 'fine', 'common', 'poor',
  'natural', 'significant', 'similar', 'hot', 'dead', 'central', 'happy', 'serious',
  'ready', 'simple', 'left', 'physical', 'general', 'environmental', 'financial',
  'blue', 'democratic', 'dark', 'various', 'entire', 'close', 'legal', 'religious',
  'cold', 'final', 'main', 'green', 'nice', 'huge', 'popular', 'traditional',
  'cultural', 'best', 'strong', 'possible', 'necessary', 'wide', 'late', 'real',
  'major', 'local', 'social', 'political', 'economic', 'hard', 'military',
  // Common adverbs
  'also', 'very', 'often', 'however', 'too', 'usually', 'really', 'already',
  'always', 'never', 'sometimes', 'still', 'well', 'back', 'then', 'again',
  'once', 'now', 'even', 'only', 'just', 'also', 'about', 'almost', 'probably',
  'actually', 'certainly', 'especially', 'ever', 'quickly', 'soon', 'together',
  'likely', 'simply', 'generally', 'instead', 'rather', 'enough', 'nearly',
  // Common business/formal words
  'dear', 'sir', 'madam', 'regards', 'sincerely', 'respectfully', 'yours',
  'truly', 'faithfully', 'please', 'thank', 'thanks', 'subject', 'reference',
  'attention', 'regarding', 'concerning', 'following', 'attached', 'hereby',
  'therefore', 'furthermore', 'moreover', 'notwithstanding', 'pursuant',
  'pursuant', 'herein', 'thereof', 'whereas', 'signature', 'received',
  'application', 'request', 'information', 'department', 'director',
  'manager', 'address', 'contact', 'email', 'phone', 'fax', 'website',
  'registered', 'office', 'communication', 'private', 'limited', 'pvt',
  // Numbers and common abbreviations
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'inc', 'ltd', 'corp', 'vs',
  'etc', 'eg', 'ie', 'approx', 'dept', 'no', 'vol', 'fig', 'ch', 'pp',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct',
  'nov', 'dec', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'am', 'pm', 'est', 'pst', 'gmt', 'utc',
]);

// ─── Gibberish heuristic ───────────────────────────────────────────────────

/**
 * Compute a gibberish score for a line of text.
 * Returns 0 (definitely real text) to 1 (definitely garbage).
 *
 * Signals of gibberish:
 * - Very low dictionary-word hit rate
 * - High ratio of short tokens (1-2 chars)
 * - High consonant-cluster ratio (consecutive consonants with no vowels)
 * - Abnormal token length distribution
 * - No recognizable sentence structure
 */
function gibberishScore(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  // Single very short token is ambiguous — don't flag as gibberish
  if (tokens.length === 1 && tokens[0].length <= 3) return 0.3;

  // Single token that is mostly digits (phone number, ID, etc.) — not gibberish
  if (tokens.length === 1) {
    const digitCount = (tokens[0].match(/\d/g) || []).length;
    if (digitCount >= 4) return 0; // Numbers are never noise
  }

  // Single long token that's all caps with no vowels → likely noise
  if (tokens.length === 1 && tokens[0].length > 5) {
    const hasVowel = /[aeiouy]/i.test(tokens[0]);
    if (!hasVowel) return 0.8;
  }

  // Check dictionary membership
  let dictHits = 0;
  let shortTokens = 0;
  let consonantClusterTokens = 0;

  for (const token of tokens) {
    const clean = token.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean) continue;

    // Check dictionary
    if (COMMON_WORDS.has(clean)) {
      dictHits++;
    }

    // Short token ratio
    if (clean.length <= 2) shortTokens++;

    // Consonant cluster detection
    // A token is a "consonant cluster" if it has 3+ consecutive consonants
    // and no vowel, or the vowel-to-consonant ratio is very low
    if (clean.length >= 3) {
      const consonants = clean.replace(/[aeiouy]/g, '');
      const vowelRatio = (clean.length - consonants.length) / clean.length;
      if (vowelRatio < 0.15 && consonants.length >= 3) {
        consonantClusterTokens++;
      }
    }
  }

  const meaningfulTokens = tokens.filter(t => t.replace(/[^a-zA-Z]/g, '').length > 0);
  if (meaningfulTokens.length === 0) return 1;

  // Score components
  const dictHitRate = dictHits / meaningfulTokens.length;
  const shortTokenRate = shortTokens / meaningfulTokens.length;
  const clusterRate = consonantClusterTokens / meaningfulTokens.length;

  // Combine: low dict hit rate = high gibberish
  let score = 0;

  // Dictionary hit rate is the strongest signal
  if (dictHitRate < 0.1) score += 0.5;
  else if (dictHitRate < 0.25) score += 0.3;
  else if (dictHitRate < 0.4) score += 0.1;
  // High dict hit rate reduces score
  if (dictHitRate >= 0.5) score -= 0.3;

  // Short token ratio
  if (shortTokenRate > 0.7) score += 0.3;
  else if (shortTokenRate > 0.5) score += 0.15;

  // Consonant cluster ratio
  if (clusterRate > 0.5) score += 0.3;
  else if (clusterRate > 0.3) score += 0.15;

  // All-caps line with no dictionary words → strong noise signal
  if (/^[A-Z\s]+$/.test(trimmed) && dictHitRate < 0.3) {
    score += 0.2;
  }

  // Line is just random punctuation/symbols
  if (/^[^a-zA-Z]*$/.test(trimmed)) {
    score = 1;
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Main analysis ────────────────────────────────────────────────────────

/**
 * Analyze OCR output for confidence and noise.
 *
 * @param lines - OCR lines with per-line confidence from Tesseract
 * @returns Segmented result with high/low confidence text
 */
export function analyzeOCRConfidence(
  lines: Array<{ text: string; confidence: number }>,
): OCRConfidenceResult {
  if (lines.length === 0) {
    return {
      highConfidenceText: '',
      lowConfidenceText: '',
      lines: [],
      highConfidenceRatio: 1,
      meanConfidence: 0,
    };
  }

  // Analyze each line
  const analyzed: OCRLine[] = lines.map(line => {
    const gScore = gibberishScore(line.text);
    // A line is likely noise if:
    // 1. Tesseract confidence is very low (< 30), OR
    // 2. Gibberish heuristic is high (> 0.5), OR
    // 3. Both are moderate (confidence < 50 AND gibberish > 0.3)
    const isNoise =
      line.confidence < 30 ||
      gScore > 0.5 ||
      (line.confidence < 50 && gScore > 0.3);

    return {
      text: line.text,
      confidence: line.confidence,
      isLikelyNoise: isNoise,
    };
  });

  // Separate into high/low confidence text
  const highLines = analyzed.filter(l => !l.isLikelyNoise);
  const lowLines = analyzed.filter(l => l.isLikelyNoise);

  const highConfidenceText = highLines.map(l => l.text).join('\n');
  const lowConfidenceText = lowLines.map(l => l.text).join('\n');

  const highConfCount = highLines.reduce((s, l) => s + l.text.length, 0);
  const totalCount = analyzed.reduce((s, l) => s + l.text.length, 0);
  const highConfidenceRatio = totalCount > 0 ? highConfCount / totalCount : 1;

  const meanConfidence = highLines.length > 0
    ? highLines.reduce((s, l) => s + l.confidence, 0) / highLines.length
    : 0;

  return {
    highConfidenceText,
    lowConfidenceText,
    lines: analyzed,
    highConfidenceRatio,
    meanConfidence,
  };
}

/**
 * Extract per-line confidence data from Tesseract recognize result.
 * Tesseract's data.lines[] contains { text, confidence } per line.
 */
export function extractOCRLinesFromResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tesseractData: any,
): Array<{ text: string; confidence: number }> {
  if (!tesseractData?.lines) return [];

  return tesseractData.lines.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (line: any) => ({
      text: line.text || '',
      confidence: typeof line.confidence === 'number' ? line.confidence : 50,
    }),
  );
}
