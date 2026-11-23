import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { fromPool, type DatabaseHandle } from '../src/db/database';
import { migrate } from '../src/db/migrate';
import { createSessionRepository } from '../src/interview/session.repository';
import { InterviewSessionService } from '../src/interview/session.service';
import { seededRandomSource } from '../src/interview/assessment.random';
import { createQuizRepositoryFromDatabase } from '../src/quiz/quiz.repository';
import { decodeAttemptReceiptUnverified } from '../src/quiz/attempt-receipt';
import { createTestPool } from './helpers/pg-mem-pool';

/**
 * Attempt finalization and the post-attempt review.
 *
 * `/check` issues a proof of a verified attempt; `POST /attempts/finalize` turns it into the server's explicit
 * "this attempt is finalized"; only that authorizes `POST /review`, the one route that releases the key in bulk.
 */

const START = 1_700_000_000_000;
let clock = START;

const BANK = {
  quizzes: [
    {
      quizId: 'rxjs',
      milestone: 'RxJS', summary: 's', image: 'i', difficulty: 'beginner', facts: [],
      questions: [
        {
          questionText: 'Which answer is correct?',
          explanation: 'Because a Subject multicasts.',
          options: [
            { text: 'A multicast observable', correct: true },
            { text: 'A pipe' },
            { text: 'A directive' }
          ]
        },
        {
          questionText: 'Select every operator',
          explanation: 'map and filter are operators.',
          options: [
            { text: 'map', correct: true },
            { text: 'filter', correct: true },
            { text: 'Observable' },
            { text: 'Subject' }
          ]
        },
        {
          questionText: 'Is a Subject also an Observable?',
          explanation: 'Yes — Subject extends Observable.',
          options: [{ text: 'True', correct: true }, { text: 'False' }]
        },
        {
          questionText: 'Which selector is used for routing?',
          explanation: 'The router outlet.',
          options: [
            { text: '<router-outlet>', correct: true },
            { text: "this.http.get<User>('/api/users/1')" }
          ]
        }
      ]
    },
    {
      quizId: 'signals',
      milestone: 'Signals', summary: 's', image: 'i', difficulty: 'advanced', facts: [],
      questions: [
        {
          questionText: 'What does computed() return?',
          explanation: 'A read-only signal.',
          options: [{ text: 'A read-only signal', correct: true }, { text: 'A promise' }]
        }
      ]
    }
  ]
};

let handle: DatabaseHandle;
let app: Express;

