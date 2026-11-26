import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { DifficultyFilter } from '@shared/models';

/**
 * Presentational difficulty FILTER: a compact native select offering
 * "All Difficulties", "Beginner", "Intermediate" and "Advanced".
 *
 * It only reflects the value it is given and emits the new one; it knows nothing
 * about quiz data, search or sorting — the parent owns the state and performs the
 * filtering. It is deliberately separate from the sort control: choosing a
 * difficulty here changes WHICH quizzes are shown, never their order.
 *
 * Accessibility comes from the native <select> itself (combobox semantics, arrow
 * keys, type-ahead, Escape, focus handling, the selected value announced); this
 * component only supplies the accessible name and a tooltip. Both are the same
 * fixed text ("Filter quizzes by difficulty") whichever difficulty is selected —
 * the selected value itself is what the control displays.
 */
@Component({
  selector: 'app-quiz-difficulty-filter',
  standalone: true,
  imports: [MatTooltipModule],
  templateUrl: './quiz-difficulty-filter.component.html',
  styleUrls: ['./quiz-difficulty-filter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuizDifficultyFilterComponent {
  readonly difficulty = input.required<DifficultyFilter>();

  readonly difficultyChange = output<DifficultyFilter>();

  onSelectionChange(value: DifficultyFilter): void {
    this.difficultyChange.emit(value);
  }
}
