import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SportsLobby } from './SportsLobby';

describe('SportsLobby', () => {
  it('renders football active and disabled coming soon sports', () => {
    const html = renderToStaticMarkup(<SportsLobby onNavigate={() => undefined} onBackToMain={() => undefined} />);

    expect(html).toContain('足球');
    expect(html).toContain('可用 · 概率实验');
    expect(html).toContain('篮球');
    expect(html).toContain('电竞');
    expect(html).toContain('即将开放');
    expect(html).toContain('aria-disabled="true"');
  });

  it('navigates to football from the active football card', () => {
    const onNavigate = vi.fn();
    const element = SportsLobby({ onNavigate, onBackToMain: () => undefined });
    const sportsSection = Array.isArray(element.props.children) ? element.props.children[2] : null;
    const footballButton = sportsSection.props.children[0];

    footballButton.props.onClick();

    expect(onNavigate).toHaveBeenCalledWith('#/sports/football');
  });
});
