import { QuizSetupService } from './quiz-setup.service';

/**
 * The page-level Enter shortcut (Enter = Next / Show Results) applies only where focus is on non-interactive content. A focused
 * button, link or editable control keeps its own Enter behaviour, so the shortcut never advances on its behalf.
 */
function run(target: Element | Window, over: { next?: boolean; results?: boolean; key?: string } = {}) {
  const advance = jest.fn().mockResolvedValue(undefined);
  const toResults = jest.fn();
  const previous = jest.fn().mockResolvedValue(undefined);
  const host = {
    shouldShowNextButton: () => over.next !== false,
    nextButtonEnabled: () => true,
    advanceToNextQuestion: advance,
    advanceToPreviousQuestion: previous,
    get shouldShowResultsButton() {
      return over.results === true;
    },
    advanceToResults: toResults
  };
  const self = {
    quizService: { getCurrentQuestionIndex: () => 0 },
    quizStateService: { isQuestionAnswered: () => true },
    selectedOptionService: { isQuestionAnswered: () => true },
    timerService: { expiredForQuestionIndexSig: () => -1 }
  };
  const event = new KeyboardEvent('keydown', { key: over.key ?? 'Enter', bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  const done = (QuizSetupService.prototype as any).runOnGlobalKey.call(self, host, event) as Promise<void>;
  return { event, advance, toResults, previous, done };
}

const el = (html: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root.firstElementChild as HTMLElement;
};

afterEach(() => (document.body.innerHTML = ''));

describe('page-level Enter shortcut', () => {
  it('still advances exactly once when focus is on non-interactive page content', async () => {
    for (const target of [document.body, el('<h3>Question</h3>'), el('<div tabindex="-1">region</div>')]) {
      const { event, advance, done } = run(target);
      await done;
      expect(advance).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('opens Results from page content on the last question (the Show Results shortcut still works)', async () => {
    const { toResults, advance, done } = run(document.body, { next: false, results: true });
    await done;
    expect(toResults).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
  });

  it('does NOT advance when Enter comes from the quiz logo button, and leaves the event for the button to activate', async () => {
    const logo = el('<button type="button" class="quiz-header__logo" aria-label="Angular Quiz Platform"><img alt="" aria-hidden="true"></button>');
    const { event, advance, toResults, done } = run(logo);
    await done;
    expect(advance).not.toHaveBeenCalled();
    expect(toResults).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false); // the native click that navigates to Quiz Selection is not cancelled
  });

  it('does not advance for another focused button or its descendants', async () => {
    const button = el('<button type="button"><i class="material-icons">restart_alt</i></button>');
    for (const target of [button, button.querySelector('i')!]) {
      const { event, advance, done } = run(target);
      await done;
      expect(advance).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('does not act for the Next button itself: it is activated natively, exactly once', async () => {
    const nextButton = el('<button type="button" class="nav-btn" aria-label="Next Question"></button>');
    const onClick = jest.fn();
    nextButton.addEventListener('click', onClick);
    const { event, advance, done } = run(nextButton);
    await done;
    expect(advance).not.toHaveBeenCalled(); // the shortcut stays out of the way...
    expect(event.defaultPrevented).toBe(false);
    nextButton.click(); // ...and the browser's own Enter activation is the single advance
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not act for links, inputs or editable content', async () => {
    for (const target of [el('<a href="/x">x</a>'), el('<input>'), el('<textarea></textarea>'), el('<div contenteditable="true">x</div>')]) {
      const { event, advance, done } = run(target);
      await done;
      expect(advance).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('leaves ArrowRight and ArrowLeft as they were (global, whatever has focus)', async () => {
    const logo = el('<button type="button">x</button>');
    const right = run(logo, { key: 'ArrowRight' });
    await right.done;
    expect(right.advance).toHaveBeenCalledTimes(1);
  });
});
