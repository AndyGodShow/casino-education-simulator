import { useCallback, useRef, useState } from 'react';
import { designCssVariables } from '../../../ui/designSystem';
import { EducationNotice } from '../../components/EducationNotice';
import { MatchInsightPanel } from '../../components/explanation/MatchInsightPanel';
import { DataSourceNotice } from './components/DataSourceNotice';
import { FinishedMatchResultPanel } from './components/FinishedMatchResultPanel';
import { MatchList } from './components/MatchList';
import { PredictionPipelineAuditPanel } from './components/PredictionPipelineAuditPanel';
import { selectDefaultInsightMatch, selectMatchById, selectMatches, selectPrediction, selectSimulation, selectTeam, selectTeamDisplayName } from './domain/selectors';
import { useWorldCupDomain } from './hooks/useWorldCupDomain';
import styles from './WorldCup.module.css';

type WorldCupHomeProps = {
  onBackToFootball: () => void;
};

export function WorldCupHome({ onBackToFootball }: WorldCupHomeProps) {
  const domain = useWorldCupDomain();
  const matches = selectMatches(domain);
  const defaultMatch = selectDefaultInsightMatch(domain);
  const detailPanelRef = useRef<HTMLDivElement>(null);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const selectedMatch = selectMatchById(domain, selectedMatchId) ?? defaultMatch;
  const homeTeam = selectTeam(domain, selectedMatch?.homeTeamId);
  const awayTeam = selectTeam(domain, selectedMatch?.awayTeamId);
  const displayHomeTeam = homeTeam;
  const displayAwayTeam = awayTeam;
  const prediction = selectPrediction(domain, selectedMatch?.id);
  const predictionReliability = selectedMatch ? domain.predictionReliability[selectedMatch.id] : undefined;
  const matchDataQuality = selectedMatch ? domain.matchDataQuality[selectedMatch.id] : undefined;
  const actionGate = selectedMatch ? domain.actionGates[selectedMatch.id] : undefined;
  const simulation = selectSimulation(domain);
  const getTeamName = useCallback((teamId: string) => selectTeamDisplayName(domain, teamId), [domain]);
  const handleSelectMatch = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ block: 'start' });
    });
  }, [setSelectedMatchId]);

  return (
    <main className={styles.shell} style={designCssVariables}>
      <button type="button" className="back-btn" onClick={onBackToFootball}>
        ← 返回足球首页
      </button>
      <section className={styles.hero} aria-labelledby="world-cup-title">
        <span>世界杯 2026</span>
        <h1 id="world-cup-title">世界杯比赛中心</h1>
        <p>比赛优先的概率教育界面：先看结论，再看模型、市场和融合概率，对复杂解释保持默认折叠。</p>
        <EducationNotice />
      </section>
      <DataSourceNotice domain={domain} />
      <PredictionPipelineAuditPanel domain={domain} />
      <section className={styles.matchCenter} aria-label="世界杯比赛中心">
        <MatchList
          matches={matches}
          getTeamName={getTeamName}
          getPrediction={(matchId) => selectPrediction(domain, matchId)}
          getSnapshot={(matchId) => domain.preMatchPredictionSnapshots?.[matchId]}
          selectedMatchId={selectedMatch?.id}
          onSelectMatch={handleSelectMatch}
        />
        <div ref={detailPanelRef} className={styles.detailPanel}>
          {!selectedMatch && <MatchDetailSkeleton />}
          {selectedMatch && selectedMatch.status === 'finished' && displayHomeTeam && displayAwayTeam && (
            <FinishedMatchResultPanel
              match={selectedMatch}
              homeName={getTeamName(selectedMatch.homeTeamId)}
              awayName={getTeamName(selectedMatch.awayTeamId)}
              snapshot={domain.preMatchPredictionSnapshots?.[selectedMatch.id]}
            />
          )}
          {selectedMatch && selectedMatch.status !== 'finished' && displayHomeTeam && displayAwayTeam && prediction && predictionReliability && matchDataQuality && (
            <MatchInsightPanel
              match={selectedMatch}
              homeTeam={displayHomeTeam}
              awayTeam={displayAwayTeam}
              prediction={prediction}
              market={domain.markets?.[selectedMatch.id] ?? null}
              calibration={domain.calibration}
              predictionAudit={domain.predictionAudit}
              predictionReliability={predictionReliability}
              matchDataQuality={matchDataQuality}
              actionGate={actionGate}
              simulation={simulation}
              teams={domain.teams}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function MatchDetailSkeleton() {
  return (
    <section className={styles.skeletonPanel} aria-busy="true" aria-label="正在加载比赛详情">
      <span />
      <span />
      <span />
    </section>
  );
}
