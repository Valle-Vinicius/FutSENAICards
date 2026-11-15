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
    expect(screen.getAllByText('Não elegível')).toHaveLength(3);
  });

  it('makes the goalkeeper package eligible only for a goalkeeper template', () => {
    render(<SecretCardOddsTable chancePercent={0.001} position="GK" />);

    const goalkeeperRow = screen.getByRole('row', { name: /GOLEIROS/ });
    expect(goalkeeperRow).toHaveTextContent('0,0030%');
  });
});
