import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './language-selector.html',
  styleUrl: './language-selector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);

  readonly isOpen = signal(false);
  private readonly menuPosition = signal<{ top: string; left: string } | null>(null);
  private readonly el = inject(ElementRef);

  @ViewChild('trigger') private triggerBtn!: ElementRef<HTMLButtonElement>;

  readonly shortLabelMap: { [key: string]: string } = {
    en: 'EN',
    bg: 'БГ',
  };

  readonly currentShortLabel = computed(() => {
    const locale = this.i18n.getCurrentLocale();
    return this.shortLabelMap[locale] ?? locale.slice(0, 2).toUpperCase();
  });

  readonly positionStyle = computed(() => {
    const pos = this.menuPosition();
    if (!pos) return '';
    return `position: fixed; top: ${pos.top}; left: ${pos.left};`;
  });

  onTriggerClick(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      // Calculate position before showing the popup so the first render already
      // has position:fixed applied. If isOpen were set first, Angular would render
      // the popup without a position style (positionStyle() returns '') causing it
      // to appear in normal document flow and force a table layout reflow.
      this.calculatePosition();
      this.isOpen.set(true);
      setTimeout(() => {
        // Focus must still be deferred — the popup DOM doesn't exist yet when
        // isOpen.set(true) is called; Angular renders it after this event handler.
        const firstItem = (this.el.nativeElement as HTMLElement).querySelector<HTMLElement>('.language-selector__item');
        firstItem?.focus();
      }, 0);
    }
  }

  close(returnFocus = false): void {
    this.isOpen.set(false);
    this.menuPosition.set(null);
    if (returnFocus) {
      this.triggerBtn?.nativeElement.focus();
    }
  }

  selectLocale(locale: string): void {
    this.i18n.setLocale(locale);
    this.close(true);
  }

  onMenuKeydown(event: KeyboardEvent, index: number): void {
    const items = (this.el.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.language-selector__item');
    const count = items.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % count]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + count) % count]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close(true);
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.el.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen()) {
      this.close(true);
    }
  }

  private calculatePosition(): void {
    const btn = this.triggerBtn?.nativeElement;
    if (!btn) return;

    const buttonRect = btn.getBoundingClientRect();
    const itemCount = this.i18n.getSupportedLocales().length;
    const menuWidth = 120;
    const itemHeight = 40;
    const menuHeight = itemCount * itemHeight + 8;
    const margin = 4;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const top =
      viewportHeight - buttonRect.bottom >= menuHeight + margin
        ? buttonRect.bottom + margin
        : buttonRect.top - menuHeight - margin;

    const left =
      viewportWidth - buttonRect.left >= menuWidth + margin ? buttonRect.left : buttonRect.right - menuWidth;

    this.menuPosition.set({ top: `${top}px`, left: `${left}px` });
  }

  getShortLabel(locale: string): string {
    return this.shortLabelMap[locale] ?? locale.slice(0, 2).toUpperCase();
  }
}
