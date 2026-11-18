import { Check, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_HEALTH_METRIC_KEYS,
  DEFAULT_VISIBLE_HEALTH_METRICS,
  HEALTH_METRIC_CATEGORY_LABELS,
  HEALTH_METRICS_CATALOG,
  HealthMetricCategory,
  formatHealthMetricValue,
  hasHealthMetricValue,
} from '@/services/healthSyncService';
import { HealthDailyRecord, HealthMetricKey } from '@/types';

const CATEGORY_ORDER: HealthMetricCategory[] = [
  'recovery_heart',
  'sleep',
  'activity',
  'body',
];

const MINIMAL_METRICS: HealthMetricKey[] = [
  'recoveryScore',
  'sleepDurationMinutes',
  'activityDurationMinutes',
];

interface HealthMetricsPickerProps {
  visibleMetrics?: HealthMetricKey[];
  onChange: (next: HealthMetricKey[]) => void;
  currentRecord?: HealthDailyRecord | null;
  historyRecords?: HealthDailyRecord[];
  compact?: boolean;
}

export function HealthMetricsPicker({
  visibleMetrics,
  onChange,
  currentRecord,
  historyRecords = [],
  compact = false,
}: HealthMetricsPickerProps) {
  const activeSet = new Set<HealthMetricKey>(
    Array.isArray(visibleMetrics) ? visibleMetrics : DEFAULT_VISIBLE_HEALTH_METRICS
  );

  const toggleMetric = (key: HealthMetricKey) => {
    const next = new Set(activeSet);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    const ordered = ALL_HEALTH_METRIC_KEYS.filter((k) => next.has(k));
    onChange(ordered);
  };

  const handleSelectWithData = () => {
    const recordsToCheck = [
      ...(currentRecord ? [currentRecord] : []),
      ...historyRecords.slice(0, 14),
    ];
    const detected = ALL_HEALTH_METRIC_KEYS.filter((key) =>
      recordsToCheck.some((rec) => hasHealthMetricValue(key, rec))
    );
    if (detected.length === 0) {
      onChange(MINIMAL_METRICS);
      return;
    }
    const withCore = Array.from(new Set<HealthMetricKey>([...MINIMAL_METRICS, ...detected]));
    onChange(ALL_HEALTH_METRIC_KEYS.filter((k) => withCore.includes(k)));
  };

  return (
    <div className="space-y-4">
      {/* Presets & Active Count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(ALL_HEALTH_METRIC_KEYS)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-amber-500/50 hover:text-white transition-colors"
          >
            Alle (24)
          </button>
          <button
            type="button"
            onClick={handleSelectWithData}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-amber-500/50 hover:text-white transition-colors"
          >
            Nur mit Daten
          </button>
          <button
            type="button"
            onClick={() => onChange(MINIMAL_METRICS)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-amber-500/50 hover:text-white transition-colors"
          >
            Minimal (3)
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 transition-colors inline-flex items-center gap-1"
            title="Alle ausblenden"
          >
            <EyeOff className="w-3 h-3" />
            <span>Keine</span>
          </button>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_VISIBLE_HEALTH_METRICS)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 transition-colors inline-flex items-center gap-1"
            title="Auf Standard zurücksetzen"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Standard</span>
          </button>
        </div>

        <span className="text-xs font-mono text-neutral-400 tabular-nums inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          {activeSet.size}/{ALL_HEALTH_METRIC_KEYS.length} aktiv
        </span>
      </div>

      {/* Category Groups */}
      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const items = HEALTH_METRICS_CATALOG.filter((m) => m.category === cat);
          return (
            <div key={cat} className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                {HEALTH_METRIC_CATEGORY_LABELS[cat]}
              </div>
              <div
                className={cn(
                  'grid gap-2',
                  compact
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                )}
              >
                {items.map((metric) => {
                  const isActive = activeSet.has(metric.key);
                  const liveValue = formatHealthMetricValue(metric.key, currentRecord);
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => toggleMetric(metric.key)}
                      aria-pressed={isActive}
                      className={cn(
                        'flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-colors min-h-[44px]',
                        isActive
                          ? 'bg-amber-500/10 border-amber-500/40 text-white'
                          : 'bg-neutral-950 border-neutral-800/90 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors',
                          isActive
                            ? 'bg-amber-500 border-amber-500 text-neutral-950'
                            : 'bg-neutral-900 border-neutral-700 text-transparent'
                        )}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">{metric.label}</span>
                          {liveValue && (
                            <span
                              className={cn(
                                'text-[11px] font-mono tabular-nums shrink-0',
                                isActive ? 'text-amber-300' : 'text-neutral-500'
                              )}
                            >
                              {liveValue}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 truncate mt-0.5">
                          {metric.providers}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
