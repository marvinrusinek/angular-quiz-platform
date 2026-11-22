import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { of } from 'rxjs';

import { QuizGuard } from './quiz-guard';
import { TopicQuizMetadataService } from '@shared/services/api/topic-quiz-metadata.service';
import { QuizService } from '@shared/services/data/quiz.service';
import { QuizProgressionService } from '@shared/services/flow/quiz-progression.service';

/**
 * S6h — the guard no longer reads the bundled answer-bearing bank via
 * QuizDataService.getCachedQuizById()/getCurrentQuizSnapshot(). Index
 * validation now comes from TopicQuizMetadataService.questionCountByQuiz(),
 * the same API-backed metadata source the resolver already uses.
 *
 * The guard validates the index only (any valid index may be opened directly); the
 * `progressionService` stub exists to prove routing no longer consults it. The
 * `describe('direct entry to any valid question index')` block covers that.
 */
describe('QuizGuard', () => {
  let guard: QuizGuard;
  let router: any;
  let metadataApi: any;
  let quizService: any;
  let progressionService: any;

  const mockRouterState = {} as RouterStateSnapshot;
  const mockUrlTree = new UrlTree();

  function makeRoute(params: Record<string, string>): ActivatedRouteSnapshot {
    return { params } as unknown as ActivatedRouteSnapshot;
  }

  function setCounts(counts: Record<string, number | null>): void {
    metadataApi.questionCountByQuiz.mockReturnValue(new Map(Object.entries(counts)));
  }

  beforeEach(() => {
    router = { createUrlTree: jest.fn().mockReturnValue(mockUrlTree) };

    metadataApi = {
      load: jest.fn().mockReturnValue(of([])),
      questionCountByQuiz: jest.fn().mockReturnValue(new Map())
    };

    quizService = { questions: [] };

    progressionService = {
      getFurthestUnlocked: jest.fn().mockReturnValue(Number.MAX_SAFE_INTEGER),
      unlockThrough: jest.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        QuizGuard,
        { provide: Router, useValue: router },
        { provide: TopicQuizMetadataService, useValue: metadataApi },
        { provide: QuizService, useValue: quizService },
        { provide: QuizProgressionService, useValue: progressionService }
      ]
    });
    guard = TestBed.inject(QuizGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('redirects to /quiz when quizId is missing — no metadata call made', (done) => {
    (guard.canActivate(makeRoute({}), mockRouterState) as any).subscribe((result: unknown) => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/quiz']);
      expect(result).toBeInstanceOf(UrlTree);
      expect(metadataApi.load).not.toHaveBeenCalled();
      done();
    });
  });

  it('redirects to question 1 when questionIndex is missing — no metadata call made', (done) => {
    (guard.canActivate(makeRoute({ quizId: 'angular' }), mockRouterState) as any).subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/quiz/question', 'angular', 1]);
      expect(metadataApi.load).not.toHaveBeenCalled();
      done();
    });
  });

  it('redirects to intro when questionIndex is non-numeric (malformed)', (done) => {
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: 'abc' }),
        mockRouterState
      ) as any
    ).subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/quiz/intro', 'angular']);
      done();
    });
  });

  it('redirects to question 1 when questionIndex < 1 (invalid low)', (done) => {
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '0' }),
        mockRouterState
      ) as any
    ).subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/quiz/question', 'angular', 1]);
      done();
    });
  });

  it('allows navigation when the quiz is unknown to metadata (let resolver load/redirect)', (done) => {
    setCounts({});
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '1' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true);
      done();
    });
  });

  it('allows navigation for the first question', (done) => {
    setCounts({ angular: 3 });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '1' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true);
      done();
    });
  });

  it('allows navigation for a middle question', (done) => {
    setCounts({ angular: 3 });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '2' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true);
      done();
    });
  });

  it('allows navigation for the last question', (done) => {
    setCounts({ angular: 3 });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '3' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true);
      done();
    });
  });

  it('clamps an out-of-bounds (too high) question index to the max', (done) => {
    setCounts({ angular: 2 });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '5' }),
        mockRouterState
      ) as any
    ).subscribe(() => {
      expect(router.createUrlTree).toHaveBeenCalledWith(['/quiz/question', 'angular', 2]);
      done();
    });
  });

  it('a quiz known to metadata but with no reported count is treated as unknown (deferred)', (done) => {
    setCounts({ angular: null });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '5' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true);
      done();
    });
  });

  it('falls back to QuizService.questions.length when it exceeds the metadata count', (done) => {
    setCounts({ angular: 2 });
    quizService.questions = [{}, {}, {}, {}]; // 4 live questions, metadata says 2
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '4' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true); // index 4 is in range once the live count is used
      done();
    });
  });

  it('a metadata/API failure never throws — TopicQuizMetadataService.load() fails soft to []', (done) => {
    metadataApi.load.mockReturnValue(of([])); // load() never rejects (fails soft), mirrors production
    setCounts({});
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '1' }),
        mockRouterState
      ) as any
    ).subscribe((result: unknown) => {
      expect(result).toBe(true); // unknown-to-metadata path — resolver handles it
      done();
    });
  });

  it('requires no QuizDataService and no bank Quiz object — the guard only calls metadataApi + quizService.questions', (done) => {
    setCounts({ angular: 3 });
    (
      guard.canActivate(
        makeRoute({ quizId: 'angular', questionIndex: '2' }),
        mockRouterState
      ) as any
    ).subscribe(() => {
      expect(metadataApi.load).toHaveBeenCalled();
      expect(metadataApi.questionCountByQuiz).toHaveBeenCalled();
      done();
    });
  });

  describe('direct entry to any valid question index', () => {
    const open = (quizId: string, questionIndex: string): Promise<unknown> =>
      new Promise((resolve) =>
        (guard.canActivate(makeRoute({ quizId, questionIndex }), mockRouterState) as any).subscribe(resolve)
      );

    it('a brand-new attempt (nothing answered) may open question 3 directly, and 5 of 6', async () => {
      setCounts({ angular: 6 });
      progressionService.getFurthestUnlocked.mockReturnValue(1); // the old progression marker would have said "only 1"
      expect(await open('angular', '3')).toBe(true);
      expect(await open('angular', '5')).toBe(true);
    });

    it('jumping from /3 to /5 is allowed regardless of earlier answers', async () => {
      setCounts({ angular: 7 });
      progressionService.getFurthestUnlocked.mockReturnValue(3);
      expect(await open('angular', '3')).toBe(true);
      expect(await open('angular', '5')).toBe(true);
      expect(await open('angular', '7')).toBe(true);
    });

    it('routing no longer consults the progression marker (no recording, no reading)', async () => {
      setCounts({ angular: 6 });
      await open('angular', '5');
      expect(progressionService.getFurthestUnlocked).not.toHaveBeenCalled();
      expect(progressionService.unlockThrough).not.toHaveBeenCalled();
    });

    it('index validation is kept: out-of-range still redirects, malformed still goes to intro, < 1 to question 1', async () => {
      setCounts({ angular: 6 });
      await open('angular', '99');
      expect(router.createUrlTree).toHaveBeenLastCalledWith(['/quiz/question', 'angular', 6]);
      await open('angular', 'abc');
      expect(router.createUrlTree).toHaveBeenLastCalledWith(['/quiz/intro', 'angular']);
      await open('angular', '0');
      expect(router.createUrlTree).toHaveBeenLastCalledWith(['/quiz/question', 'angular', 1]);
    });
  });
});
