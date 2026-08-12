import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AppLanguage = 'en' | 'ka' | 'ru';

type TextState = {
  original: string;
  translated?: string;
};

type GeorgianTranslator = (value: string) => string | undefined;

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly language$ = new BehaviorSubject<AppLanguage>(this.savedLanguage());
  private readonly textStates = new WeakMap<Text, TextState>();
  private readonly attributeStates = new WeakMap<Element, Map<string, TextState>>();
  private observer?: MutationObserver;
  private timer?: number;
  private generation = 0;
  private georgianTranslator?: GeorgianTranslator;
  private georgianTranslatorRequest?: Promise<GeorgianTranslator>;

  constructor(private zone: NgZone) {
    document.documentElement.lang = this.language$.value;
  }

  start(): void {
    if (this.observer) return;

    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver(() => this.schedule());
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label'],
      });
      this.schedule();
    });
  }

  setLanguage(language: AppLanguage): void {
    this.generation++;
    localStorage.setItem('velven-language', language);
    document.documentElement.lang = language;
    if (language !== this.language$.value) {
      this.language$.next(language);
    }
    this.restoreEnglish();
    this.schedule();
  }

  label(language: AppLanguage = this.language$.value): string {
    return language === 'ka' ? 'GE' : language === 'ru' ? 'RU' : 'EN';
  }

  private savedLanguage(): AppLanguage {
    const saved = localStorage.getItem('velven-language');
    return saved === 'ka' || saved === 'ru' ? saved : 'en';
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.translatePage(), 50);
  }

  private restoreEnglish(): void {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const state = this.textStates.get(node);
      if (state) {
        node.data = state.original;
        state.translated = undefined;
      }
    }

    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const states = this.attributeStates.get(element);
      states?.forEach((state, name) => {
        element.setAttribute(name, state.original);
        state.translated = undefined;
      });
    }
  }

  private async translatePage(): Promise<void> {
    const language = this.language$.value;
    if (language === 'en') return;

    const generation = this.generation;
    if (language === 'ka') {
      await this.loadGeorgianTranslator();
      if (generation !== this.generation || language !== this.language$.value) return;
    }
    const targets = this.collectTargets();
    const unique = [...new Set(targets.map((target) => target.state.original))];
    const translations = await this.translateStrings(unique, language);

    if (generation !== this.generation || language !== this.language$.value) return;

    for (const target of targets) {
      const translated = translations.get(target.state.original);
      if (!translated || target.state.translated === translated) continue;
      target.write(translated);
      target.state.translated = translated;
    }
  }

  private collectTargets(): Array<{ state: TextState; write: (value: string) => void }> {
    const targets: Array<{ state: TextState; write: (value: string) => void }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, svg, [data-no-translate]')) continue;

      const current = node.data.trim();
      if (!this.shouldTranslate(current)) continue;

      let state = this.textStates.get(node);
      if (!state) {
        state = { original: current };
        this.textStates.set(node, state);
      } else if (state.translated && current !== state.translated && current !== state.original) {
        state.original = current;
        state.translated = undefined;
      }

      const leading = node.data.match(/^\s*/)?.[0] ?? '';
      const trailing = node.data.match(/\s*$/)?.[0] ?? '';
      targets.push({
        state,
        write: (value) => (node.data = `${leading}${value}${trailing}`),
      });
    }

    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      for (const name of ['placeholder', 'title', 'aria-label']) {
        const current = element.getAttribute(name)?.trim();
        if (!current || !this.shouldTranslate(current)) continue;

        let states = this.attributeStates.get(element);
        if (!states) {
          states = new Map();
          this.attributeStates.set(element, states);
        }
        let state = states.get(name);
        if (!state) {
          state = { original: current };
          states.set(name, state);
        } else if (state.translated && current !== state.translated && current !== state.original) {
          state.original = current;
          state.translated = undefined;
        }
        targets.push({ state, write: (value) => element.setAttribute(name, value) });
      }
    }

    return targets;
  }

  private shouldTranslate(value: string): boolean {
    if (this.georgianTranslator?.(value)) return true;
    return /[A-Za-z]/.test(value) && !/^(https?:|\/|[\w.+-]+@[\w.-]+$)/.test(value);
  }

  private async translateStrings(
    values: string[],
    language: Exclude<AppLanguage, 'en'>,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    // Georgian is curated in-repo. Never send Georgian UI copy to the
    // machine-translation endpoint, and leave unknown content unchanged.
    if (language === 'ka') {
      const translate = await this.loadGeorgianTranslator();
      for (const value of values) {
        const translated = translate(value);
        if (translated) result.set(value, translated);
      }
      return result;
    }

    const missing: string[] = [];

    for (const value of values) {
      const key = `velven-translation:v2:${language}:${value}`;
      const cached = localStorage.getItem(key);
      cached ? result.set(value, cached) : missing.push(value);
    }

    const delimiter = ' __VELVEN_TRANSLATION_SPLIT__ ';
    const batches: string[][] = [];
    let batch: string[] = [];
    let length = 0;
    for (const value of missing) {
      if (length + value.length > 1400 && batch.length) {
        batches.push(batch);
        batch = [];
        length = 0;
      }
      batch.push(value);
      length += value.length + delimiter.length;
    }
    if (batch.length) batches.push(batch);

    await Promise.all(
      batches.map(async (items) => {
        try {
          const response = await fetch('/translation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              language,
              text: items.join(delimiter),
            }),
          });
          if (!response.ok) return;
          const payload = await response.json();
          const combined = payload.translatedText as string;
          let translated = combined.split(delimiter);
          if (translated.length !== items.length) {
            translated = await Promise.all(
              items.map((item) => this.translateOne(item, language)),
            );
          }

          items.forEach((original, index) => {
            const value = translated[index].trim();
            if (!value) return;
            result.set(original, value);
            try {
              localStorage.setItem(
                `velven-translation:v2:${language}:${original}`,
                value,
              );
            } catch {
              // Translation still works when storage is full or unavailable.
            }
          });
        } catch {
          // Leave the English text in place if the translation service is unavailable.
        }
      }),
    );

    return result;
  }

  private loadGeorgianTranslator(): Promise<GeorgianTranslator> {
    if (this.georgianTranslator) {
      return Promise.resolve(this.georgianTranslator);
    }

    this.georgianTranslatorRequest ??= import('../i18n/georgian-translations')
      .then((module) => {
        this.georgianTranslator = module.georgianTranslation;
        return this.georgianTranslator;
      });
    return this.georgianTranslatorRequest;
  }

  private async translateOne(
    value: string,
    language: Exclude<AppLanguage, 'en'>,
  ): Promise<string> {
    try {
      const response = await fetch('/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, text: value }),
      });
      if (!response.ok) return '';
      const payload = await response.json();
      return payload.translatedText || '';
    } catch {
      return '';
    }
  }
}
