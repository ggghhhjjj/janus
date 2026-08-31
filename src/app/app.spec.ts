import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { UiHeader } from 'ui-header';
import { vi } from 'vitest';

import { App } from './app';
import { CordovaService } from './cordova.service';
import { LOCALE_STORAGE_KEY } from './core/i18n/locale.service';
import { AppUpdateService } from './core/update/app-update.service';

/** Stub: packaged `ui-header` document HostListeners fail under Vitest. */
@Component({
  selector: 'ui-header',
  template: `<button class="header__tab" type="button">{{ tabs[0]?.label }}</button>`,
})
class UiHeaderStub {
  @Input() tabs: { id: string; label: string }[] = [];
  @Input() selectedTabId = '';
  @Input() menuItems: unknown[] = [];
  @Input() languages: unknown[] = [];
  @Input() activeLanguage = '';
  @Input() menuLabel = '';
  @Input() languageLabel = '';
  @Input() shareLabel = '';
  @Input() shareCopiedLabel = '';
  @Input() shareTitle = '';
  @Input() shareText = '';
  @Input() autoShare = false;
  @Input() statusLabel = '';
  @Output() menuSelect = new EventEmitter<string>();
  @Output() languageSelect = new EventEmitter<string>();
}

describe('App', () => {
  const reloadApp = vi.fn();

  beforeEach(async () => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
    reloadApp.mockReset();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: CordovaService,
          useValue: { deviceReady$: of(undefined), platformInfo: 'test' },
        },
        { provide: AppUpdateService, useValue: { reloadApp } },
      ],
    })
      .overrideComponent(App, {
        remove: { imports: [UiHeader] },
        add: { imports: [UiHeaderStub] },
      })
      .compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    document.documentElement.lang = 'bg';
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders ui-header with the Dashboard tab', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('ui-header')).not.toBeNull();
    expect(compiled.querySelector('.header__tab')?.textContent).toContain('Табло');
    expect(compiled.querySelector('.app__body')).not.toBeNull();
  });
});