async function seed(db: DatabaseHandle): Promise<void> {
  for (const [qi, quiz] of BANK.quizzes.entries()) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO quizzes (quiz_id, milestone, summary, image, difficulty, facts_json, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [quiz.quizId, quiz.milestone, quiz.summary, quiz.image, quiz.difficulty, '[]', qi]
    );
    const quizPk = Number(rows[0]!['id']);

    for (const [qqi, question] of quiz.questions.entries()) {
      const correctCount = question.options.filter((o) => 'correct' in o).length;
      const texts = question.options.map((o) => o.text.trim().toLowerCase()).sort();
      const type = correctCount > 1 ? 'multiple'
        : (question.options.length === 2 && texts[0] === 'false' && texts[1] === 'true')
          ? 'trueFalse' : 'single';

      const inserted = await db.query<{ id: string }>(
        `INSERT INTO questions (quiz_pk, question_text, question_type, explanation, display_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [quizPk, question.questionText, type, question.explanation, qqi]
      );
      const questionPk = Number(inserted.rows[0]!['id']);

      for (const [oi, option] of question.options.entries()) {
        await db.query(
          `INSERT INTO options (question_pk, option_text, display_order, is_correct)
           VALUES ($1,$2,$3,$4)`,
          [questionPk, option.text, oi, 'correct' in option ? 1 : 0]
        );
      }
    }
  }
}

beforeEach(async () => {
  clock = START;
  handle = fromPool(createTestPool().pool, 'pg-mem');
  await migrate(handle, { now: () => START });
  await seed(handle);

  const quizRepository = await createQuizRepositoryFromDatabase(handle);
  const sessionRepository = createSessionRepository(handle);
  app = createApp(
    loadConfig({ NODE_ENV: 'test', ALLOWED_ORIGINS: 'http://localhost:4200' } as NodeJS.ProcessEnv),
    {
      quizRepository,
      sessionRepository,
      interviewSessionService: new InterviewSessionService({
        quizRepository, sessionRepository, now: () => clock, random: seededRandomSource(3)
      }),
      now: () => clock
    }
  );
});
afterEach(() => handle.close());

async function startAttempt(quizId = 'rxjs') {
  const res = await request(app).post(`/api/quizzes/${quizId}/attempts`).send({});
  expect(res.status).toBe(201);
  return res.body as { attemptReceipt: string; expiresAt: number; durationSeconds: number };
}

/**
 * Start ONE question's timer and return its signed receipt.
 *
 * The Topic Quiz timer is per-question, so this — not the attempt receipt — is
 * what authorizes a reveal by expiry.
 */
async function startQuestion(quizId: string, questionText: string, attemptReceipt: string) {
  const res = await request(app)
    .post(`/api/quizzes/${quizId}/questions/start`)
    .set('X-Attempt-Receipt', attemptReceipt)
    .send({ questionText });
  expect(res.status).toBe(201);
  return res.body as { questionReceipt: string; expiresAt: number; startedAt: number };
}

/** Raw check — the caller supplies the question receipt verbatim. */
function check(quizId: string, questionReceipt: string, body: unknown) {
  return request(app)
    .post(`/api/quizzes/${quizId}/check`)
    .set('X-Question-Receipt', questionReceipt)
    .send(body as object);
}

/**
 * The normal client sequence: activate the question, then answer it.
 *
 * Used where the test is about ANSWER behaviour rather than receipt handling.
 * `questionText` comes from the body, so the receipt is always bound to the
 * question actually being submitted.
 */
async function answer(quizId: string, attemptReceipt: string, body: unknown) {
  const { questionText } = body as { questionText: string };
  const { questionReceipt } = await startQuestion(quizId, questionText, attemptReceipt);
  return check(quizId, questionReceipt, body);
}

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) { for (const i of value) keysDeep(i, out); return out; }
  for (const [k, n] of Object.entries(value)) { out.push(k); keysDeep(n, out); }
  return out;
}


function finalize(quizId: string, headers: { attempt?: string; proof?: string }) {
  let req = request(app).post(`/api/quizzes/${quizId}/attempts/finalize`);
  if (headers.attempt !== undefined) req = req.set('X-Attempt-Receipt', headers.attempt);
  if (headers.proof !== undefined) req = req.set('X-Finalization-Proof', headers.proof);
  return req.send({});
}

function review(quizId: string, headers: { attempt?: string; finalization?: string; proof?: string }) {
  let req = request(app).post(`/api/quizzes/${quizId}/review`);
  if (headers.attempt !== undefined) req = req.set('X-Attempt-Receipt', headers.attempt);
  if (headers.finalization !== undefined) req = req.set('X-Attempt-Finalization', headers.finalization);
  if (headers.proof !== undefined) req = req.set('X-Finalization-Proof', headers.proof);
  return req.send({});
}

const Q1 = 'Which answer is correct?';
const Q2 = 'Select every operator';
const Q3 = 'Is a Subject also an Observable?';

describe('verified-attempt proofs from /check', () => {
  it('a resolved answer (right or wrong) carries a proof, which reveals nothing about correctness', async () => {
    const attempt = await startAttempt();
    for (const pick of ['A multicast observable', 'A pipe']) {
      const res = await answer('rxjs', attempt.attemptReceipt, { questionText: Q1, selectedOptionTexts: [pick] });
      expect(res.status).toBe(200);
      expect(typeof res.body.finalizationProof).toBe('string');
      const payload = decodeAttemptReceiptUnverified(res.body.finalizationProof) as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['kind', 'questionText', 'quizId', 'startedAt', 'status', 'v']);
      expect(JSON.stringify(payload)).not.toMatch(/multicast|explanation/i);
    }
  });

  it('a partial multiple-answer response WITH a selection carries a proof; one with nothing selected does not', async () => {
    const attempt = await startAttempt();
    const partial = await answer('rxjs', attempt.attemptReceipt, { questionText: Q2, selectedOptionTexts: ['map'] });
    expect(partial.body.status).toBe('incomplete');
    expect(typeof partial.body.finalizationProof).toBe('string');

    const empty = await answer('rxjs', attempt.attemptReceipt, { questionText: Q2, selectedOptionTexts: [] });
    expect(empty.body.status).toBe('incomplete');
    expect(empty.body.finalizationProof).toBeUndefined();
  });

  it('an expiry reveal carries a proof', async () => {
    const attempt = await startAttempt();
    const q = await startQuestion('rxjs', Q3, attempt.attemptReceipt);
    clock = q.expiresAt + 1;
    const res = await check('rxjs', q.questionReceipt, { questionText: Q3, selectedOptionTexts: [] });
    expect(res.body.status).toBe('expired');
    expect(typeof res.body.finalizationProof).toBe('string');
  });
});

async function verifiedAttempt() {
  const attempt = await startAttempt();
  const res = await answer('rxjs', attempt.attemptReceipt, { questionText: Q1, selectedOptionTexts: ['A pipe'] });
  return { attempt: attempt.attemptReceipt, proof: res.body.finalizationProof as string };
}

async function finalizedAttempt() {
  const { attempt, proof } = await verifiedAttempt();
  const res = await finalize('rxjs', { attempt, proof });
  expect(res.status).toBe(201);
  return { attempt, proof, finalization: res.body.finalizationReceipt as string };
}

describe('POST /quizzes/:quizId/attempts/finalize', () => {
  it('finalizes an attempt that has a verified answer, even though every other question is skipped', async () => {
    const { attempt, proof } = await verifiedAttempt();
    const res = await finalize('rxjs', { attempt, proof });
    expect(res.status).toBe(201);
    expect(res.body.quizId).toBe('rxjs');
    expect(typeof res.body.finalizationReceipt).toBe('string');
    // nothing about answers rides along
    expect(Object.keys(res.body).sort()).toEqual(['finalizationReceipt', 'quizId']);
    expect(JSON.stringify(res.body)).not.toMatch(/multicast|explanation|correct/i);
  });

  it('refuses without a proof, without an attempt receipt, or with garbage (a uniform 401)', async () => {
    const { attempt, proof } = await verifiedAttempt();
    for (const headers of [{ attempt }, { proof }, {}, { attempt, proof: 'x.y' }, { attempt: 'x.y', proof }, { attempt: proof, proof: attempt }]) {
      expect((await finalize('rxjs', headers)).status).toBe(401);
    }
  });

  it('an attempt with nothing verified cannot be finalized (an empty submission earns no proof)', async () => {
    const attempt = await startAttempt();
    const q = await startQuestion('rxjs', Q1, attempt.attemptReceipt);
    const res = await check('rxjs', q.questionReceipt, { questionText: Q1, selectedOptionTexts: [] });
    expect(res.body.finalizationProof).toBeUndefined();
    expect((await finalize('rxjs', { attempt: attempt.attemptReceipt, proof: q.questionReceipt })).status).toBe(401);
  });

  it('is bound to its quiz and to its attempt', async () => {
    const { attempt, proof } = await verifiedAttempt();
    const other = await startAttempt('signals');
    expect((await finalize('signals', { attempt: other.attemptReceipt, proof })).status).toBe(401);
    expect((await finalize('signals', { attempt, proof })).status).toBe(401);

    clock += 10 * 60 * 1000; // well past the first attempt window
    const later = await startAttempt();
    expect((await finalize('rxjs', { attempt: later.attemptReceipt, proof })).status).toBe(401);
  });
});

describe('POST /quizzes/:quizId/review', () => {
  it('releases every question authorized correct options and explanation, in source order, once the attempt is FINALIZED', async () => {
    const { attempt, finalization } = await finalizedAttempt();
    const res = await review('rxjs', { attempt, finalization });
    expect(res.status).toBe(200);
    expect(res.body.quizId).toBe('rxjs');
    expect(res.body.questions).toEqual([
      { questionText: Q1, correctOptionTexts: ['A multicast observable'], explanation: 'Because a Subject multicasts.' },
      { questionText: Q2, correctOptionTexts: ['map', 'filter'], explanation: 'map and filter are operators.' },
      { questionText: Q3, correctOptionTexts: ['True'], explanation: 'Yes — Subject extends Observable.' },
      { questionText: 'Which selector is used for routing?', correctOptionTexts: ['<router-outlet>'], explanation: 'The router outlet.' }
    ]);
  });

  it('is DENIED before finalization: with only the attempt receipt, or only a /check proof', async () => {
    const { attempt, proof } = await verifiedAttempt();
    const bareAttempt = await review('rxjs', { attempt });
    expect(bareAttempt.status).toBe(401);
    // a normal /check proof alone must never authorize the whole answer key, under either header name
    expect((await review('rxjs', { attempt, proof })).status).toBe(401);
    expect((await review('rxjs', { attempt, finalization: proof })).status).toBe(401);
    for (const res of [bareAttempt]) {
      expect(JSON.stringify(res.body)).not.toMatch(/multicast|explanation|correctOptionTexts/);
    }
  });

  it('carries no verdicts, options, identifiers or per-option flags (nothing that marks a question answered or expired)', async () => {
    const { attempt, finalization } = await finalizedAttempt();
    const res = await review('rxjs', { attempt, finalization });
    const banned = ['options', 'isCorrect', 'correct', 'status', 'expired', 'selectedVerdicts', 'id', 'questionId', 'optionId'];
    expect(keysDeep(res.body).filter((k) => banned.includes(k))).toEqual([]);
  });

  it('refuses garbage and a missing finalization with a uniform 401', async () => {
    const { attempt, finalization } = await finalizedAttempt();
    for (const headers of [{ attempt }, { finalization }, {}, { attempt, finalization: 'x.y' }, { attempt: 'x.y', finalization }, { attempt: finalization, finalization: attempt }]) {
      const res = await review('rxjs', headers);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toMatch(/multicast|explanation|correctOptionTexts/);
    }
  });

  it('a finalization is bound to its quiz and its attempt', async () => {
    const first = await finalizedAttempt();
    const otherAttempt = await startAttempt('signals');
    expect((await review('signals', { attempt: otherAttempt.attemptReceipt, finalization: first.finalization })).status).toBe(401);
    expect((await review('signals', { attempt: first.attempt, finalization: first.finalization })).status).toBe(401);

    clock += 10 * 60 * 1000;
    const second = await startAttempt(); // a NEW attempt at the same quiz is not finalized
    expect((await review('rxjs', { attempt: second.attemptReceipt, finalization: first.finalization })).status).toBe(401);
  });

  it('a tampered finalization is refused', async () => {
    const { attempt, finalization } = await finalizedAttempt();
    const [payload, sig] = finalization.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), quizId: 'signals' })).toString('base64url');
    expect((await review('rxjs', { attempt, finalization: forged + '.' + sig })).status).toBe(401);
  });

  it('an unknown quiz is a 401 or 404, never a reveal', async () => {
    const { attempt, finalization } = await finalizedAttempt();
    expect([401, 404]).toContain((await review('nope', { attempt, finalization })).status);
  });

  it('answer protection before finalization is unchanged: /check still reveals one question at a time', async () => {
    const attempt = await startAttempt();
    const res = await answer('rxjs', attempt.attemptReceipt, { questionText: Q2, selectedOptionTexts: ['map'] });
    expect(res.body.correctOptionTexts).toBeUndefined();
    expect(res.body.explanation).toBeUndefined();
  });
});
