import { render, screen } from '@testing-library/react';
import TacticPreview from '../../src/components/TacticPreview';
import type { Tactic } from '../../src/engine/match';

describe('TacticPreview', () => {
  it('keeps a static final position with movement arrows when reduced motion is enabled', () => {
    const tactics: Tactic[] = ['balanced', 'possession', 'highpress', 'counter', 'compact'];
    const finalBallPositions = new Set<string>();
    const { rerender } = render(
      <TacticPreview tactic="balanced" formation="1-2-1" reduceMotion />,
    );

    tactics.forEach(tactic => {
      rerender(<TacticPreview tactic={tactic} formation="1-2-1" reduceMotion />);
      const court = screen.getByRole('img', { name: /Prévia/ });
      const circles = court.querySelectorAll('circle');
      const ball = circles[circles.length - 1];

      expect(court.querySelectorAll('[data-team="home"]')).toHaveLength(5);
      expect(court.querySelectorAll('[data-team="away"]')).toHaveLength(5);
      expect(court.querySelector('path[marker-end]')).toBeTruthy();
      finalBallPositions.add(`${ball.getAttribute('cx')},${ball.getAttribute('cy')}`);
    });

    expect(finalBallPositions.size).toBe(5);
  });
});
