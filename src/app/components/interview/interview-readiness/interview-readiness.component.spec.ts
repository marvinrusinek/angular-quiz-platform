import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InterviewReadiness } from '@shared/models';
import { InterviewReadinessComponent } from './interview-readiness.component';

function ready(over: Partial<InterviewReadiness> = {}): InterviewReadiness {
  return {
    status: 'ready',
    score: 84,
    band: 'strong',
    recentPerformance: 86,
    consistency: 78,
    rawConsistency: 90,
    topicCoverage: 70,
    topicStrength: 82,
    coverageAvailable: true,
    practicedTopicCount: 6,
    eligibleTopicCount: 8,
    strongestFactor: 'recent-performance',
    limitingFactor: 'topic-coverage',
    explanation:
      'Your recent interview scores are strong. Topic coverage is currently limiting your readiness.',
    recommendations: [
      'Review Signals and HTTP.',
      'Complete interviews covering additional Angular topics to broaden your coverage.'
    ],
    attemptsUsed: 4,
    totalAttempts: 4,
    ...over
  };
}

function insufficient(): InterviewReadiness {
  return {
    ...ready(),
    status: 'insufficient',
    score: 0,
    totalAttempts: 1,
    attemptsUsed: 1,
    recommendations: [],
    explanation: ''
  };
}

