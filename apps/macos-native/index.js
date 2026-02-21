/**
 * macOS native entry
 */

import './runtime-polyfills';
import { AppRegistry } from 'react-native';
import App from './App.js';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
