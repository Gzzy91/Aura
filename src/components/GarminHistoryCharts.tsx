import { useMemo, useState } from 'react';
import {
  Activity,
  BatteryCharging,
  Droplets,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  Scale,
  Wind,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  formatMinutesAsHoursMinutes,
  hasHealthMetricValue,
} from '@/services/healthSyncService';
import { HealthDailyRecord, HealthMetricKey } from '@/types';

type ChartDomainTab = 'all' | 'sleep_recovery' | 'activity' | 'heart_stress' | 'body_vital';

interface GarminChartPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  record: HealthDailyRecord;
  recoveryScore: number | null;
  sleepHours: number | null;
  sleepDeepHours: number | null;
  sleepRemHours: number | null;
  sleepLightHours: number | null;
  sleepAwakeHours: number | null;
  steps: number | null;
  distanceKm: number | null;
  activityDurationMinutes: number | null;
  caloriesActive: number | null;
  floorsClimbed: number | null;
  heartPoints: number | null;
  workoutsCount: number | null;
  restingHeartRate: number | null;
  avgHeartRate: number | null;
  hrvMs: number | null;
  bodyBattery: number | null;
  stressLevel: number | null;
  spo2Percent: number | null;
  respirationRate: number | null;
  vo2Max: number | null;
  hydrationLiters: number | null;
  weightKg: number | null;
  bodyFatPercent: number | null;
}

const CHART_MARGIN = { top: 8, right: 6, left: -18, bottom: 0 };
const DUAL_AXIS_MARGIN = { top: 8, right: 4, left: -18, bottom: 0 };
const SLEEP_DOMAIN: [number, number] = [0, 11];
const SCORE_DOMAIN: [number, number] = [0, 100];
const SPO2_DOMAIN: [number, number] = [88, 100];
const BAR_RADIUS_TOP: [number, number, number, number] = [4, 4, 0, 0];
const CHART_CURSOR = { fill: '#262626', opacity: 0.35 };
const RESPONSIVE_INIT = { width: 320, height: 180 };

function toPositiveOrNull(val: number | null | undefined): number | null {
  return typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : null;
}

function toNonNegOrNull(val: number | null | undefined): number | null {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : null;
}

