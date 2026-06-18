import { calculateCalibrationBuckets } from '../../modules/sports/football/worldCup/logic/calibration';
import { calculateAccuracy, calculateBrierScore, calculateLogLoss, type PredictionResult } from '../../modules/sports/football/worldCup/logic/scoring';
import styles from '../../modules/sports/football/worldCup/WorldCup.module.css';

const sampleResults: PredictionResult[] = [
  { probabilities: { home: 0.54, draw: 0.25, away: 0.21 }, outcome: 'home' },
  { probabilities: { home: 0.38, draw: 0.3, away: 0.32 }, outcome: 'draw' },
  { probabilities: { home: 0.62, draw: 0.22, away: 0.16 }, outcome: 'away' },
];

export function PredictionReview() {
  const buckets = calculateCalibrationBuckets(sampleResults);

  return (
    <section className={styles.panel} aria-labelledby="review-title">
      <h2 id="review-title">预测复盘指标</h2>
      <p>当前 official finished sample match 不足，以下为 mock educational example。短期命中率不能证明模型能力。</p>
      <p>Accuracy {(calculateAccuracy(sampleResults) * 100).toFixed(1)}% · Brier {calculateBrierScore(sampleResults).toFixed(3)} · Log Loss {calculateLogLoss(sampleResults).toFixed(3)} · ROI 0.000 · Max Drawdown 0.000</p>
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Bucket</th><th>Count</th><th>Avg prediction</th><th>Actual frequency</th></tr></thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.label}>
                <td>{bucket.label}</td>
                <td>{bucket.count}</td>
                <td>{(bucket.averagePrediction * 100).toFixed(1)}%</td>
                <td>{(bucket.actualFrequency * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
