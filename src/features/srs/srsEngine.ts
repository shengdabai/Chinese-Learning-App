/**
 * SRS Engine - SM-2 Spaced Repetition Algorithm
 *
 * Each vocabulary card tracks its own interval, ease factor,
 * repetition count, and next review date.
 */

const SRS_STORAGE_KEY = 'lingualens_srs_cards';

export interface SRSCard {
  readonly id: string;
  readonly word: string;
  readonly pinyin: string;
  readonly english: string;
  readonly sentence?: string;
  readonly sentencePinyin?: string;
  readonly sentenceEnglish?: string;
  readonly hskLevel?: number;
  readonly interval: number;        // days until next review
  readonly easeFactor: number;       // >= 1.3
  readonly nextReview: number;       // timestamp ms
  readonly repetitions: number;      // successful consecutive reviews
  readonly addedAt: number;          // timestamp ms
  readonly lastReviewedAt?: number;  // timestamp ms
}

export interface SRSStats {
  readonly totalCards: number;
  readonly dueCards: number;
  readonly masteredCards: number;    // interval >= 21 days
  readonly learningCards: number;    // interval < 21 days
  readonly newCards: number;         // repetitions === 0
}

/**
 * Create a new SRS card from vocabulary data.
 */
export function createSRSCard(vocab: {
  word: string;
  pinyin: string;
  english: string;
  sentence?: string;
  sentencePinyin?: string;
  sentenceEnglish?: string;
  hskLevel?: number;
}): SRSCard {
  return {
    id: crypto.randomUUID(),
    word: vocab.word,
    pinyin: vocab.pinyin,
    english: vocab.english,
    sentence: vocab.sentence,
    sentencePinyin: vocab.sentencePinyin,
    sentenceEnglish: vocab.sentenceEnglish,
    hskLevel: vocab.hskLevel,
    interval: 0,
    easeFactor: 2.5,
    nextReview: Date.now(),
    repetitions: 0,
    addedAt: Date.now(),
  };
}

/**
 * SM-2 algorithm: given a user grade (1-5), compute the next review state.
 *
 * Grade scale:
 *   1 = Complete blackout
 *   2 = Wrong, but remembered after seeing answer
 *   3 = Correct with serious difficulty
 *   4 = Correct with some hesitation
 *   5 = Perfect recall
 */
export function gradeCard(card: SRSCard, grade: number): SRSCard {
  const clampedGrade = Math.max(1, Math.min(5, Math.round(grade)));

  if (clampedGrade < 3) {
    // Failed: reset repetitions, preserve ease factor (SM-2 spec)
    return {
      ...card,
      repetitions: 0,
      interval: 1,
      easeFactor: card.easeFactor,
      nextReview: Date.now() + 1 * 24 * 60 * 60 * 1000,
      lastReviewedAt: Date.now(),
    };
  }

  // Passed: compute new interval
  const newEF = Math.max(
    1.3,
    card.easeFactor + (0.1 - (5 - clampedGrade) * (0.08 + (5 - clampedGrade) * 0.02))
  );

  let newInterval: number;
  const newRepetitions = card.repetitions + 1;

  if (newRepetitions === 1) {
    newInterval = 1;
  } else if (newRepetitions === 2) {
    newInterval = 6;
  } else {
    newInterval = Math.round(card.interval * newEF);
  }

  return {
    ...card,
    repetitions: newRepetitions,
    interval: newInterval,
    easeFactor: newEF,
    nextReview: Date.now() + newInterval * 24 * 60 * 60 * 1000,
    lastReviewedAt: Date.now(),
  };
}

function isSRSCard(value: unknown): value is SRSCard {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return ['id', 'word', 'pinyin', 'english'].every(k => typeof c[k] === 'string' && (c[k] as string).trim().length > 0)
    && ['interval', 'nextReview', 'repetitions', 'addedAt'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k]) && (c[k] as number) >= 0)
    && Number.isInteger(c.repetitions) && typeof c.easeFactor === 'number' && Number.isFinite(c.easeFactor) && c.easeFactor >= 1.3
    && ['sentence', 'sentencePinyin', 'sentenceEnglish'].every(k => c[k] === undefined || typeof c[k] === 'string')
    && (c.hskLevel === undefined || (Number.isInteger(c.hskLevel) && Number(c.hskLevel) >= 1 && Number(c.hskLevel) <= 6));
}

/**
 * Load all SRS cards from localStorage.
 */
export function loadSRSCards(): readonly SRSCard[] {
  try {
    const stored = localStorage.getItem(SRS_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter(isSRSCard) : [];
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to load SRS cards.');
    }
  }
  return [];
}

/**
 * Save all SRS cards to localStorage (immutable replacement).
 */
export function saveSRSCards(cards: readonly SRSCard[]): void {
  try {
    const previous = localStorage.getItem(SRS_STORAGE_KEY);
    if (previous && localStorage.getItem(`${SRS_STORAGE_KEY}_recovery`) === null) {
        localStorage.setItem(`${SRS_STORAGE_KEY}_recovery`, previous);
    }
    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(cards));
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to save SRS cards.');
    }
  }
}

export function clearSRSRecovery(): void {
  try {
    localStorage.removeItem(`${SRS_STORAGE_KEY}_recovery`);
  } catch {
    console.error('Failed to clear SRS recovery copy.');
  }
}

/**
 * Add a card if the word doesn't already exist.
 * Returns a new array (immutable).
 */
export function addCardIfNew(
  cards: readonly SRSCard[],
  vocab: Parameters<typeof createSRSCard>[0]
): readonly SRSCard[] {
  const exists = cards.some(c => c.word === vocab.word);
  if (exists) {
    return cards;
  }
  const newCard = createSRSCard(vocab);
  return [...cards, newCard];
}

/**
 * Get cards that are due for review (nextReview <= now).
 */
export function getDueCards(cards: readonly SRSCard[]): readonly SRSCard[] {
  const now = Date.now();
  return cards.filter(card => card.nextReview <= now);
}

/**
 * Compute statistics for the SRS collection.
 */
export function computeStats(cards: readonly SRSCard[]): SRSStats {
  const now = Date.now();
  const dueCards = cards.filter(c => c.nextReview <= now).length;
  const newCards = cards.filter(c => c.repetitions === 0).length;
  const masteredCards = cards.filter(c => c.interval >= 21).length;
  const learningCards = cards.length - masteredCards - newCards;

  return {
    totalCards: cards.length,
    dueCards,
    masteredCards,
    learningCards: Math.max(0, learningCards),
    newCards,
  };
}

/**
 * Update a single card in the immutable array.
 */
export function updateCard(
  cards: readonly SRSCard[],
  updatedCard: SRSCard
): readonly SRSCard[] {
  return cards.map(c => c.id === updatedCard.id ? updatedCard : c);
}