describe('InterviewReadinessComponent', () => {
  let fixture: ComponentFixture<InterviewReadinessComponent>;

  function render(r: InterviewReadiness | null, compact = false): HTMLElement {
    fixture = TestBed.createComponent(InterviewReadinessComponent);
    fixture.componentRef.setInput('readiness', r);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [InterviewReadinessComponent] }));

  it('renders nothing when readiness is null', () => {
    expect(render(null).querySelector('.readiness')).toBeNull();
  });

  it('27. displays the score and band', () => {
    const el = render(ready());
    expect(el.querySelector('.readiness__score')?.textContent).toContain('84');
    expect(el.querySelector('.readiness__band')?.textContent).toContain('Strong');
  });

  it('28. displays all four factor values', () => {
    const nums = Array.from(render(ready()).querySelectorAll('.readiness__factor-num')).map((n) =>
      n.textContent?.trim()
    );
    expect(nums).toEqual(['86', '78', '70', '82']);
  });

  it('displays the recommendations (at most two)', () => {
    const items = render(ready()).querySelectorAll('.readiness__recs-list li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Review');
  });

  it('29. displays the limited-data state for one attempt', () => {
    const el = render(insufficient());
    expect(el.querySelector('.readiness__limited')?.textContent).toContain(
      'Complete at least one more interview'
    );
    expect(el.querySelector('.readiness__limited-sub')?.textContent).toContain(
      'first result has been recorded'
    );
    expect(el.querySelector('.readiness__factors')).toBeNull();
  });

  it('30. exposes the readiness summary as ONE text item in a group, not a "graphic" (role="img")', () => {
    const el = render(ready());
    const summary = el.querySelector('.readiness__summary')!;
    expect(summary.getAttribute('role')).toBe('group');
    expect(summary.hasAttribute('aria-label')).toBe(false);
    expect(el.querySelector('[role="img"]')).toBeNull();
    const items = summary.querySelectorAll(':scope > .intro-exposed-text');
    expect(items).toHaveLength(1);
    const phrase = items[0]!.textContent!;
    expect(phrase).toContain('Interview readiness score: 84 out of 100');
    expect(phrase).toContain('Strong');
    // The explanation is folded into the same phrase, not a separate stop.
    expect(phrase).toContain(
      'Your recent interview scores are strong. Topic coverage is currently limiting your readiness.'
    );
  });

  it('hides the visible score, band and explanation from AT, and leaves them unchanged', () => {
    const el = render(ready());
    const visible = el.querySelector('.readiness__summary > [data-intro-visible]')!;
    expect(visible.getAttribute('aria-hidden')).toBe('true');
    expect(visible.querySelector('.readiness__score-row')).not.toBeNull();
    expect(visible.querySelector('.readiness__explanation')!.textContent).toContain(
      'Your recent interview scores are strong.'
    );
    expect(visible.querySelector('.readiness__score')!.textContent).toContain('84');
  });

  it('exposes one combined "label, value" phrase per factor row, with no duplicate label speech', () => {
    const el = render(ready());
    const rows = el.querySelectorAll('.readiness__factor');
    expect(rows.length).toBe(4);
    rows.forEach((row) => {
      expect(row.getAttribute('role')).toBe('group');
      expect(row.querySelector('.readiness__factor-label')?.getAttribute('aria-hidden')).toBe('true');
      expect(row.querySelector('.readiness__factor-value')?.getAttribute('aria-hidden')).toBe('true');
      expect(row.querySelector('.readiness__bar')?.getAttribute('role')).toBeNull();
    });
    const phrases = Array.from(rows).map(
      (row) => row.querySelector('.readiness__factor-hidden')!.textContent!.trim()
    );
    expect(phrases).toEqual([
      'Recent Performance: 86 out of 100',
      'Consistency: 78 out of 100',
      'Topic Coverage: 70 out of 100',
      'Topic Strength: 82 out of 100'
    ]);
  });

  it('combines the label and practiced-count note into one phrase when coverage is unavailable', () => {
    const el = render(ready({ coverageAvailable: false, practicedTopicCount: 4 }));
    const rows = el.querySelectorAll('.readiness__factor');
    const coverageRow = rows[2]; // Topic Coverage is the third factor
    expect(coverageRow.querySelector('.readiness__factor-hidden')!.textContent!.trim()).toBe(
      'Topic Coverage, 4 topics practiced'
    );
  });

  it('combines the limited-data sentences into one phrase for the insufficient-history state', () => {
    const el = render(insufficient());
    const summary = el.querySelector('.readiness__summary')!;
    expect(summary.getAttribute('role')).toBe('group');
    const phrase = summary.querySelector(':scope > .intro-exposed-text')!.textContent!;
    expect(phrase).toContain('Complete at least one more interview to calculate your readiness score');
    expect(phrase).toContain('Your first result has been recorded');
    expect(summary.querySelector(':scope > [data-intro-visible]')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.readiness__limited')).not.toBeNull();
    expect(el.querySelector('[role="img"]')).toBeNull();
  });

  describe('the heading is ONE reading stop ("Heading level 2, Interview Readiness")', () => {
    // Narrator split it ("Heading level 2 Interview ... heading level 2 Readiness") while it was named by
    // BOTH an aria-label and its text. It is now one h2 with one exposed text item and no aria-label.
    const cases: [string, boolean][] = [
      ['compact (Interview History)', true],
      ['full (Interview Results)', false]
    ];

    cases.forEach(([label, compact]) => {
      it(`is one real h2 with ONE exposed text item and no aria-label — ${label}`, () => {
        const el = render(ready(), compact);
        const heading = el.querySelector('h2#readiness-heading')!;
        expect(heading.tagName).toBe('H2');
        expect(heading.hasAttribute('aria-label')).toBe(false);
        expect(heading.hasAttribute('aria-labelledby')).toBe(false);
        const items = heading.querySelectorAll(':scope > .intro-exposed-text');
        expect(items).toHaveLength(1);
        expect(items[0]!.textContent).toBe('Interview Readiness');
        // the exposed text is ONE text node, so it cannot be split into two stops
        expect(items[0]!.childNodes).toHaveLength(1);
        expect(items[0]!.firstChild!.nodeType).toBe(Node.TEXT_NODE);
      });

      it(`hides the visible heading text from AT and leaves it as it was — ${label}`, () => {
        const el = render(ready(), compact);
        const visible = el.querySelector('#readiness-heading > [data-intro-visible]')!;
        expect(visible.getAttribute('aria-hidden')).toBe('true');
        expect(visible.textContent!.trim()).toBe('Interview Readiness');
        // only the exposed item is reachable inside the heading
        // (element and text nodes only: the template outlet leaves a comment node)
        const reachable = Array.from(el.querySelector('#readiness-heading')!.childNodes)
          .filter((n) => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE)
          .filter((n) => !(n as Element).getAttribute?.('aria-hidden'))
          .map((n) => (n.textContent ?? '').trim())
          .filter(Boolean);
        expect(reachable).toEqual(['Interview Readiness']);
      });

      it(`still names the region by this heading — ${label}`, () => {
        const el = render(ready(), compact);
        const region = el.querySelector('section.readiness')!;
        expect(region.getAttribute('aria-labelledby')).toBe('readiness-heading');
        expect(el.querySelector('#readiness-heading')).not.toBeNull();
      });
    });

    it('is the same heading when there is limited data', () => {
      const el = render(insufficient());
      const items = el.querySelectorAll('#readiness-heading > .intro-exposed-text');
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toBe('Interview Readiness');
    });
  });

  it('keeps "Interview Readiness" as a real, separately-navigable heading, outside the summary object', () => {
    const el = render(ready());
    const heading = el.querySelector('#readiness-heading')!;
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toContain('Interview Readiness');
    expect(heading.closest('.readiness__summary')).toBeNull();
    expect(heading.getAttribute('aria-hidden')).toBeNull();
  });

  // CANDIDATE fix for a reported heading-splitting issue (see the .html
  // file's own comment) — unconfirmed without a live Narrator retest. Only
  // the name's SOURCE changes (attribute instead of content); everything
  // else about the heading (tag, visible text, role, level) stays the same.
  it('keeps the heading an h2 whose name comes from its one exposed text item (no aria-label), with the same visible text', () => {
    const el = render(ready());
    const heading = el.querySelector('#readiness-heading')!;
    expect(heading.tagName).toBe('H2');
    expect(heading.hasAttribute('aria-label')).toBe(false);
    expect(heading.querySelector(':scope > .intro-exposed-text')!.textContent).toBe('Interview Readiness');
    expect(heading.querySelector(':scope > [data-intro-visible]')!.textContent!.trim()).toBe('Interview Readiness');
  });

  it('names the section via the heading it contains (unchanged; a region/heading double-announcement theory was tried and ruled out by retest)', () => {
    const el = render(ready());
    const section = el.querySelector('section.readiness')!;
    expect(section.getAttribute('aria-labelledby')).toBe('readiness-heading');
    const heading = el.querySelector('#readiness-heading')!;
    expect(heading.tagName).toBe('H2');
    expect(heading.textContent).toContain('Interview Readiness');
  });

  it('introduces no new tabindex or live regions on the grouped objects', () => {
    const el = render(ready());
    el.querySelectorAll('[role="img"], [role="group"], .readiness__factor-hidden').forEach((node) => {
      expect(node.getAttribute('tabindex')).toBeNull();
      expect(node.getAttribute('aria-live')).toBeNull();
    });
  });

  it('shows "Based on N completed interviews" for 2–4 attempts', () => {
    expect(
      render(ready({ totalAttempts: 3 })).querySelector('.readiness__basedon')?.textContent
    ).toContain('Based on 3 completed interviews');
  });

  it('shows the 5-most-recent note for 5+ attempts', () => {
    expect(
      render(ready({ totalAttempts: 7 })).querySelector('.readiness__basedon')?.textContent
    ).toContain('5 most recent');
  });

  it('surfaces a practiced-topic note when coverage is unavailable', () => {
    const el = render(ready({ coverageAvailable: false, practicedTopicCount: 4 }));
    expect(el.querySelector('.readiness__factor-note')?.textContent).toContain(
      '4 topics practiced'
    );
  });

  it('compact mode hides the factor breakdown and recommendations', () => {
    const el = render(ready(), true);
    expect(el.querySelector('.readiness--compact')).not.toBeNull();
    expect(el.querySelector('.readiness__score')?.textContent).toContain('84');
    expect(el.querySelector('.readiness__factors')).toBeNull();
    expect(el.querySelector('.readiness__recs')).toBeNull();
  });

  it('31/32. applies a band class (theme/contrast hook) without relying on colour alone', () => {
    // Band text label is always present; the class is only a styling hook.
    const el = render(ready({ band: 'interview-ready' }));
    expect(el.querySelector('.readiness--interview-ready')).not.toBeNull();
    expect(el.querySelector('.readiness__band')?.textContent).toContain('Interview Ready');
  });
});

describe('InterviewReadinessComponent — asPage', () => {
  function mount(asPage: boolean): HTMLElement {
    TestBed.configureTestingModule({ imports: [InterviewReadinessComponent] });
    const f = TestBed.createComponent(InterviewReadinessComponent);
    f.componentRef.setInput('readiness', ready());
    f.componentRef.setInput('asPage', asPage);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('renders the heading as the page h1 with no named region when asPage', () => {
    const el = mount(true);
    expect(el.querySelector('h1#readiness-heading')).not.toBeNull();
    expect(el.querySelector('h2#readiness-heading')).toBeNull();
    expect(el.querySelector('section')!.hasAttribute('aria-labelledby')).toBe(false);
    expect(el.querySelector('.readiness__recs-heading')!.tagName).toBe('H2');
  });

  it('keeps the h2 and the named region when embedded (Interview Results)', () => {
    const el = mount(false);
    expect(el.querySelector('.readiness__recs-heading')!.tagName).toBe('H3');
    expect(el.querySelector('h2#readiness-heading')).not.toBeNull();
    expect(el.querySelector('h1')).toBeNull();
    expect(el.querySelector('section')!.getAttribute('aria-labelledby')).toBe('readiness-heading');
  });
});
