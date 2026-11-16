import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SecretCardOddsTable from '../../src/components/SecretCardOddsTable';

describe('SecretCardOddsTable', () => {
  it('updates package probability calculations when the configured chance changes', () => {
    const { rerender } = render(<SecretCardOddsTable chancePercent={0.001} position="Ala" />);

    expect(screen.getAllByText('0,0030%').length).toBeGreaterThan(0);
    expect(screen.getByText('~16,7 mi moedas')).toBeInTheDocument();

    rerender(<SecretCardOddsTable chancePercent={0.002} position="Ala" />);
    expect(screen.getAllByText('0,0060%').length).toBeGreaterThan(0);
  });

  it('shows ineligible packages and chooses the cheapest eligible 99% estimate', () => {
    render(<SecretCardOddsTable chancePercent={0.001} position="Ala" />);

    expect(screen.getByText(/Pacote mais barato para chegar a 99%: BRONZE/)).toBeInTheDocument();
    expect(screen.getAllByText('Não elegível para cartas secretas')).toHaveLength(3);
  });

  it('makes the goalkeeper package eligible only for a goalkeeper template', () => {
    render(<SecretCardOddsTable chancePercent={0.001} position="GK" />);

    const goalkeeperPackage = screen.getByRole('heading', { name: 'GOLEIROS' }).closest('li');
    expect(goalkeeperPackage).toHaveTextContent('0,0030%');
  });

  it('keeps package odds readable on dark backgrounds without horizontal overflow', () => {
    const { container } = render(<SecretCardOddsTable chancePercent={0.001} position="Ala" />);

    expect(screen.getAllByText('Chance por pacote')[0]).toHaveClass('text-white/70');
    expect(screen.getAllByText('0,0030%')[0]).toHaveClass('text-white');
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(container.querySelector('ul[aria-label="Chance e custo estimado por pacote"]')).toBeInTheDocument();
  });
});
