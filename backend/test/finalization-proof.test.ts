import {
  FinalizationProofError,
  issueFinalizationProof,
  verifyFinalizationProof,
  type FinalizationProofPayload
} from '../src/quiz/finalization-proof';
import { issueQuestionReceipt } from '../src/quiz/question-receipt';
import { RECEIPT_VERSION } from '../src/quiz/receipt-codec';

const SECRET = 'test-secret-for-proofs';
const payload: FinalizationProofPayload = {
  v: RECEIPT_VERSION,
  kind: 'finalization-proof',
  quizId: 'rxjs',
  questionText: 'Which answer is correct?',
  status: 'resolved',
  startedAt: 1_700_000_000_000
};

describe('finalization proof', () => {
  it('round-trips and returns only the known fields', () => {
    const proof = issueFinalizationProof(payload, SECRET);
    expect(verifyFinalizationProof(proof, SECRET)).toEqual(payload);
  });

  it('rejects a different secret, a tampered payload and garbage, always with the same message', () => {
    const proof = issueFinalizationProof(payload, SECRET);
    const [body, sig] = proof.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...payload, status: 'expired' })).toString('base64url');
    for (const bad of [proof, `${forged}.${sig}`, 'x.y', '', undefined, 42]) {
      const secret = bad === proof ? 'another-secret' : SECRET;
      expect(() => verifyFinalizationProof(bad, secret)).toThrow(new FinalizationProofError('Invalid finalization proof'));
    }
    void body;
  });

  it('is not interchangeable with a question receipt, and rejects unknown statuses', () => {
    const questionReceipt = issueQuestionReceipt(
      { v: RECEIPT_VERSION, quizId: 'rxjs', questionText: 'q', startedAt: 1, expiresAt: 2 },
      SECRET
    );
    expect(() => verifyFinalizationProof(questionReceipt, SECRET)).toThrow(FinalizationProofError);
    const odd = issueFinalizationProof({ ...payload, status: 'idle' as never }, SECRET);
    expect(() => verifyFinalizationProof(odd, SECRET)).toThrow(FinalizationProofError);
  });

  it('carries no correctness, explanation or selection', () => {
    const proof = issueFinalizationProof(payload, SECRET);
    const decoded = JSON.parse(Buffer.from(proof.split('.')[0]!, 'base64url').toString());
    expect(Object.keys(decoded).sort()).toEqual(['kind', 'questionText', 'quizId', 'startedAt', 'status', 'v']);
  });
});

import {
  issueAttemptFinalization,
  verifyAttemptFinalization
} from '../src/quiz/finalization-proof';

describe('attempt finalization', () => {
  const fin = {
    v: RECEIPT_VERSION,
    kind: 'attempt-finalization' as const,
    quizId: 'rxjs',
    attemptStartedAt: 1_700_000_000_000,
    finalizedAt: 1_700_000_060_000
  };

  it('round-trips, and is a different record from a verified-attempt proof', () => {
    const receipt = issueAttemptFinalization(fin, SECRET);
    expect(verifyAttemptFinalization(receipt, SECRET)).toEqual(fin);
    // a /check proof can never stand in for a finalization, and vice versa
    const proof = issueFinalizationProof(payload, SECRET);
    expect(() => verifyAttemptFinalization(proof, SECRET)).toThrow(FinalizationProofError);
    expect(() => verifyFinalizationProof(receipt, SECRET)).toThrow(FinalizationProofError);
  });

  it('rejects another secret, garbage and tampering with one uniform message', () => {
    const receipt = issueAttemptFinalization(fin, SECRET);
    const [, sig] = receipt.split('.') as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...fin, quizId: 'signals' })).toString('base64url');
    for (const bad of ['x.y', '', undefined, 7, `${forged}.${sig}`]) {
      expect(() => verifyAttemptFinalization(bad, SECRET)).toThrow(new FinalizationProofError('Invalid finalization proof'));
    }
    expect(() => verifyAttemptFinalization(receipt, 'another-secret')).toThrow(FinalizationProofError);
  });
});
