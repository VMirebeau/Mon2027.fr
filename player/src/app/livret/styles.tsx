/// Styles inline pour le livret. Volontairement dans un component séparé
/// pour garder page.tsx lisible. On utilise un <style jsx global> au lieu
/// du globals.css principal parce que :
///   1. Ces règles ne servent qu'à /livret et alourdiraient inutilement le
///      bundle des autres pages.
///   2. Le print stylesheet a besoin de @page (impossible à scoper sinon).
///   3. Les couleurs reprennent les variables du site mais redéclarent les
///      tokens en local pour ne pas dépendre du body du player (le livret
///      est rendu en plein écran sans AppShell).

export function LivretStyles() {
  return (
    <style>{`
      :root {
        --liv-cream: #F5F1E8;
        --liv-cream-warm: #FAF8F3;
        --liv-cream-deep: #ECE4D2;
        --liv-ink: #1A1A1A;
        --liv-ink-soft: #4A4842;
        --liv-ink-mute: #8A877E;
        --liv-rule: #D9D0BA;
        --liv-rule-soft: #E8DFC9;
        --liv-coral: #FF6B6B;
        --liv-yellow: #FFC845;
      }

      body {
        background: var(--liv-cream);
        color: var(--liv-ink);
        margin: 0;
        padding: 0;
        font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 15px;
        line-height: 1.5;
      }

      /* ------------- Toolbar (écran uniquement) ------------- */
      .livret-toolbar {
        position: sticky;
        top: 0;
        z-index: 50;
        background: var(--liv-ink);
        color: var(--liv-cream);
        padding: 12px 16px 10px;
        box-shadow: 0 2px 0 rgba(0,0,0,0.15);
      }
      .livret-toolbar-inner {
        max-width: 720px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .livret-toolbar-back,
      .livret-toolbar-print {
        background: transparent;
        border: 1.5px solid var(--liv-cream);
        color: var(--liv-cream);
        padding: 8px 14px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        font-family: inherit;
      }
      .livret-toolbar-print {
        background: var(--liv-yellow);
        color: var(--liv-ink);
        border-color: var(--liv-ink);
      }
      .livret-toolbar-print:hover {
        filter: brightness(0.95);
      }
      .livret-toolbar-qr-toggle {
        background: transparent;
        border: 1.5px solid rgba(255,255,255,0.4);
        color: var(--liv-cream);
        padding: 7px 12px;
        border-radius: 999px;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 12px;
        text-decoration: none;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      .livret-toolbar-qr-toggle:hover {
        border-color: var(--liv-cream);
      }
      .livret-toolbar-count {
        font-size: 12px;
        color: rgba(255,255,255,0.7);
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        letter-spacing: 0.04em;
      }
      .livret-toolbar-hint {
        max-width: 720px;
        margin: 6px auto 0;
        font-size: 11px;
        color: rgba(255,255,255,0.6);
        text-align: center;
      }

      /* ------------- Contenu livret ------------- */
      .livret {
        max-width: 720px;
        margin: 0 auto;
        padding: 32px 32px 64px;
      }

      .livret-cover {
        padding: 48px 0 36px;
        border-bottom: 2px solid var(--liv-ink);
        margin-bottom: 36px;
      }
      .livret-cover-eyebrow {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--liv-ink-mute);
        margin-bottom: 16px;
      }
      .livret-cover-title {
        font-size: 38px;
        line-height: 1.05;
        margin: 0 0 20px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .livret-cover-meta {
        font-size: 14px;
        color: var(--liv-ink-soft);
        margin-bottom: 22px;
      }
      .livret-cover-themes {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 22px;
      }
      .livret-cover-intro {
        font-size: 14px;
        line-height: 1.55;
        color: var(--liv-ink-soft);
        margin: 0;
        font-style: italic;
        max-width: 520px;
      }

      .livret-chip {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.02em;
        border: 1.5px solid var(--liv-ink);
      }
      .livret-chip-lg {
        font-size: 13px;
        padding: 6px 14px;
      }

      .livret-theme {
        margin-bottom: 28px;
        break-inside: avoid-page;
      }
      .livret-theme-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 0;
        margin-bottom: 16px;
        border-bottom: 2px solid;
        break-after: avoid-page;
      }
      .livret-theme-count {
        font-size: 12px;
        color: var(--liv-ink-mute);
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        letter-spacing: 0.04em;
      }

      .livret-q {
        display: flex;
        gap: 14px;
        padding: 14px 0 18px;
        border-bottom: 1px solid var(--liv-rule-soft);
        break-inside: avoid-page;
      }
      .livret-q:last-child {
        border-bottom: 0;
      }
      .livret-q-number {
        flex-shrink: 0;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 12px;
        font-weight: 700;
        color: var(--liv-ink-mute);
        margin-top: 4px;
        width: 28px;
      }
      .livret-q-body {
        flex: 1;
        min-width: 0;
      }
      .livret-q-question {
        font-size: 17px;
        font-weight: 700;
        line-height: 1.3;
        margin: 0 0 6px;
        letter-spacing: -0.01em;
      }
      .livret-q-precisions {
        font-size: 12.5px;
        color: var(--liv-ink-mute);
        margin: 0 0 12px;
        font-style: italic;
        line-height: 1.4;
      }
      .livret-q-answer {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 10px 14px;
        background: var(--liv-cream-warm);
        border-left: 4px solid var(--liv-coral);
        border-radius: 0 8px 8px 0;
        margin: 4px 0 12px;
      }
      .livret-q-answer-label {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--liv-ink-mute);
        flex-shrink: 0;
      }
      .livret-q-answer-value {
        font-size: 16px;
        font-weight: 700;
        color: var(--liv-coral);
        letter-spacing: -0.01em;
      }
      .livret-q-ctx {
        font-size: 13.5px;
        line-height: 1.5;
        color: var(--liv-ink-soft);
        margin: 0 0 10px;
      }
      /* Mise en perspective : bloc plus dense que le ctx, italique serif
         + filet vertical à gauche. Distingue "ce que dit la donnée brute"
         de "comparaison structurelle internationale/temporelle". Pensé
         pour rester lisible en impression noir & blanc. */
      .livret-q-perspective {
        font-family: var(--liv-serif, Georgia, serif);
        font-style: italic;
        font-size: 12.5px;
        line-height: 1.5;
        color: var(--liv-ink-soft);
        margin: 0 0 12px;
        padding: 2px 0 2px 12px;
        border-left: 2px solid var(--liv-rule, #d9d0ba);
      }
      .livret-q-qr {
        flex-shrink: 0;
        align-self: flex-start;
        margin-top: 6px;
        width: 64px;
        height: 64px;
        color: var(--liv-ink);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .livret-q-qr svg {
        width: 100%;
        height: 100%;
      }
      .livret-q-sources {
        list-style: none;
        padding: 0;
        margin: 6px 0 0;
        font-size: 11px;
        color: var(--liv-ink-mute);
        line-height: 1.4;
      }
      .livret-q-sources li {
        margin-bottom: 2px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: baseline;
      }
      .livret-q-source-tag {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 9px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--liv-cream-deep);
        color: var(--liv-ink-soft);
        flex-shrink: 0;
      }
      .livret-q-source-name {
        font-weight: 600;
        color: var(--liv-ink-soft);
      }
      .livret-q-source-url {
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        font-size: 10px;
        color: var(--liv-ink-mute);
        word-break: break-all;
      }

      .livret-footer {
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid var(--liv-rule);
        text-align: center;
        font-size: 12px;
        color: var(--liv-ink-mute);
      }
      .livret-footer-note {
        margin-top: 6px;
        font-style: italic;
        font-size: 11px;
        max-width: 420px;
        margin-left: auto;
        margin-right: auto;
      }

      /* ------------- Impression ------------- */
      @page {
        size: A4;
        margin: 18mm 16mm;
      }
      @media print {
        body {
          background: white;
          font-size: 11pt;
        }
        .no-print {
          display: none !important;
        }
        .livret {
          max-width: none;
          padding: 0;
        }
        .livret-cover {
          padding-top: 0;
          break-after: page;
        }
        .livret-cover-title {
          font-size: 32pt;
        }
        .livret-theme {
          break-before: page;
        }
        .livret-theme:first-of-type {
          break-before: avoid;
        }
        .livret-q {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .livret-q-answer {
          background: #FAF8F3;
        }
        .livret-q-source-url {
          font-size: 8pt;
        }
        a {
          color: inherit;
          text-decoration: none;
        }
      }
    `}</style>
  );
}
