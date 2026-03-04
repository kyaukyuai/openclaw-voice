import React from 'react';
import GatewayProfilesCard from './GatewayProfilesCard';
import GatewaySettingsCard from './GatewaySettingsCard';
import NotificationsSettingsCard from './NotificationsSettingsCard';
import QuickTextSettingsCard from './QuickTextSettingsCard';
import RuntimeTelemetryCard from './RuntimeTelemetryCard';

const SECTION_COMPONENT_BY_KEY = {
  gatewayProfiles: GatewayProfilesCard,
  gatewaySettings: GatewaySettingsCard,
  notifications: NotificationsSettingsCard,
  quickText: QuickTextSettingsCard,
  telemetry: RuntimeTelemetryCard,
};

export default function SettingsSections({ order, sectionPropsByKey }) {
  return order.map((sectionKey) => {
    const SectionComponent = SECTION_COMPONENT_BY_KEY[sectionKey];
    if (!SectionComponent) return null;
    return (
      <SectionComponent
        key={`settings-section:${sectionKey}`}
        {...(sectionPropsByKey[sectionKey] ?? {})}
      />
    );
  });
}
