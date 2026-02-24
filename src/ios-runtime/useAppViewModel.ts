import type { ComponentProps } from 'react';
import ConnectionHeader from '../ui/ios/ConnectionHeader';
import HomeMainLayout from '../ui/ios/HomeMainLayout';
import SessionsPanelContent from '../ui/ios/SessionsPanelContent';
import SessionsScreenModal from '../ui/ios/SessionsScreenModal';
import SettingsPanelContent from '../ui/ios/SettingsPanelContent';
import SettingsScreenModal from '../ui/ios/SettingsScreenModal';

type ConnectionHeaderProps = ComponentProps<typeof ConnectionHeader>;
type SettingsScreenModalProps = Omit<
  ComponentProps<typeof SettingsScreenModal>,
  'children'
>;
type SettingsPanelContentProps = ComponentProps<typeof SettingsPanelContent>;
type SessionsScreenModalProps = Omit<
  ComponentProps<typeof SessionsScreenModal>,
  'children'
>;
type SessionsPanelContentProps = ComponentProps<typeof SessionsPanelContent>;
type HomeMainLayoutProps = ComponentProps<typeof HomeMainLayout>;

type UseAppViewModelInput = {
  styles: Record<string, any>;
  isDarkTheme: boolean;
  maxTextScale: number;
  maxTextScaleTight: number;
  placeholderColor: string;
  connectionHeader: Omit<
    ConnectionHeaderProps,
    'styles' | 'isDarkTheme' | 'maxTextScaleTight'
  >;
  settingsScreenModal: Omit<
    SettingsScreenModalProps,
    'styles' | 'isDarkTheme' | 'maxTextScaleTight'
  >;
  settingsPanelContent: Omit<
    SettingsPanelContentProps,
    'styles' | 'maxTextScale' | 'maxTextScaleTight' | 'placeholderColor' | 'isDarkTheme'
  >;
  sessionsScreenModal: Omit<
    SessionsScreenModalProps,
    'styles' | 'isDarkTheme' | 'maxTextScaleTight'
  >;
  sessionsPanelContent: Omit<
    SessionsPanelContentProps,
    'styles' | 'maxTextScale' | 'maxTextScaleTight' | 'placeholderColor'
  >;
  homeMainLayout: Omit<
    HomeMainLayoutProps,
    'styles' | 'isDarkTheme' | 'maxTextScale' | 'maxTextScaleTight' | 'placeholderColor'
  >;
};

export function useAppViewModel(input: UseAppViewModelInput) {
  const connectionHeaderProps: ConnectionHeaderProps = {
    ...input.connectionHeader,
    styles: input.styles,
    isDarkTheme: input.isDarkTheme,
    maxTextScaleTight: input.maxTextScaleTight,
  };

  const settingsScreenModalProps: SettingsScreenModalProps = {
    ...input.settingsScreenModal,
    styles: input.styles,
    isDarkTheme: input.isDarkTheme,
    maxTextScaleTight: input.maxTextScaleTight,
  };

  const settingsPanelContentProps: SettingsPanelContentProps = {
    ...input.settingsPanelContent,
    styles: input.styles,
    maxTextScale: input.maxTextScale,
    maxTextScaleTight: input.maxTextScaleTight,
    placeholderColor: input.placeholderColor,
    isDarkTheme: input.isDarkTheme,
  };

  const sessionsScreenModalProps: SessionsScreenModalProps = {
    ...input.sessionsScreenModal,
    styles: input.styles,
    isDarkTheme: input.isDarkTheme,
    maxTextScaleTight: input.maxTextScaleTight,
  };

  const sessionsPanelContentProps: SessionsPanelContentProps = {
    ...input.sessionsPanelContent,
    styles: input.styles,
    maxTextScale: input.maxTextScale,
    maxTextScaleTight: input.maxTextScaleTight,
    placeholderColor: input.placeholderColor,
  };

  const homeMainLayoutProps: HomeMainLayoutProps = {
    ...input.homeMainLayout,
    styles: input.styles,
    isDarkTheme: input.isDarkTheme,
    maxTextScale: input.maxTextScale,
    maxTextScaleTight: input.maxTextScaleTight,
    placeholderColor: input.placeholderColor,
  };

  return {
    connectionHeaderProps,
    settingsScreenModalProps,
    settingsPanelContentProps,
    sessionsScreenModalProps,
    sessionsPanelContentProps,
    homeMainLayoutProps,
  };
}
