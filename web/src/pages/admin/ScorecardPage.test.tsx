import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderApp, mockFetch, jsonRoute, superAdminMe } from '../../tests/utils';
import ScorecardPage from './ScorecardPage';
import type { ScorecardDashboard } from '../../lib/types';

afterEach(() => vi.unstubAllGlobals());

const dashboard: ScorecardDashboard = {
  period: { lo: '2026-06-01', hi: '2026-06-30' },
  highlights: {
    closureEfficiency: { ownerName: 'Abha Sharma', value: 0.5 },
    l2Conversions: { ownerName: 'Abha Sharma', value: 1 },
    l3Conversions: { ownerName: 'Abha Sharma', value: 1 },
    lowestTat: { ownerName: 'Abha Sharma', value: 13 },
    lowestDropoutRate: { ownerName: 'Abha Sharma', value: 0 },
    highestDropoutRate: { ownerName: 'Pragyashree Jain', value: 1 },
    interviewToOfferRatio: { ownerName: 'Abha Sharma', value: 1 },
    offerToJoinRatio: { ownerName: 'Abha Sharma', value: 0.5 },
  },
  ranking: [
    {
      ownerName: 'Abha Sharma',
      profilesSubmitted: 2,
      closures: 1,
      closureEfficiency: 0.5,
      l2Conversions: 1,
      l3Conversions: 1,
      dropped: 0,
      dropoutRate: 0,
      avgTatDays: 13,
      offered: 2,
      interviewToOfferRatio: 1,
      offerToJoinRatio: 0.5,
      score: 0.87,
      rank: 1,
    },
    {
      ownerName: 'Pragyashree Jain',
      profilesSubmitted: 1,
      closures: 0,
      closureEfficiency: 0,
      l2Conversions: 0,
      l3Conversions: 0,
      dropped: 1,
      dropoutRate: 1,
      avgTatDays: null,
      offered: 0,
      interviewToOfferRatio: null,
      offerToJoinRatio: null,
      score: 0.1,
      rank: 2,
    },
  ],
  techStackExpertise: [
    { techStack: 'Java', topOwnerName: 'Abha Sharma', closures: 1, totalClosures: 1 },
  ],
  recruiterCount: 2,
  candidateCount: 3,
};

function routes(data: ScorecardDashboard = dashboard) {
  return [jsonRoute('/api/me', superAdminMe), jsonRoute('/api/report/scorecard', data)];
}

describe('Performance Scorecard', () => {
  it('renders highlight tiles, tech-stack expertise, and the overall ranking table', async () => {
    mockFetch(routes());
    renderApp(
      <Routes>
        <Route path="/admin/scorecard" element={<ScorecardPage />} />
      </Routes>,
      { route: '/admin/scorecard' },
    );

    expect(await screen.findByText('Max Closures, Min Profiles')).toBeInTheDocument();
    expect(screen.getByText('Most L2 Conversions')).toBeInTheDocument();
    expect(screen.getByText('Most L3 Conversions')).toBeInTheDocument();
    expect(screen.getByText('Lowest Turnaround Time')).toBeInTheDocument();
    expect(screen.getByText('Lowest Dropout Rate')).toBeInTheDocument();
    expect(screen.getByText('Highest Dropout Rate')).toBeInTheDocument();
    expect(screen.getByText('Best Interview → Offer')).toBeInTheDocument();
    expect(screen.getByText('Best Offer → Joining')).toBeInTheDocument();

    // Abha Sharma wins most tiles — appears multiple times, so just assert presence.
    expect(screen.getAllByText('Abha Sharma').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pragyashree Jain').length).toBeGreaterThan(0);

    expect(screen.getByText('Expertise by Tech Stack')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();

    expect(screen.getByText('Overall Monthly Ranking')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('shows an empty state when no candidates were tracked in the period', async () => {
    const empty: ScorecardDashboard = {
      period: { lo: '2019-01-01', hi: '2019-01-31' },
      highlights: {
        closureEfficiency: null,
        l2Conversions: null,
        l3Conversions: null,
        lowestTat: null,
        lowestDropoutRate: null,
        highestDropoutRate: null,
        interviewToOfferRatio: null,
        offerToJoinRatio: null,
      },
      ranking: [],
      techStackExpertise: [],
      recruiterCount: 0,
      candidateCount: 0,
    };
    mockFetch(routes(empty));
    renderApp(
      <Routes>
        <Route path="/admin/scorecard" element={<ScorecardPage />} />
      </Routes>,
      { route: '/admin/scorecard' },
    );

    expect(await screen.findByText('No candidates tracked in this period')).toBeInTheDocument();
  });
});
