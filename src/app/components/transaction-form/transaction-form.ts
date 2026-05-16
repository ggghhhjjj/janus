import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { Transaction, TransactionType } from '../../models/transaction.model';
import { StateService } from '../../services/state.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [ReactiveFormsModule, TitleCasePipe],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionFormComponent implements OnChanges, OnInit {
  /**
   * Transaction to edit. When `null` the form functions in "add" mode.
   */
  @Input() transaction: Transaction | null = null;

  /** Emitted when a transaction is successfully saved. */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the user cancels the form. */
  @Output() cancelled = new EventEmitter<void>();

  /** Supported transaction types for the `type` field (drives the UI select). */
  readonly transactionTypes: TransactionType[] = ['buy', 'sell', 'dividend', 'split', 'funding', 'withdrawal'];

  /** Reactive form backing the transaction editor. */
  form: FormGroup;

  /** True while a save operation is in progress. */
  saving = false;

  /** Human-facing error message displayed when save fails. */
  errorMessage = '';

  /** True when `transaction` input is provided (edit mode). */
  get isEditMode(): boolean {
    return this.transaction != null;
  }

  /**
   * @param fb FormBuilder used to construct the reactive form
   * @param state StateService used to persist and edit transactions
   * @param i18n Runtime i18n helper exposed to templates
   */
  constructor(
    private readonly fb: FormBuilder,
    private readonly state: StateService,
    readonly i18n: I18nService
  ) {
    this.form = this.buildForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transaction']) {
      this.form = this.buildForm();
      this.errorMessage = '';
      this.setupTypeChangeListener();
    }
  }

  ngOnInit(): void {
    this.setupTypeChangeListener();
  }

  private setupTypeChangeListener(): void {
    const typeCtrl = this.form.get('type');
    if (typeCtrl) {
      typeCtrl.valueChanges.subscribe((type: TransactionType) => {
        this.updateValidatorsForType(type);
      });
    }
  }

  private updateValidatorsForType(type: TransactionType): void {
    const isCash = type === 'funding' || type === 'withdrawal';
    const tickerCtrl = this.form.get('ticker');
    const priceCtrl = this.form.get('price');

    // Update ticker validators
    if (tickerCtrl) {
      if (isCash) {
        tickerCtrl.clearValidators();
        tickerCtrl.setValue('CASH');
        console.debug('[TransactionForm] Cash transaction: ticker not required');
      } else {
        tickerCtrl.setValidators([Validators.required, Validators.minLength(1)]);
        console.debug('[TransactionForm] Trading transaction: ticker required');
      }
      tickerCtrl.updateValueAndValidity({ emitEvent: false });
    }

    // Update price validators
    if (priceCtrl) {
      if (isCash) {
        priceCtrl.clearValidators();
        priceCtrl.setValue(1);
        console.debug('[TransactionForm] Cash transaction: price set to 1, not required');
      } else {
        priceCtrl.setValidators([Validators.required, Validators.min(0.0000001)]);
        console.debug('[TransactionForm] Trading transaction: price required');
      }
      priceCtrl.updateValueAndValidity({ emitEvent: false });
    }

    console.debug('[TransactionForm] Form valid:', this.form.valid, 'Errors:', this.form.errors);
  }

  private buildForm(): FormGroup {
    const tx = this.transaction;
    const isFundingOrWithdrawal = tx?.type === 'funding' || tx?.type === 'withdrawal';
    
    const group = this.fb.group({
      date: [tx?.date ?? '', Validators.required],
      time: [tx?.time ?? '', []],
      ticker: [isFundingOrWithdrawal ? 'CASH' : (tx?.ticker ?? ''), isFundingOrWithdrawal ? [] : [Validators.required, Validators.minLength(1)]],
      type: [tx?.type ?? 'buy', Validators.required],
      quantity: [
        isFundingOrWithdrawal ? (tx?.quantity ?? '') : (tx?.quantity ?? ''),
        [Validators.required, Validators.min(0.0000001)],
      ],
      price: [
        isFundingOrWithdrawal ? 1 : (tx?.price ?? ''),
        isFundingOrWithdrawal ? [] : [Validators.required, Validators.min(0.0000001)],
      ],
      currency: [tx?.currency ?? 'USD', Validators.required],
      fee: [
        tx?.fee ?? '',
        [Validators.min(0)],
      ],
      notes: [tx?.notes ?? ''],
    });

    console.debug('[TransactionForm] Form built, valid:', group.valid);
    return group;
  }

  async onSave(): Promise<void> {
    /** Validate form and persist the transaction via StateService.
     * Emits `saved` on success. Handles both add and edit modes. */
    console.debug('[TransactionForm] Save clicked. Form valid:', this.form.valid);

    if (this.form.invalid) {
      console.warn('[TransactionForm] Form is invalid. Errors:', this.getFormErrors());
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    const raw = this.form.value;
    const payload = {
      date: raw.date as string,
      time: this.normalizeTime(raw.time as string),
      ticker: (raw.ticker as string).toUpperCase().trim(),
      type: raw.type as TransactionType,
      quantity: Number(raw.quantity),
      price: Number(raw.price),
      currency: (raw.currency as string).toUpperCase().trim(),
      fee: raw.fee ? Number(raw.fee) : undefined,
      notes: (raw.notes as string) ?? '',
    };

    console.debug('[TransactionForm] Saving transaction:', payload);

    try {
      if (this.isEditMode) {
        console.debug('[TransactionForm] Editing transaction', this.transaction!.id);
        await this.state.editTransaction(this.transaction!.id, payload);
      } else {
        console.debug('[TransactionForm] Adding new transaction');
        await this.state.addTransaction(payload);
      }
      console.debug('[TransactionForm] Save successful');
      this.saved.emit();
    } catch (err) {
      console.error('[TransactionForm] Save failed:', err);
      this.errorMessage = 'Failed to save transaction. Please try again.';
    } finally {
      this.saving = false;
    }
  }

  private getFormErrors(): any {
    const errors: any = {};
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (control && control.errors) {
        errors[key] = control.errors;
      }
    });
    return errors;
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

  isFeeApplicable(): boolean {
    // All transaction types can have fees
    return true;
  }

  isCashTransaction(): boolean {
    const typeCtrl = this.form.get('type');
    return typeCtrl?.value === 'funding' || typeCtrl?.value === 'withdrawal';
  }

  private normalizeTime(raw: string): string {
    if (!raw || !raw.trim()) return '00:00:00.000';
    const match = raw.trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d{1,3}))?$/);
    if (!match) return '00:00:00.000';
    const [, h, m, s = '0', ms = '0'] = match;
    const hour = String(parseInt(h)).padStart(2, '0');
    const min = String(parseInt(m)).padStart(2, '0');
    const sec = String(parseInt(s)).padStart(2, '0');
    const msec = String(parseInt(ms)).padStart(3, '0').substring(0, 3);
    return `${hour}:${min}:${sec}.${msec}`;
  }
}
