import { useMemo } from 'react';
import {
  buildGatewayProfilesSectionProps,
  buildGatewaySettingsSectionProps,
  buildNotificationsSectionProps,
  buildQuickTextSectionProps,
  buildTelemetrySectionProps,
  resolveSettingsSectionOrder,
} from '../components/settings/settings-view-logic';

export default function useSettingsViewWiring(input) {
  return useMemo(() => {
    const order = resolveSettingsSectionOrder();
    const sectionPropsByKey = {
      gatewayProfiles: buildGatewayProfilesSectionProps(input),
      gatewaySettings: buildGatewaySettingsSectionProps(input),
      notifications: buildNotificationsSectionProps(input),
      quickText: buildQuickTextSectionProps(input),
      telemetry: buildTelemetrySectionProps(input),
    };

    return {
      order,
      sectionPropsByKey,
    };
  }, [input]);
}
