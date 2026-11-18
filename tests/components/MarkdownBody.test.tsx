import { render } from '@testing-library/react';
import MarkdownBody from '../../src/components/MarkdownBody';

describe('MarkdownBody', () => {
  it('renders script markup as text, not executable markup', () => {
    const { container } = render(<MarkdownBody body="<script>alert(1)</script>" />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe('<script>alert(1)</script>');
  });

  it('does not create links with javascript URLs', () => {
    const { container } = render(<MarkdownBody body="[clique aqui](javascript:alert(1))" />);

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('clique aqui');
  });

  it('renders long text without truncating it', () => {
    const longText = 'a'.repeat(20_000);
    const { container } = render(<MarkdownBody body={longText} />);

    expect(container.textContent).toHaveLength(longText.length);
  });

  it('limits links to http and https and sets safe target attributes', () => {
    const { getByRole } = render(<MarkdownBody body="[site](https://example.com)" />);
    const link = getByRole('link', { name: 'site' });

    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
