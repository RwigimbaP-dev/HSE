/**
 * Local Quiz Generator — generates quiz questions automatically from
 * induction content text (PDF extracts + admin key points).
 *
 * No external API required. Uses NLP-lite techniques:
 * 1. Splits content into key sentences
 * 2. Identifies important terms (safety actions, procedures, definitions)
 * 3. Creates fill-in-the-blank, definition, and procedure questions
 * 4. Generates plausible distractors from the content itself
 */

// ─── Stopwords — words to skip when identifying key terms ─────────────────────
const STOPWORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','must','shall',
  'can','need','this','that','these','those','it','its','they','them','their',
  'there','here','what','which','who','whom','whose','when','where','why','how',
  'all','any','both','each','few','more','most','other','some','such','no','not',
  'only','own','same','so','than','too','very','just','as','if','then','also',
  'about','above','after','again','against','below','during','into','through',
  'your','you','we','our','us','he','she','his','her','i','me','my',
]);

// ─── Safety-related terms that make good question subjects ───────────────────
const SAFETY_KEYWORDS = [
  'fire','evacuate','evacuation','alarm','extinguisher','ppe','helmet','harness',
  'gloves','goggles','boots','vest','mask','respirator','hazard','risk','danger',
  'emergency','exit','muster','assembly','report','incident','accident','injury',
  'injured','first aid','cpr','chemical','spill','leak','gas','fume','dust',
  'electrical','wiring','circuit','shock','burn','hot','cold','pressure',
  'fall','height','scaffold','ladder','lift','carry','manual','loading',
  'machine','guard','guarding','locked','tag','permit','confined','space',
  'restricted','authorized','prohibited','forbidden','allowed','required',
  'must','shall','never','always','sign','signal','warning','caution',
  'safety','health','environment','hse','security','safety officer',
  'procedure','policy','rule','regulation','compliance','training','induction',
  'visitor','badge','escort','supervisor','manager','worker','contractor',
  'smoking','phone','mobile','camera','photography',
];

// ─── Split text into sentences ───────────────────────────────────────────────
function splitSentences(text) {
  if (!text) return [];
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 300 && /[a-zA-Z]/.test(s));
}