function ChartTooltipShell({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string; colorClass?: string }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl shadow-xl space-y-1.5 min-w-[175px]">
      <p className="font-bold text-white text-xs">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-xs">
          <span className="text-neutral-400">{r.label}</span>
          <span className={cn('font-mono font-bold tabular-nums', r.colorClass || 'text-white')}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function SleepRecoveryTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rec = pt.record;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('sleepDurationMinutes') && rec.sleepDurationMinutes > 0) {
    rows.push({
      label: 'Schlafdauer',
      value: formatMinutesAsHoursMinutes(rec.sleepDurationMinutes),
      colorClass: 'text-indigo-300',
    });
  }
  if (visibleSet.has('recoveryScore')) {
    rows.push({
      label: 'Recovery-Score',
      value: `${rec.recoveryScore}/100`,
      colorClass: 'text-amber-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function SleepPhasesTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rec = pt.record;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('sleepDeepMinutes') && rec.sleepDeepMinutes && rec.sleepDeepMinutes > 0) {
    rows.push({
      label: 'Tiefschlaf',
      value: formatMinutesAsHoursMinutes(rec.sleepDeepMinutes),
      colorClass: 'text-indigo-400',
    });
  }
  if (visibleSet.has('sleepRemMinutes') && rec.sleepRemMinutes && rec.sleepRemMinutes > 0) {
    rows.push({
      label: 'REM-Schlaf',
      value: formatMinutesAsHoursMinutes(rec.sleepRemMinutes),
      colorClass: 'text-purple-400',
    });
  }
  if (visibleSet.has('sleepLightMinutes') && rec.sleepLightMinutes && rec.sleepLightMinutes > 0) {
    rows.push({
      label: 'Leichtschlaf',
      value: formatMinutesAsHoursMinutes(rec.sleepLightMinutes),
      colorClass: 'text-sky-400',
    });
  }
  if (visibleSet.has('sleepAwakeMinutes') && rec.sleepAwakeMinutes && rec.sleepAwakeMinutes > 0) {
    rows.push({
      label: 'Wachzeit',
      value: `${rec.sleepAwakeMinutes} Min`,
      colorClass: 'text-amber-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function StepsDistanceTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('steps') && pt.steps !== null) {
    rows.push({
      label: 'Schritte',
      value: pt.steps.toLocaleString('de-DE'),
      colorClass: 'text-emerald-400',
    });
  }
  if (visibleSet.has('distanceMeters') && pt.distanceKm !== null) {
    rows.push({
      label: 'Distanz',
      value: `${pt.distanceKm.toFixed(2).replace('.', ',')} km`,
      colorClass: 'text-teal-300',
    });
  }
  if (visibleSet.has('floorsClimbed') && pt.floorsClimbed !== null) {
    rows.push({
      label: 'Etagen',
      value: `${pt.floorsClimbed}`,
      colorClass: 'text-cyan-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function LoadCaloriesTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('caloriesActive') && pt.caloriesActive !== null) {
    rows.push({
      label: 'Aktivkalorien',
      value: `${pt.caloriesActive.toLocaleString('de-DE')} kcal`,
      colorClass: 'text-orange-400',
    });
  }
  if (visibleSet.has('activityDurationMinutes') && pt.activityDurationMinutes !== null) {
    rows.push({
      label: 'Aktivitätsdauer',
      value: `${pt.activityDurationMinutes} Min`,
      colorClass: 'text-emerald-400',
    });
  }
  if (visibleSet.has('heartPoints') && pt.heartPoints !== null) {
    rows.push({
      label: 'Intensitätsmin.',
      value: `${pt.heartPoints} Min`,
      colorClass: 'text-rose-400',
    });
  }
  if (visibleSet.has('workoutsCount') && pt.workoutsCount !== null) {
    rows.push({
      label: 'Workouts',
      value: `${pt.workoutsCount}`,
      colorClass: 'text-lime-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function HeartHrvTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('restingHeartRate') && pt.restingHeartRate !== null) {
    rows.push({
      label: 'Ruhepuls',
      value: `${pt.restingHeartRate} BPM`,
      colorClass: 'text-pink-400',
    });
  }
  if (visibleSet.has('avgHeartRate') && pt.avgHeartRate !== null) {
    rows.push({
      label: 'Ø Puls',
      value: `${pt.avgHeartRate} BPM`,
      colorClass: 'text-rose-400',
    });
  }
  if (visibleSet.has('hrvMs') && pt.hrvMs !== null) {
    rows.push({
      label: 'HRV (rMSSD)',
      value: `${pt.hrvMs.toFixed(1).replace('.', ',')} ms`,
      colorClass: 'text-violet-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function BatteryStressTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('bodyBattery') && pt.bodyBattery !== null) {
    rows.push({
      label: 'Body Battery',
      value: `${pt.bodyBattery}/100`,
      colorClass: 'text-sky-400',
    });
  }
  if (visibleSet.has('stressLevel') && pt.stressLevel !== null) {
    rows.push({
      label: 'Stresslevel',
      value: `${pt.stressLevel}/100`,
      colorClass: 'text-amber-400',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function VitalRespirationTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('spo2Percent') && pt.spo2Percent !== null) {
    rows.push({
      label: 'SpO₂',
      value: `${pt.spo2Percent.toFixed(1).replace('.', ',')}%`,
      colorClass: 'text-cyan-400',
    });
  }
  if (visibleSet.has('respirationRate') && pt.respirationRate !== null) {
    rows.push({
      label: 'Atemfrequenz',
      value: `${pt.respirationRate.toFixed(1).replace('.', ',')}/Min`,
      colorClass: 'text-sky-300',
    });
  }
  if (visibleSet.has('vo2Max') && pt.vo2Max !== null) {
    rows.push({
      label: 'VO₂ max',
      value: `${pt.vo2Max.toFixed(1).replace('.', ',')}`,
      colorClass: 'text-emerald-300',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function BodyHydrationTooltip({
  active,
  payload,
  visibleSet,
}: {
  active?: boolean;
  payload?: Array<{ payload: GarminChartPoint }>;
  visibleSet: Set<HealthMetricKey>;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const rows: Array<{ label: string; value: string; colorClass?: string }> = [];
  if (visibleSet.has('hydrationMl') && pt.hydrationLiters !== null) {
    rows.push({
      label: 'Hydration',
      value: `${pt.hydrationLiters.toFixed(2).replace('.', ',')} L`,
      colorClass: 'text-sky-400',
    });
  }
  if (visibleSet.has('weightKg') && pt.weightKg !== null) {
    rows.push({
      label: 'Gewicht',
      value: `${pt.weightKg.toFixed(1).replace('.', ',')} kg`,
      colorClass: 'text-neutral-200',
    });
  }
  if (visibleSet.has('bodyFatPercent') && pt.bodyFatPercent !== null) {
    rows.push({
      label: 'Körperfett',
      value: `${pt.bodyFatPercent.toFixed(1).replace('.', ',')}%`,
      colorClass: 'text-amber-300',
    });
  }
  return <ChartTooltipShell title={pt.fullDate} rows={rows} />;
}

function ChartLegendDot({ colorClass, label, square }: { colorClass: string; label: string; square?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-neutral-400 whitespace-nowrap">
      <span
        className={cn(
          'w-2.5 h-2.5 inline-block shrink-0',
          square ? 'rounded-sm' : 'rounded-full',
          colorClass
        )}
      />
      {label}
    </span>
  );
}

export function MetricSparkline({
  values,
  strokeColor,
}: {
  values: number[];
  strokeColor: string;
}) {
  if (values.length < 2) return null;
  const width = 46;
  const height = 16;
  const padY = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((v, idx) => {
    const x = (idx / (values.length - 1)) * (width - 4) + 2;
    const y = height - padY - ((v - min) / span) * (height - padY * 2);
    return { x, y };
  });
  const pointsAttr = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.85"
        points={pointsAttr}
      />
      <circle cx={last.x} cy={last.y} r="2.1" fill={strokeColor} />
    </svg>
  );
}

export function GarminHistoryCharts({
  records,
  visibleSet,
}: {
  records: HealthDailyRecord[];
  visibleSet: Set<HealthMetricKey>;
}) {
  const [domainTab, setDomainTab] = useState<ChartDomainTab>('all');

  const chartData = useMemo<GarminChartPoint[]>(() => {
    return [...records]
      .sort((a, b) => a.date - b.date)
      .map((r) => {
        const d = new Date(r.date);
        if (Number.isNaN(d.getTime())) return null;
        return {
          dateKey: r.id,
          label: format(d, 'dd.MM.'),
          fullDate: format(d, 'EEEE, dd.MM.yyyy', { locale: de }),
          record: r,
          recoveryScore: typeof r.recoveryScore === 'number' ? r.recoveryScore : null,
          sleepHours:
            r.sleepDurationMinutes > 0
              ? Number((r.sleepDurationMinutes / 60).toFixed(2))
              : null,
          sleepDeepHours:
            r.sleepDeepMinutes && r.sleepDeepMinutes > 0
              ? Number((r.sleepDeepMinutes / 60).toFixed(2))
              : null,
          sleepRemHours:
            r.sleepRemMinutes && r.sleepRemMinutes > 0
              ? Number((r.sleepRemMinutes / 60).toFixed(2))
              : null,
          sleepLightHours:
            r.sleepLightMinutes && r.sleepLightMinutes > 0
              ? Number((r.sleepLightMinutes / 60).toFixed(2))
              : null,
          sleepAwakeHours:
            r.sleepAwakeMinutes && r.sleepAwakeMinutes > 0
              ? Number((r.sleepAwakeMinutes / 60).toFixed(2))
              : null,
          steps: toPositiveOrNull(r.steps),
          distanceKm:
            typeof r.distanceMeters === 'number' && r.distanceMeters > 0
              ? Number((r.distanceMeters / 1000).toFixed(2))
              : null,
          activityDurationMinutes: toPositiveOrNull(r.activityDurationMinutes),
          caloriesActive: toPositiveOrNull(r.caloriesActive),
          floorsClimbed: toPositiveOrNull(r.floorsClimbed),
          heartPoints: toPositiveOrNull(r.heartPoints),
          workoutsCount: toPositiveOrNull(r.workoutsCount),
          restingHeartRate: toPositiveOrNull(r.restingHeartRate),
          avgHeartRate: toPositiveOrNull(r.avgHeartRate),
          hrvMs: toPositiveOrNull(r.hrvMs),
          bodyBattery: toNonNegOrNull(r.bodyBattery),
          stressLevel: toNonNegOrNull(r.stressLevel),
          spo2Percent: toPositiveOrNull(r.spo2Percent),
          respirationRate: toPositiveOrNull(r.respirationRate),
          vo2Max: toPositiveOrNull(r.vo2Max),
          hydrationLiters:
            typeof r.hydrationMl === 'number' && r.hydrationMl > 0
              ? Number((r.hydrationMl / 1000).toFixed(2))
              : null,
          weightKg: toPositiveOrNull(r.weightKg),
          bodyFatPercent: toPositiveOrNull(r.bodyFatPercent),
        };
      })
      .filter((pt): pt is GarminChartPoint => pt !== null);
  }, [records]);

  // Availability checks per chart (strictly tied to visibleSet + real Garmin data)
  const availability = useMemo(() => {
    const hasAny = (key: HealthMetricKey, field: keyof GarminChartPoint) =>
      visibleSet.has(key) && chartData.some((pt) => pt[field] !== null);

    const showSleepRecovery =
      hasAny('sleepDurationMinutes', 'sleepHours') ||
      (visibleSet.has('recoveryScore') && chartData.some((pt) => pt.recoveryScore !== null));

    const showSleepPhases =
      hasAny('sleepDeepMinutes', 'sleepDeepHours') ||
      hasAny('sleepRemMinutes', 'sleepRemHours') ||
      hasAny('sleepLightMinutes', 'sleepLightHours') ||
      hasAny('sleepAwakeMinutes', 'sleepAwakeHours');

    const showStepsDistance =
      hasAny('steps', 'steps') || hasAny('distanceMeters', 'distanceKm');

    const showLoadCalories =
      hasAny('caloriesActive', 'caloriesActive') ||
      hasAny('activityDurationMinutes', 'activityDurationMinutes') ||
      hasAny('heartPoints', 'heartPoints');

    const showHeartHrv =
      hasAny('restingHeartRate', 'restingHeartRate') ||
      hasAny('avgHeartRate', 'avgHeartRate') ||
      hasAny('hrvMs', 'hrvMs');

    const showBatteryStress =
      hasAny('bodyBattery', 'bodyBattery') || hasAny('stressLevel', 'stressLevel');

    const showVitalRespiration =
      hasAny('spo2Percent', 'spo2Percent') ||
      hasAny('respirationRate', 'respirationRate') ||
      hasAny('vo2Max', 'vo2Max');

    const showBodyHydration =
      hasAny('hydrationMl', 'hydrationLiters') ||
      hasAny('weightKg', 'weightKg') ||
      hasAny('bodyFatPercent', 'bodyFatPercent');

    const avgSteps = (() => {
      const vals = chartData.map((d) => d.steps).filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    const avgRestingHr = (() => {
      const vals = chartData
        .map((d) => d.restingHeartRate)
        .filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    const avgCalories = (() => {
      const vals = chartData
        .map((d) => d.caloriesActive)
        .filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    const avgBodyBattery = (() => {
      const vals = chartData.map((d) => d.bodyBattery).filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    const avgStress = (() => {
      const vals = chartData.map((d) => d.stressLevel).filter((v): v is number => v !== null);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    })();

    const latestVo2Max = (() => {
      for (let i = chartData.length - 1; i >= 0; i--) {
        if (chartData[i].vo2Max !== null) return chartData[i].vo2Max;
      }
      return null;
    })();

    const totalDistanceKm = chartData.reduce((s, d) => s + (d.distanceKm || 0), 0);

    return {
      showSleepRecovery,
      showSleepPhases,
      showStepsDistance,
      showLoadCalories,
      showHeartHrv,
      showBatteryStress,
      showVitalRespiration,
      showBodyHydration,
      avgSteps,
      avgRestingHr,
      avgCalories,
      avgBodyBattery,
      avgStress,
      latestVo2Max,
      totalDistanceKm,
      hasSleepRecoveryCat: showSleepRecovery || showSleepPhases,
      hasActivityCat: showStepsDistance || showLoadCalories,
      hasHeartStressCat: showHeartHrv || showBatteryStress,
      hasBodyVitalCat: showVitalRespiration || showBodyHydration,
    };
  }, [chartData, visibleSet]);

  const categoryTabs = useMemo(() => {
    const tabs: Array<{ id: ChartDomainTab; label: string }> = [{ id: 'all', label: 'Alle' }];
    if (availability.hasSleepRecoveryCat) {
      tabs.push({ id: 'sleep_recovery', label: 'Schlaf & Recovery' });
    }
    if (availability.hasActivityCat) {
      tabs.push({ id: 'activity', label: 'Aktivität' });
    }
    if (availability.hasHeartStressCat) {
      tabs.push({ id: 'heart_stress', label: 'Herz & Stress' });
    }
    if (availability.hasBodyVitalCat) {
      tabs.push({ id: 'body_vital', label: 'Körper & Vital' });
    }
    return tabs;
  }, [availability]);

  const activeCategory: ChartDomainTab =
    categoryTabs.some((t) => t.id === domainTab) ? domainTab : 'all';

  const tooltipSleepRecovery = useMemo(
    () => <SleepRecoveryTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipSleepPhases = useMemo(
    () => <SleepPhasesTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipStepsDistance = useMemo(
    () => <StepsDistanceTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipLoadCalories = useMemo(
    () => <LoadCaloriesTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipHeartHrv = useMemo(
    () => <HeartHrvTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipBatteryStress = useMemo(
    () => <BatteryStressTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipVitalRespiration = useMemo(
    () => <VitalRespirationTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );
  const tooltipBodyHydration = useMemo(
    () => <BodyHydrationTooltip visibleSet={visibleSet} />,
    [visibleSet]
  );

  const anyChartVisible =
    availability.showSleepRecovery ||
    availability.showSleepPhases ||
    availability.showStepsDistance ||
    availability.showLoadCalories ||
    availability.showHeartHrv ||
    availability.showBatteryStress ||
    availability.showVitalRespiration ||
    availability.showBodyHydration;

  if (!anyChartVisible || chartData.length === 0) {
    return null;
  }

  const showSection = (cat: Exclude<ChartDomainTab, 'all'>) =>
    activeCategory === 'all' || activeCategory === cat;

  const hasHydration =
    visibleSet.has('hydrationMl') && chartData.some((d) => d.hydrationLiters !== null);
  const hasWeight = visibleSet.has('weightKg') && chartData.some((d) => d.weightKg !== null);
  const hasBodyFat =
    visibleSet.has('bodyFatPercent') && chartData.some((d) => d.bodyFatPercent !== null);
  const hasSpo2 = visibleSet.has('spo2Percent') && chartData.some((d) => d.spo2Percent !== null);
  const hasResp =
    visibleSet.has('respirationRate') && chartData.some((d) => d.respirationRate !== null);
  const hasVo2 = visibleSet.has('vo2Max') && chartData.some((d) => d.vo2Max !== null);
  const hasRhr =
    visibleSet.has('restingHeartRate') && chartData.some((d) => d.restingHeartRate !== null);
  const hasAvgHr =
    visibleSet.has('avgHeartRate') && chartData.some((d) => d.avgHeartRate !== null);
  const hasHrv = visibleSet.has('hrvMs') && chartData.some((d) => d.hrvMs !== null);
  const hasBattery =
    visibleSet.has('bodyBattery') && chartData.some((d) => d.bodyBattery !== null);
  const hasStress =
    visibleSet.has('stressLevel') && chartData.some((d) => d.stressLevel !== null);
  const hasSteps = visibleSet.has('steps') && chartData.some((d) => d.steps !== null);
  const hasDistance =
    visibleSet.has('distanceMeters') && chartData.some((d) => d.distanceKm !== null);
  const hasCalories =
    visibleSet.has('caloriesActive') && chartData.some((d) => d.caloriesActive !== null);
  const hasActMin =
    visibleSet.has('activityDurationMinutes') &&
    chartData.some((d) => d.activityDurationMinutes !== null);
  const hasIntensity =
    visibleSet.has('heartPoints') && chartData.some((d) => d.heartPoints !== null);

  return (
    <div className="space-y-3">
      {/* Category Switcher */}
      {categoryTabs.length > 2 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-neutral-950 border border-neutral-800 gap-0.5">
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDomainTab(tab.id)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap',
                  activeCategory === tab.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-neutral-500 tabular-nums">
            {chartData.length} {chartData.length === 1 ? 'Tag' : 'Tage'} Verlauf
          </span>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {/* 1. Sleep & Recovery */}
        {showSection('sleep_recovery') && availability.showSleepRecovery && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Schlaf (Std) &amp; Recovery</span>
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {visibleSet.has('sleepDurationMinutes') && (
                  <ChartLegendDot colorClass="bg-indigo-400" label="Schlaf" square />
                )}
                {visibleSet.has('recoveryScore') && (
                  <ChartLegendDot colorClass="bg-amber-500" label="Recovery" />
                )}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="sleep"
                    domain={SLEEP_DOMAIN}
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <YAxis
                    yAxisId="score"
                    orientation="right"
                    domain={SCORE_DOMAIN}
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipSleepRecovery} />
                  {visibleSet.has('sleepDurationMinutes') && (
                    <ReferenceLine
                      yAxisId="sleep"
                      y={7.5}
                      stroke="#6366f1"
                      strokeOpacity={0.35}
                      strokeDasharray="4 4"
                    />
                  )}
                  {visibleSet.has('sleepDurationMinutes') && (
                    <Bar
                      yAxisId="sleep"
                      dataKey="sleepHours"
                      name="Schlaf (Std)"
                      fill="#818cf8"
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {visibleSet.has('recoveryScore') && (
                    <Line
                      yAxisId="score"
                      type="monotone"
                      dataKey="recoveryScore"
                      name="Recovery"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#f59e0b', stroke: '#171717', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: '#fbbf24' }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 2. Sleep Phases Stacked */}
        {showSection('sleep_recovery') && availability.showSleepPhases && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <BatteryCharging className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Schlafphasen-Architektur</span>
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                {visibleSet.has('sleepDeepMinutes') && (
                  <ChartLegendDot colorClass="bg-indigo-500" label="Tief" square />
                )}
                {visibleSet.has('sleepRemMinutes') && (
                  <ChartLegendDot colorClass="bg-purple-500" label="REM" square />
                )}
                {visibleSet.has('sleepLightMinutes') && (
                  <ChartLegendDot colorClass="bg-sky-400" label="Leicht" square />
                )}
                {visibleSet.has('sleepAwakeMinutes') && (
                  <ChartLegendDot colorClass="bg-amber-500" label="Wach" square />
                )}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipSleepPhases} />
                  {visibleSet.has('sleepDeepMinutes') && (
                    <Bar
                      dataKey="sleepDeepHours"
                      stackId="sleep"
                      fill="#6366f1"
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {visibleSet.has('sleepRemMinutes') && (
                    <Bar
                      dataKey="sleepRemHours"
                      stackId="sleep"
                      fill="#a855f7"
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {visibleSet.has('sleepLightMinutes') && (
                    <Bar
                      dataKey="sleepLightHours"
                      stackId="sleep"
                      fill="#38bdf8"
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {visibleSet.has('sleepAwakeMinutes') && (
                    <Bar
                      dataKey="sleepAwakeHours"
                      stackId="sleep"
                      fill="#f59e0b"
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 3. Steps & Distance */}
        {showSection('activity') && availability.showStepsDistance && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Footprints className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Schritte &amp; Distanz</span>
                {availability.totalDistanceKm > 0 && (
                  <span className="text-[11px] font-normal text-neutral-400 tabular-nums">
                    · {availability.totalDistanceKm.toFixed(1).replace('.', ',')} km ges.
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasSteps && <ChartLegendDot colorClass="bg-emerald-500" label="Schritte" square />}
                {hasDistance && <ChartLegendDot colorClass="bg-teal-400" label="Distanz (km)" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={DUAL_AXIS_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="steps"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                  />
                  <YAxis
                    yAxisId="km"
                    orientation="right"
                    stroke="#2dd4bf"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasDistance}
                    tickFormatter={(v) => `${v} km`}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipStepsDistance} />
                  {hasSteps && availability.avgSteps !== null && (
                    <ReferenceLine
                      yAxisId="steps"
                      y={availability.avgSteps}
                      stroke="#10b981"
                      strokeOpacity={0.4}
                      strokeDasharray="4 4"
                    />
                  )}
                  {hasSteps && (
                    <Bar
                      yAxisId="steps"
                      dataKey="steps"
                      name="Schritte"
                      fill="#10b981"
                      fillOpacity={0.78}
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {hasDistance && (
                    <Line
                      yAxisId={hasSteps ? 'km' : 'steps'}
                      type="monotone"
                      dataKey="distanceKm"
                      name="Distanz (km)"
                      stroke="#2dd4bf"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#2dd4bf', stroke: '#171717', strokeWidth: 1.5 }}
                      activeDot={{ r: 5, fill: '#5eead4' }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 4. Active Calories & Load / Intensity */}
        {showSection('activity') && availability.showLoadCalories && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span>Kalorien &amp; Aktivitätsminuten</span>
                {availability.avgCalories !== null && (
                  <span className="text-[11px] font-normal text-neutral-400 tabular-nums">
                    · Ø {availability.avgCalories.toLocaleString('de-DE')} kcal
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasCalories && <ChartLegendDot colorClass="bg-orange-400" label="kcal" square />}
                {hasActMin && <ChartLegendDot colorClass="bg-emerald-400" label="Aktivität" />}
                {hasIntensity && <ChartLegendDot colorClass="bg-rose-400" label="Intensität" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={DUAL_AXIS_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="kcal"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasCalories}
                  />
                  <YAxis
                    yAxisId="mins"
                    orientation={hasCalories ? 'right' : 'left'}
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}m`}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipLoadCalories} />
                  {hasCalories && (
                    <Bar
                      yAxisId="kcal"
                      dataKey="caloriesActive"
                      name="Aktivkalorien"
                      fill="#fb923c"
                      fillOpacity={0.78}
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {hasActMin && (
                    <Line
                      yAxisId="mins"
                      type="monotone"
                      dataKey="activityDurationMinutes"
                      name="Aktivitätsdauer"
                      stroke="#34d399"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#34d399', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasIntensity && (
                    <Line
                      yAxisId="mins"
                      type="monotone"
                      dataKey="heartPoints"
                      name="Intensitätsminuten"
                      stroke="#fb7185"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                      connectNulls
                      dot={{ r: 2.5, fill: '#fb7185', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 5. Heart Rate & HRV */}
        {showSection('heart_stress') && availability.showHeartHrv && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>Herzfrequenz &amp; HRV</span>
                {availability.avgRestingHr !== null && (
                  <span className="text-[11px] font-normal text-neutral-400 tabular-nums">
                    · Ø Ruhe {availability.avgRestingHr} BPM
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasRhr && <ChartLegendDot colorClass="bg-pink-400" label="Ruhepuls" />}
                {hasAvgHr && <ChartLegendDot colorClass="bg-rose-400" label="Ø Puls" />}
                {hasHrv && <ChartLegendDot colorClass="bg-violet-400" label="HRV (ms)" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={DUAL_AXIS_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="bpm"
                    domain={['dataMin - 4', 'dataMax + 4']}
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasRhr && !hasAvgHr}
                  />
                  <YAxis
                    yAxisId="hrv"
                    orientation="right"
                    domain={['dataMin - 5', 'dataMax + 5']}
                    stroke="#a78bfa"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasHrv}
                    tickFormatter={(v) => `${v}ms`}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipHeartHrv} />
                  {hasRhr && (
                    <Line
                      yAxisId="bpm"
                      type="monotone"
                      dataKey="restingHeartRate"
                      name="Ruhepuls"
                      stroke="#f472b6"
                      strokeWidth={2.2}
                      connectNulls
                      dot={{ r: 3, fill: '#f472b6', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasAvgHr && (
                    <Line
                      yAxisId="bpm"
                      type="monotone"
                      dataKey="avgHeartRate"
                      name="Ø Puls"
                      stroke="#fb7185"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#fb7185', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasHrv && (
                    <Line
                      yAxisId={hasRhr || hasAvgHr ? 'hrv' : 'bpm'}
                      type="monotone"
                      dataKey="hrvMs"
                      name="HRV (ms)"
                      stroke="#a78bfa"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#a78bfa', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 6. Body Battery & Stress */}
        {showSection('heart_stress') && availability.showBatteryStress && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Body Battery &amp; Stresslevel</span>
                {(availability.avgBodyBattery !== null || availability.avgStress !== null) && (
                  <span className="text-[11px] font-normal text-neutral-400 tabular-nums">
                    {availability.avgBodyBattery !== null
                      ? `· Ø BB ${availability.avgBodyBattery}`
                      : ''}
                    {availability.avgStress !== null ? ` · Ø Stress ${availability.avgStress}` : ''}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasBattery && <ChartLegendDot colorClass="bg-sky-400" label="Body Battery" />}
                {hasStress && <ChartLegendDot colorClass="bg-amber-500" label="Stress" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <AreaChart data={chartData} margin={CHART_MARGIN}>
                  <defs>
                    <linearGradient id="garminBatteryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="garminStressGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={SCORE_DOMAIN}
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipBatteryStress} />
                  {hasBattery && (
                    <Area
                      type="monotone"
                      dataKey="bodyBattery"
                      name="Body Battery"
                      stroke="#38bdf8"
                      strokeWidth={2.2}
                      fill="url(#garminBatteryGrad)"
                      connectNulls
                      dot={{ r: 3, fill: '#38bdf8', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasStress && (
                    <Area
                      type="monotone"
                      dataKey="stressLevel"
                      name="Stresslevel"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      fill="url(#garminStressGrad)"
                      connectNulls
                      dot={{ r: 3, fill: '#f59e0b', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 7. SpO2, Respiration & VO2 max */}
        {showSection('body_vital') && availability.showVitalRespiration && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Atmung, SpO₂ &amp; Fitness</span>
                {availability.latestVo2Max !== null && (
                  <span className="text-[11px] font-normal text-emerald-300 tabular-nums">
                    · VO₂ max {availability.latestVo2Max.toFixed(1).replace('.', ',')}
                  </span>
                )}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasSpo2 && <ChartLegendDot colorClass="bg-cyan-400" label="SpO₂ (%)" />}
                {hasResp && <ChartLegendDot colorClass="bg-sky-300" label="Atmung (/Min)" />}
                {hasVo2 && <ChartLegendDot colorClass="bg-emerald-300" label="VO₂ max" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={DUAL_AXIS_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="spo2"
                    domain={SPO2_DOMAIN}
                    stroke="#22d3ee"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasSpo2}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    yAxisId="resp"
                    orientation={hasSpo2 ? 'right' : 'left'}
                    domain={['dataMin - 2', 'dataMax + 2']}
                    stroke="#7dd3fc"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasResp && !hasVo2}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipVitalRespiration} />
                  {hasSpo2 && (
                    <Line
                      yAxisId="spo2"
                      type="monotone"
                      dataKey="spo2Percent"
                      name="SpO₂"
                      stroke="#22d3ee"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#22d3ee', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasResp && (
                    <Line
                      yAxisId="resp"
                      type="monotone"
                      dataKey="respirationRate"
                      name="Atemfrequenz"
                      stroke="#7dd3fc"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#7dd3fc', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasVo2 && !hasResp && (
                    <Line
                      yAxisId="resp"
                      type="monotone"
                      dataKey="vo2Max"
                      name="VO₂ max"
                      stroke="#6ee7b7"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#6ee7b7', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 8. Hydration & Body Composition */}
        {showSection('body_vital') && availability.showBodyHydration && (
          <div className="bg-neutral-950/90 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                {hasHydration ? (
                  <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <Scale className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                )}
                <span>Hydration &amp; Körperwerte</span>
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {hasHydration && <ChartLegendDot colorClass="bg-sky-400" label="Wasser (L)" square />}
                {hasWeight && <ChartLegendDot colorClass="bg-neutral-200" label="Gewicht (kg)" />}
                {hasBodyFat && <ChartLegendDot colorClass="bg-amber-300" label="Körperfett (%)" />}
              </div>
            </div>
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
                initialDimension={RESPONSIVE_INIT}
                debounce={50}
              >
                <ComposedChart data={chartData} margin={DUAL_AXIS_MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="#737373"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="water"
                    stroke="#38bdf8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasHydration}
                    tickFormatter={(v) => `${v}L`}
                  />
                  <YAxis
                    yAxisId="weight"
                    orientation={hasHydration ? 'right' : 'left'}
                    domain={['dataMin - 1', 'dataMax + 1']}
                    stroke="#a3a3a3"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    hide={!hasWeight && !hasBodyFat}
                  />
                  <Tooltip cursor={CHART_CURSOR} content={tooltipBodyHydration} />
                  {hasHydration && (
                    <ReferenceLine
                      yAxisId="water"
                      y={2.5}
                      stroke="#38bdf8"
                      strokeOpacity={0.35}
                      strokeDasharray="4 4"
                    />
                  )}
                  {hasHydration && (
                    <Bar
                      yAxisId="water"
                      dataKey="hydrationLiters"
                      name="Hydration (L)"
                      fill="#38bdf8"
                      fillOpacity={0.75}
                      radius={BAR_RADIUS_TOP}
                      maxBarSize={22}
                      isAnimationActive={false}
                    />
                  )}
                  {hasWeight && (
                    <Line
                      yAxisId="weight"
                      type="monotone"
                      dataKey="weightKg"
                      name="Gewicht (kg)"
                      stroke="#e5e5e5"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#e5e5e5', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                  {hasBodyFat && !hasWeight && (
                    <Line
                      yAxisId="weight"
                      type="monotone"
                      dataKey="bodyFatPercent"
                      name="Körperfett (%)"
                      stroke="#fcd34d"
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 3, fill: '#fcd34d', stroke: '#171717', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
