import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { Transaction, TransactionType } from '../../models/transaction.model';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [ReactiveFormsModule, TitleCasePipe],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionFormComponent implements OnChanges {
  @Input() transaction: Transaction | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly transactionTypes: TransactionType[] = ['buy', 'sell', 'dividend', 'split'];

  form: FormGroup;
  saving = false;
  errorMessage = '';

  get isEditMode(): boolean {
    return this.transaction != null;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly state: StateService
  ) {
    this.form = this.buildForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transaction']) {
      this.form = this.buildForm();
      this.errorMessage = '';
    }
  }

  private buildForm(): FormGroup {
    const tx = this.transaction;
    return this.fb.group({
      date: [tx?.date ?? '', Validators.required],
      ticker: [tx?.ticker ?? '', [Validators.required, Validators.minLength(1)]],
      type: [tx?.type ?? 'buy', Validators.required],
      quantity: [
        tx?.quantity ?? '',
        [Validators.required, Validators.min(0.0000001)],
      ],
      price: [
        tx?.price ?? '',
        [Validators.required, Validators.min(0.0000001)],
      ],
      notes: [tx?.notes ?? ''],
    });
  }

  async onSave(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    const raw = this.form.value;
    const payload = {
      date: raw.date as string,
      ticker: (raw.ticker as string).toUpperCase().trim(),
      type: raw.type as TransactionType,
      quantity: Number(raw.quantity),
      price: Number(raw.price),
      notes: (raw.notes as string) ?? '',
    };

    try {
      if (this.isEditMode) {
        await this.state.editTransaction(this.transaction!.id, payload);
      } else {
        await this.state.addTransaction(payload);
      }
      this.saved.emit();
    } catch (err) {
      this.errorMessage = 'Failed to save transaction. Please try again.';
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.cancelled.emit();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancelled.emit();
    }
  }

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }
}
