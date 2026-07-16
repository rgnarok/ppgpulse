import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PRIMARY = '#4F46E5';
const COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#8B5CF6', '#14B8A6', '#EF4444'];

export function HBarChart({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{ data: values, backgroundColor: PRIMARY, borderRadius: 6, barThickness: 14 }],
      }}
      options={{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: '#EEF1F6' } },
          y: { grid: { display: false } },
        },
      }}
    />
  );
}

/** Vertical column chart — used for "requirements by month" style trends. */
export function VBarChart({
  labels,
  values,
  color = '#C99A2E',
}: {
  labels: string[];
  values: number[];
  color?: string;
}) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{ data: values, backgroundColor: color, borderRadius: 6, barThickness: 24 }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#EEF1F6' }, ticks: { precision: 0 } },
          x: { grid: { display: false } },
        },
      }}
    />
  );
}

export function DonutChart({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <Doughnut
      data={{ labels, datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0 }] }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: { legend: { position: 'bottom' } },
      }}
    />
  );
}
