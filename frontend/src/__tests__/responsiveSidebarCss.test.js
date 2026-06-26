import fs from 'fs';
import path from 'path';

describe('Regressão do shell responsivo', () => {
  test('mantém a barra inferior ocupando 100% da largura em viewport compacta', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');

    expect(css).toMatch(/@media \(max-width: 900px\),\s*\(max-height: 640px\) \{/);
    expect(css).toMatch(/\.sidebar \{[\s\S]*min-width: 100%;[\s\S]*max-width: 100%;/);
    expect(css).toMatch(/\.sidebar-nav \{[\s\S]*width: 100%;[\s\S]*flex: 1;[\s\S]*overflow-x: auto;/);
  });

  test('mantém o topo legível em mobile com banners quebrando linha', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');

    expect(css).toMatch(/\.offline-readonly-banner \{[\s\S]*flex-direction: column;[\s\S]*gap: 6px;/);
    expect(css).toMatch(/\.offline-readonly-banner strong \{[\s\S]*white-space: normal;/);
  });

  test('mantém o atalho do usuário preso à direita no topo compacto', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');

    expect(css).toMatch(/\.app-topbar-actions \{[\s\S]*justify-content: flex-end;[\s\S]*margin-left: auto;[\s\S]*flex-wrap: nowrap;/);
    expect(css).toMatch(/\.app-topbar-actions \.user-chip,[\s\S]*\.app-topbar-actions \.user-chip-compact \{[\s\S]*flex: 0 0 auto;[\s\S]*width: auto;/);
  });

  test('mantém o topo compacto em uma linha com branding à esquerda e ações à direita', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');

    expect(css).toMatch(/\.app-topbar \{[\s\S]*flex-direction: row;[\s\S]*align-items: center;/);
    expect(css).toMatch(/\.app-topbar-left \{[\s\S]*justify-content: flex-start;[\s\S]*flex: 1 1 auto;/);
    expect(css).toMatch(/\.topbar-icon-btn \{[\s\S]*display: inline-flex;[\s\S]*flex: 0 0 auto;/);
  });
});
