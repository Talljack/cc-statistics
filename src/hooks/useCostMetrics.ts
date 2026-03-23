import { useMemo } from 'react';
import type { SessionInfo } from '../types/statistics';
import { usePricingStore } from '../stores/pricingStore';
import { useSettingsStore } from '../stores/settingsStore';
import { deriveCostMetrics, getSessionCostKey } from '../lib/costing';

export function useCostMetrics(sessions: readonly SessionInfo[] | undefined) {
  const customPricingEnabled = useSettingsStore((state) => state.customPricingEnabled);
  const customPricing = useSettingsStore((state) => state.customPricing);
  const dynamicPricing = usePricingStore((state) => state.models);

  return useMemo(() => {
    const metrics = deriveCostMetrics(sessions ?? [], {
      customPricingEnabled,
      customPricing,
      dynamicPricing: dynamicPricing.map((model) => ({
        id: model.id,
        input: model.input,
        output: model.output,
        cacheRead: model.cacheRead,
        cacheCreation: model.cacheWrite,
      })),
    });

    const costBySessionKey = Object.fromEntries(
      metrics.costBySession.map((sessionCost) => [sessionCost.key, sessionCost.totalCost])
    );

    return {
      ...metrics,
      costBySessionKey,
      getSessionCost(session: Pick<SessionInfo, 'source' | 'session_id'>) {
        return costBySessionKey[getSessionCostKey(session)] ?? 0;
      },
    };
  }, [customPricing, customPricingEnabled, dynamicPricing, sessions]);
}
