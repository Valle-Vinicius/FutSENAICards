import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Credits from '../../src/pages/Credits';

describe('Credits page', () => {
  it('shows the three project owners in the requested order with working project links', () => {
    render(<MemoryRouter><Credits /></MemoryRouter>);

    const cards = screen.getByRole('region', { name: 'Responsáveis pelos projetos' });
    expect(within(cards).getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual([
      'Pietro Guedes',
      'Vinicius Valle',
      'Vinicius Assuncao',
    ]);
    expect(within(cards).getByRole('link', { name: 'futsenaijornal.vercel.app' })).toHaveAttribute(
      'href',
      'https://futsenaijornal.vercel.app/',
    );
    expect(within(cards).getByRole('link', { name: 'fut-senai-cards.vercel.app' })).toHaveAttribute(
      'href',
      'https://fut-senai-cards.vercel.app/',
    );
    expect(within(cards).getByRole('link', { name: 'futsenai-score.vercel.app' })).toHaveAttribute(
      'href',
      'https://futsenai-score.vercel.app/',
    );
    expect(within(cards).getAllByRole('img')).toHaveLength(3);
  });
});
