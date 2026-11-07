import * as xb from 'xrblocks';
import { SpatialBiometricTerminal } from './scene/SpatialBiometricTerminal';
import { AppUI } from './ui/appUI';
import { APP_TITLE } from './constants';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Mount the rich interactive 2D web application UI in #root
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const appUI = new AppUI(rootEl);
    appUI.init();
  }

  // 2. Initialize the 3D Holographic Spatial Terminal for WebXR / Android XR
  const terminal = new SpatialBiometricTerminal();
  xb.add(terminal);

  const options = new xb.Options();
  options.setAppTitle(APP_TITLE);
  options.setAppDescription(
    'Interactive AI Face Recognition & Attendance System with live 10-shot autofetch and 5s cycle monitoring.'
  );

  try {
    await xb.init(options);
  } catch (err) {
    console.warn('XR Blocks initialization info:', err);
  }
});