// ─── Extract key terms from a sentence ────────────────────────────────────────
function extractKeyTerms(sentence) {
  const words = sentence.toLowerCase().split(/[^a-zA-Z'-]+/);
  return words.filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// ─── Check if a sentence is about safety (worth making a question from) ──────
function isSafetySentence(sentence) {
  const lower = sentence.toLowerCase();
  return SAFETY_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Score sentences by importance ────────────────────────────────────────────
function scoreSentence(sentence) {
  let score = 0;
  const lower = sentence.toLowerCase();
  const terms = extractKeyTerms(sentence);

  // More unique terms = more information density
  score += Math.min(terms.length, 8);

  // Safety keywords boost score
  SAFETY_KEYWORDS.forEach((kw) => {
    if (lower.includes(kw)) score += 3;
  });

  // Imperative sentences (instructions) make great questions
  if (/^(always|never|do not|don't|must|shall|should|ensure|wear|report|use|follow|keep|check|avoid|stop)/i.test(sentence)) {
    score += 5;
  }

  // Penalize very long or very short sentences
  if (sentence.length > 200) score -= 3;
  if (sentence.length < 25) score -= 2;

  return score;
}

// ─── Generate distractors from a pool of terms ───────────────────────────────
function generateDistractors(correctAnswer, termPool, count = 3) {
  const distractors = [];
  const correctLower = correctAnswer.toLowerCase();

  // Try to find terms of similar length that are different from the correct answer
  const candidates = termPool
    .filter((t) => t.toLowerCase() !== correctLower && t.length > 3)
    .filter((t) => !correctLower.includes(t.toLowerCase()) && !t.toLowerCase().includes(correctLower))
    .sort(() => Math.random() - 0.5);

  for (const c of candidates) {
    if (distractors.length >= count) break;
    // Capitalize first letter
    const formatted = c.charAt(0).toUpperCase() + c.slice(1);
    if (!distractors.includes(formatted)) {
      distractors.push(formatted);
    }
  }

  // If not enough distractors from content, use generic safety wrong answers
  const genericWrong = [
    'Ignore the situation and continue working',
    'Handle it without any protective equipment',
    'Wait until someone else reports it',
    'Leave the area without informing anyone',
    'Use the nearest elevator to evacuate',
    'Remove the safety guard for faster operation',
    'Store chemicals near heat sources',
    'Skip the safety briefing to save time',
  ];

  while (distractors.length < count) {
    const pick = genericWire(genericWrong, correctAnswer, distractors);
    if (pick) distractors.push(pick);
    else break;
  }

  return distractors.slice(0, count);
}

function genericWire(pool, correct, used) {
  const correctLower = correct.toLowerCase();
  return pool.find((p) =>
    !used.includes(p) &&
    p.toLowerCase() !== correctLower &&
    !used.some((u) => u === p)
  );
}

// ─── Shuffle array (Fisher-Yates) ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Question Type 1: Fill-in-the-blank from key sentences ────────────────────
function makeFillBlankQuestion(sentence, allTerms) {
  const terms = extractKeyTerms(sentence)
    .filter((t) => t.length > 4)
    .sort((a, b) => b.length - a.length); // prefer longer terms

  if (terms.length < 2) return null;

  const answer = terms[0];
  const answerRegex = new RegExp(`\\b${answer}\\b`, 'i');
  if (!answerRegex.test(sentence)) return null;

  const blanked = sentence.replace(answerRegex, '_____');
  const correctAnswer = answer.charAt(0).toUpperCase() + answer.slice(1);

  const distractors = generateDistractors(correctAnswer, allTerms, 3);
  if (distractors.length < 3) return null;

  const options = shuffle([correctAnswer, ...distractors]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    id: Math.floor(Math.random() * 100000) + 1,
    text: `Fill in the blank: "${blanked}"`,
    options,
    correct: correctIndex,
    explanation: `The correct answer is "${correctAnswer}" based on the induction content.`,
  };
}

// ─── Question Type 2: "What should you do?" from imperative sentences ─────────
function makeProcedureQuestion(sentence, allTerms) {
  // Extract the action part
  const match = sentence.match(/^(always|never|do not|don't|must|shall|should|ensure|wear|report|use|follow|keep|check|avoid|stop)\s+(.+)$/i);
  if (!match) return null;

  const action = match[2].trim();
  if (action.length < 5 || action.length > 120) return null;

  // Determine if it's a "do" or "don't" instruction
  const isNegative = /^(never|do not|don't|avoid|stop)/i.test(sentence);
  const correctAnswer = action.charAt(0).toUpperCase() + action.slice(1);

  // Generate distractors from other sentences' actions or generic wrong actions
  const wrongActions = [
    'Ignore the safety procedure and proceed as normal',
    'Remove all protective equipment before starting',
    'Use a mobile phone in the restricted area',
    'Leave the area without reporting to anyone',
    'Attempt to fix the problem without proper training',
    'Continue working without checking for hazards',
    'Store the materials in any available space',
    'Skip the required safety checks to save time',
  ];

  const distractors = shuffle(wrongActions).slice(0, 3);
  const options = shuffle([correctAnswer, ...distractors]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    id: Math.floor(Math.random() * 100000) + 1,
    text: isNegative
      ? `According to the induction, which of the following should you NOT do?`
      : `According to the induction, what should you do in this situation?\n"${sentence}"`,
    options,
    correct: correctIndex,
    explanation: `The induction states: "${sentence}"`,
  };
}

// ─── Question Type 3: "What is the purpose of?" from titles/descriptions ──────
function makeDefinitionQuestion(title, description, allTerms) {
  if (!title || !description) return null;

  const correctAnswer = description.trim();
  if (correctAnswer.length < 10 || correctAnswer.length > 150) return null;

  const wrongDefinitions = [
    'To increase worker productivity and efficiency',
    'To comply with company dress code standards',
    'To reduce operational costs and save time',
    'To make the workplace look more professional',
    'To track employee attendance and working hours',
  ];

  const distractors = shuffle(wrongDefinitions).slice(0, 3);
  const options = shuffle([correctAnswer, ...distractors]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    id: Math.floor(Math.random() * 100000) + 1,
    text: `What is the purpose of "${title}"?`,
    options,
    correct: correctIndex,
    explanation: `According to the induction content: "${correctAnswer}"`,
  };
}

// ─── Question Type 4: Key point identification ────────────────────────────────
function makeKeyPointQuestion(keyPoint, allKeyPoints) {
  if (!keyPoint || keyPoint.length < 10) return null;

  // Turn the key point into a "Which of the following is correct?" question
  const correctAnswer = keyPoint.trim();

  // Distractors are other key points or negations
  const otherPoints = allKeyPoints.filter((p) => p !== keyPoint && p.length > 10);
  let distractors = [];

  if (otherPoints.length >= 3) {
    distractors = shuffle(otherPoints).slice(0, 3);
  } else {
    // Use generic wrong statements
    const generic = [
      'Safety procedures are optional and can be skipped if in a hurry',
      'Personal protective equipment is only needed for new workers',
      'Emergency exits can be used as regular doors during work hours',
      'Near-miss incidents do not need to be reported if no one was hurt',
      'Fire extinguishers should only be checked after a fire occurs',
      'Visitors can explore the facility freely without an escort',
    ];
    distractors = shuffle(generic).slice(0, 3);
  }

  const options = shuffle([correctAnswer, ...distractors]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    id: Math.floor(Math.random() * 100000) + 1,
    text: 'Which of the following safety statements is correct, according to the induction?',
    options,
    correct: correctIndex,
    explanation: `This is a key safety point from the induction content.`,
  };
}

// ─── Question Type 5: True/False converted to multiple choice ─────────────────
function makeTrueFalseQuestion(sentence, allTerms) {
  if (!sentence || sentence.length < 20) return null;

  // Create a negated version as a wrong answer
  const negated = sentence.replace(/\b(always|must|should|shall|ensure|wear|report|use|follow)\b/i, (m) => {
    const negations = { always: 'never', must: 'never need to', should: 'should never', shall: 'shall not', ensure: 'ignore', wear: 'do not wear', report: 'do not report', use: 'do not use', follow: 'do not follow' };
    return negations[m.toLowerCase()] || 'do not';
  });

  const slightlyWrong = [
    'Safety procedures only apply to permanent employees',
    'Protective equipment is recommended but not required',
    'Emergency procedures should only be followed if convenient',
  ];

  const correctAnswer = sentence;
  const distractors = [negated, ...shuffle(slightlyWrong).slice(0, 2)];
  const options = shuffle([correctAnswer, ...distractors]);
  const correctIndex = options.indexOf(correctAnswer);

  return {
    id: Math.floor(Math.random() * 100000) + 1,
    text: 'Which of the following statements is correct according to the induction?',
    options,
    correct: correctIndex,
    explanation: `The induction content confirms: "${sentence.slice(0, 100)}..."`,
  };
}

// ─── Main: Generate quiz from content ────────────────────────────────────────
/**
 * @param {Array} contentItems - Array of { title, description, key_points, content_text }
 * @param {string} language - 'en' | 'fr' | 'rw'
 * @param {number} count - number of questions (default 5)
 * @returns {Array|null} - array of question objects, or null if not enough content
 */
function generateQuizFromContent(contentItems, language = 'en', count = 5) {
  if (!contentItems || contentItems.length === 0) return null;

  const questions = [];

  // ── Collect all text and parse into usable pieces ──────────────────────────
  const allSentences = [];
  const allTerms = new Set();
  const allKeyPoints = [];

  for (const item of contentItems) {
    // Gather key points (split by newline)
    if (item.key_points) {
      const points = item.key_points
        .split('\n')
        .map((p) => p.replace(/^[-•*]\s*/, '').trim())
        .filter((p) => p.length > 10);
      allKeyPoints.push(...points);
    }

    // Gather content text sentences
    const textSource = item.content_text || item.description || '';
    if (textSource) {
      const sentences = splitSentences(textSource);
      for (const s of sentences) {
        allSentences.push(s);
        extractKeyTerms(s).forEach((t) => allTerms.add(t));
      }
    }

    // Also add title terms
    if (item.title) {
      extractKeyTerms(item.title).forEach((t) => allTerms.add(t));
    }
  }

  // Add key point terms to the pool
  for (const kp of allKeyPoints) {
    extractKeyTerms(kp).forEach((t) => allTerms.add(t));
  }

  const termPool = Array.from(allTerms);

  // ── 1. Generate questions from key points (highest priority) ───────────────
  if (allKeyPoints.length > 0) {
    const shuffledPoints = shuffle(allKeyPoints);
    for (const point of shuffledPoints) {
      if (questions.length >= count) break;
      // Try to make a key point question
      const q = makeKeyPointQuestion(point, allKeyPoints);
      if (q && !questions.some((ex) => ex.text === q.text)) {
        questions.push(q);
      }
    }
  }

  // ── 2. Generate procedure questions from imperative sentences ──────────────
  if (questions.length < count) {
    const imperativeSentences = allSentences
      .filter((s) => /^(always|never|do not|don't|must|shall|should|ensure|wear|report|use|follow|keep|check|avoid|stop)/i.test(s))
      .sort((a, b) => scoreSentence(b) - scoreSentence(a));

    for (const s of shuffle(imperativeSentences)) {
      if (questions.length >= count) break;
      const q = makeProcedureQuestion(s, termPool);
      if (q && !questions.some((ex) => ex.text === q.text)) {
        questions.push(q);
      }
    }
  }

  // ── 3. Generate fill-in-the-blank questions from content sentences ──────────
  if (questions.length < count) {
    const scored = allSentences
      .filter((s) => isSafetySentence(s))
      .sort((a, b) => scoreSentence(b) - scoreSentence(a));

    for (const s of shuffle(scored).slice(0, 10)) {
      if (questions.length >= count) break;
      const q = makeFillBlankQuestion(s, termPool);
      if (q && !questions.some((ex) => ex.text === q.text)) {
        questions.push(q);
      }
    }
  }

  // ── 4. Generate definition questions from titles + descriptions ─────────────
  if (questions.length < count) {
    for (const item of shuffle(contentItems)) {
      if (questions.length >= count) break;
      const q = makeDefinitionQuestion(item.title, item.description, termPool);
      if (q && !questions.some((ex) => ex.text === q.text)) {
        questions.push(q);
      }
    }
  }

  // ── 5. Generate true/false questions as last resort ────────────────────────
  if (questions.length < count) {
    for (const s of shuffle(allSentences.filter((s) => isSafetySentence(s)))) {
      if (questions.length >= count) break;
      const q = makeTrueFalseQuestion(s, termPool);
      if (q && !questions.some((ex) => ex.text === q.text)) {
        questions.push(q);
      }
    }
  }

  // Assign sequential IDs and return
  if (questions.length === 0) return null;

  return questions.slice(0, count).map((q, i) => ({ ...q, id: i + 1 }));
}

module.exports = { generateQuizFromContent };
