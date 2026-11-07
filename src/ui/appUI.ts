import { ActiveTab, CaptureProgress, DetectionResult, Student } from '../types';
import { storageService } from '../services/storageService';
import { cameraService } from '../services/cameraService';
import { faceRecognitionService } from '../services/faceRecognitionService';
import { audioService } from '../services/audioService';
import { SCAN_INTERVAL_SECONDS } from '../constants';

export class AppUI {
  private container: HTMLElement;
  private activeTab: ActiveTab = 'step1_register';

  // Video and canvas elements
  private regVideoEl: HTMLVideoElement | null = null;
  private monVideoEl: HTMLVideoElement | null = null;
  private monCanvasEl: HTMLCanvasElement | null = null;
  private monOverlayCtx: CanvasRenderingContext2D | null = null;

  // 10-shot registration state
  private capturedPhotos: string[] = [];
  private capturedDescriptors: number[][] = [];
  private isCapturing = false;

  // Continuous live tracking & 5-second monitoring cycle state
  private isMonitoring = false;
  private liveTrackingTimer: number | null = null;
  private cycleCountdown = SCAN_INTERVAL_SECONDS;
  private countdownTimer: number | null = null;
  private latestDetection: DetectionResult | null = null;

  // Filter state for Step 3
  private logFilter: 'all' | 'Present' | 'Absent' | 'Unknown Attempt' = 'all';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public init() {
    this.render();
    this.bindGlobalEvents();
    this.startCameraForCurrentTab();
  }

  private render() {
    this.container.innerHTML = `
      <div class="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-y-auto">
        <!-- Top Navigation Bar -->
        <header class="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-xl">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-lg lg:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                AI Face Attendance System
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Auto Biometrics</span>
              </h1>
              <p class="text-xs text-slate-400">Live 10-Shot Registration & 5-Second Automatic Face Monitoring</p>
            </div>
          </div>

          <!-- Step Tabs -->
          <nav class="flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-xl border border-slate-700/60 shadow-inner">
            <button id="nav-step1" class="step-tab-btn flex items-center gap-2 px-3.5 py-1.5 text-xs lg:text-sm font-medium rounded-lg transition-all ${
              this.activeTab === 'step1_register'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }">
              <span class="w-5 h-5 rounded-full ${this.activeTab === 'step1_register' ? 'bg-white/20' : 'bg-slate-700'} text-xs flex items-center justify-center font-bold">1</span>
              <span>Register & Roster</span>
            </button>
            <button id="nav-step2" class="step-tab-btn flex items-center gap-2 px-3.5 py-1.5 text-xs lg:text-sm font-medium rounded-lg transition-all ${
              this.activeTab === 'step2_monitor'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }">
              <span class="w-5 h-5 rounded-full ${this.activeTab === 'step2_monitor' ? 'bg-white/20' : 'bg-slate-700'} text-xs flex items-center justify-center font-bold">2</span>
              <span>Live Face Monitoring</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
            <button id="nav-step3" class="step-tab-btn flex items-center gap-2 px-3.5 py-1.5 text-xs lg:text-sm font-medium rounded-lg transition-all ${
              this.activeTab === 'step3_logs'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }">
              <span class="w-5 h-5 rounded-full ${this.activeTab === 'step3_logs' ? 'bg-white/20' : 'bg-slate-700'} text-xs flex items-center justify-center font-bold">3</span>
              <span>Attendance Logs</span>
              <span id="log-count-badge" class="px-1.5 py-0.2 text-[10px] bg-slate-900/60 rounded-full text-slate-300 font-semibold">${
                storageService.getAttendanceRecords().length
              }</span>
            </button>
          </nav>

          <!-- System Status indicators -->
          <div class="flex items-center gap-2.5">
            <div id="camera-status-pill" class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-slate-800/80 border-slate-700 text-slate-300">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span id="camera-status-text">Camera Active</span>
            </div>
            <button id="btn-toggle-sound" title="Mute/Unmute Audio Chimes" class="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
              </svg>
            </button>
          </div>
        </header>

        <!-- Main Body Content -->
        <main class="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">
          <!-- STEP 1: REGISTRATION & ROSTER -->
          <div id="tab-content-step1" class="${this.activeTab === 'step1_register' ? 'block' : 'hidden'} space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <!-- Left: 10-Shot Registration Card -->
              <div class="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
                <div class="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h2 class="text-base font-semibold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Student Registration & Auto-Fetch
                  </h2>
                  <span class="text-xs text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-mono">10 Photos Auto</span>
                </div>

                <div class="space-y-4">
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Student ID / Roll Number *</label>
                    <input id="input-rollno" type="text" placeholder="e.g. 101" class="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Student Full Name *</label>
                    <input id="input-name" type="text" placeholder="e.g. Maya Patel" class="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Department / Course (Optional)</label>
                    <input id="input-dept" type="text" placeholder="e.g. Computer Science" class="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition-all" />
                  </div>
                </div>

                <!-- Registration Camera View -->
                <div class="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center">
                  <video id="reg-video" class="w-full h-full object-cover transform -scale-x-100"></video>
                  <!-- Face guide reticle -->
                  <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div class="w-40 h-52 border-2 border-dashed border-cyan-400/50 rounded-full flex items-center justify-center animate-pulse">
                      <span class="text-[11px] text-cyan-300/80 bg-slate-950/80 px-2 py-0.5 rounded-full font-mono">Center Face</span>
                    </div>
                  </div>
                  <!-- Capture Flash Overlay -->
                  <div id="capture-flash" class="absolute inset-0 bg-white opacity-0 pointer-events-none transition-opacity duration-150"></div>
                </div>

                <!-- Capture Progress Bar -->
                <div id="capture-progress-container" class="space-y-2 ${this.capturedPhotos.length > 0 ? 'block' : 'hidden'}">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-slate-400">Autofetch Progress:</span>
                    <span id="capture-progress-text" class="font-mono text-cyan-400 font-bold">${this.capturedPhotos.length}/10 Photos Captured</span>
                  </div>
                  <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div id="capture-progress-bar" class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-300" style="width: ${
                      (this.capturedPhotos.length / 10) * 100
                    }%"></div>
                  </div>
                </div>

                <!-- Captured Photos Reel -->
                <div class="space-y-1.5">
                  <div class="text-xs text-slate-400 flex items-center justify-between">
                    <span>Captured Face Crops (10-shots):</span>
                    <span id="reel-count" class="text-slate-500">${this.capturedPhotos.length} / 10</span>
                  </div>
                  <div id="photo-reel" class="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    ${this.renderPhotoThumbnails()}
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex flex-col gap-2 pt-2">
                  <button id="btn-start-autofetch" class="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    <span>Auto-Fetch 10 Face Photos Live</span>
                  </button>

                  <button id="btn-save-student" class="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed" ${
                    this.capturedPhotos.length < 10 ? 'disabled' : ''
                  }>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span>Train & Register Student in Log</span>
                  </button>
                </div>
              </div>

              <!-- Right: Registered Students Roster (Direct View & Delete) -->
              <div class="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div>
                    <h2 class="text-base font-semibold text-white flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Registered Students Log
                    </h2>
                    <p class="text-xs text-slate-400">Database of registered faces (You can remove them directly)</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span id="registered-badge" class="px-2.5 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ${storageService.getStudents().length} Registered
                    </span>
                    <button id="btn-clear-all-students" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-950/60 hover:bg-red-800 text-red-300 hover:text-white border border-red-800/60 transition-colors flex items-center gap-1.5" title="Clear All Registered Students">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                      <span>Clear All</span>
                    </button>
                  </div>
                </div>

                <!-- Search Input -->
                <div class="relative">
                  <input id="input-search-students" type="text" placeholder="Search registered students by Roll No or Name..." class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-500" />
                  <svg class="w-4 h-4 text-slate-500 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>

                <!-- Students Table / List Container -->
                <div id="registered-students-list" class="flex-1 overflow-y-auto max-h-[520px] space-y-2.5 pr-1">
                  ${this.renderRegisteredStudentsList()}
                </div>
              </div>
            </div>
          </div>

          <!-- STEP 2: LIVE FACE MONITORING (AUTO MATCH & 5s REFRESH) -->
          <div id="tab-content-step2" class="${this.activeTab === 'step2_monitor' ? 'block' : 'hidden'} space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <!-- Camera Monitoring Video & Overlay -->
              <div class="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div class="flex items-center gap-3">
                    <div class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
                    <div>
                      <h2 class="text-base font-semibold text-white">Live Automated Face Monitoring</h2>
                      <p class="text-xs text-slate-400">
                        <span class="text-emerald-400 font-semibold">● Green Mark</span>: Face in Log (Present) | 
                        <span class="text-red-400 font-semibold">● Red Mark</span>: Unknown Face (Absent)
                      </p>
                    </div>
                  </div>

                  <!-- 5-Second Cycle Countdown Badge -->
                  <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-xl">
                      <span class="text-xs text-slate-400">Next Auto-Log:</span>
                      <span id="cycle-countdown-badge" class="font-mono text-xs font-bold text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800">5.0s</span>
                    </div>
                    <button id="btn-toggle-cycle" class="px-3 py-1 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                      Pause 5s Cycle
                    </button>
                  </div>
                </div>

                <!-- 5-Second Cycle Progress Bar -->
                <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800/80">
                  <div id="cycle-progress-bar" class="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 transition-all duration-100" style="width: 100%"></div>
                </div>

                <!-- Video Viewport with Live Canvas Overlay -->
                <div class="relative bg-black rounded-2xl overflow-hidden aspect-video border border-slate-800 flex items-center justify-center shadow-inner">
                  <video id="mon-video" class="w-full h-full object-cover transform -scale-x-100"></video>
                  <canvas id="mon-canvas" class="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"></canvas>

                  <!-- Status Overlay Banner (Top-Left of camera) -->
                  <div id="detection-banner" class="absolute top-4 left-4 z-20 pointer-events-none transition-all duration-200">
                    <div class="px-4 py-2 rounded-xl backdrop-blur-md bg-slate-900/90 border border-slate-700 text-slate-300 text-xs flex items-center gap-2 shadow-xl font-medium">
                      <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                      <span>Scanning camera for face...</span>
                    </div>
                  </div>

                  <!-- 5-Second Pulse Effect on cycle refresh -->
                  <div id="cycle-flash" class="absolute inset-0 bg-cyan-400/15 opacity-0 pointer-events-none transition-opacity duration-300"></div>

                  <!-- Scan Line Sweep Effect -->
                  <div id="scanner-laser" class="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70 pointer-events-none animate-scan"></div>
                </div>

                <!-- Real-time Status Caption below video -->
                <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <div class="flex items-center gap-2">
                    <span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Continuous live detection active</span>
                  </div>
                  <span class="text-slate-500 font-mono">Refreshes attendance checkpoint every 5 seconds</span>
                </div>
              </div>

              <!-- Right: Live Face Verification Telemetry -->
              <div class="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 flex flex-col">
                <div class="pb-3 border-b border-slate-800">
                  <h3 class="text-base font-semibold text-white flex items-center gap-2">
                    <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                    Face Verification Status
                  </h3>
                  <p class="text-xs text-slate-400">Real-time match against registered log</p>
                </div>

                <!-- Active Matched Face Card -->
                <div id="active-detection-card" class="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4 flex-1 flex flex-col justify-center items-center text-center">
                  <div class="w-24 h-24 rounded-2xl border-2 border-slate-800 bg-slate-900 flex items-center justify-center overflow-hidden shadow-lg relative">
                    <div id="active-face-placeholder" class="text-slate-600">
                      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                    </div>
                    <img id="active-face-img" class="w-full h-full object-cover hidden" alt="Detected Face Crop" />
                  </div>

                  <div>
                    <div id="active-detection-status" class="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 mb-1 border border-slate-700">
                      Awaiting Face
                    </div>
                    <h4 id="active-detection-name" class="text-lg font-bold text-white mt-1">Scanning...</h4>
                    <p id="active-detection-roll" class="text-xs text-slate-400">Roll No: --</p>
                  </div>

                  <!-- Confidence Bar -->
                  <div class="w-full space-y-1.5 pt-2 border-t border-slate-900">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-slate-400">Match Confidence:</span>
                      <span id="active-detection-confidence" class="font-mono font-bold text-slate-300">0%</span>
                    </div>
                    <div class="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
                      <div id="active-detection-conf-bar" class="bg-slate-700 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
                    </div>
                  </div>

                  <!-- 5s Auto-Log status notice -->
                  <div id="active-confirmation-tag" class="text-xs text-slate-400 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 w-full">
                    <span>Logs to Step 3 automatically every 5s</span>
                  </div>
                </div>

                <!-- Recent Live Logged Hits -->
                <div class="space-y-2">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Recent Stream Detections:</h4>
                  <div id="recent-hits-list" class="space-y-1.5 text-xs max-h-36 overflow-y-auto pr-1">
                    <div class="text-slate-500 italic py-1">Awaiting first scan...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- STEP 3: ATTENDANCE LOGS & REPORTS -->
          <div id="tab-content-step3" class="${this.activeTab === 'step3_logs' ? 'block' : 'hidden'} space-y-6">
            <!-- Metrics Summary Cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-1">
                <span class="text-xs text-slate-400 uppercase font-semibold">Registered Students</span>
                <div class="text-2xl font-bold text-white flex items-baseline gap-2">
                  <span id="metric-total-registered">${storageService.getMetrics().totalRegistered}</span>
                  <span class="text-xs font-normal text-slate-400">In Log</span>
                </div>
              </div>

              <div class="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 shadow-lg space-y-1 bg-emerald-950/20">
                <span class="text-xs text-emerald-400 uppercase font-semibold">Marked Present</span>
                <div class="text-2xl font-bold text-emerald-400 flex items-baseline gap-2">
                  <span id="metric-total-present">${storageService.getMetrics().presentCount}</span>
                  <span class="text-xs font-normal text-emerald-400/70">Verified</span>
                </div>
              </div>

              <div class="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 shadow-lg space-y-1 bg-amber-950/20">
                <span class="text-xs text-amber-400 uppercase font-semibold">Absent Today</span>
                <div class="text-2xl font-bold text-amber-400 flex items-baseline gap-2">
                  <span id="metric-total-absent">${storageService.getMetrics().absentCount}</span>
                  <span class="text-xs font-normal text-amber-400/70">Not marked</span>
                </div>
              </div>

              <div class="bg-slate-900/80 border border-red-500/30 rounded-2xl p-4 shadow-lg space-y-1 bg-red-950/20">
                <span class="text-xs text-red-400 uppercase font-semibold">Unknown Alerts</span>
                <div class="text-2xl font-bold text-red-400 flex items-baseline gap-2">
                  <span id="metric-total-unknown">${storageService.getMetrics().unknownAttempts}</span>
                  <span class="text-xs font-normal text-red-400/70">Unknown Faces</span>
                </div>
              </div>
            </div>

            <!-- Table Container & Action Header -->
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
                <div class="flex items-center gap-3">
                  <h2 class="text-base font-semibold text-white">Daily Biometric Attendance Register</h2>
                  <!-- Filter Pill Buttons -->
                  <div class="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button class="filter-btn px-2.5 py-1 rounded-lg transition-colors ${this.logFilter === 'all' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}" data-filter="all">All</button>
                    <button class="filter-btn px-2.5 py-1 rounded-lg transition-colors ${this.logFilter === 'Present' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}" data-filter="Present">Present (Green)</button>
                    <button class="filter-btn px-2.5 py-1 rounded-lg transition-colors ${this.logFilter === 'Unknown Attempt' ? 'bg-red-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}" data-filter="Unknown Attempt">Unknown (Red)</button>
                  </div>
                </div>

                <!-- Export & Clear Buttons (Matching Colab: df.to_excel, df.to_csv) -->
                <div class="flex items-center gap-2">
                  <button id="btn-export-csv" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors">
                    <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span>Download CSV</span>
                  </button>

                  <button id="btn-export-excel" class="px-3.5 py-1.5 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 text-xs font-semibold flex items-center gap-1.5 transition-colors">
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span>Export Excel Report</span>
                  </button>

                  <button id="btn-clear-logs" class="p-2 rounded-xl bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 transition-colors" title="Clear All Attendance Logs">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Records Table -->
              <div class="overflow-x-auto rounded-xl border border-slate-800">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-950/90 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th class="py-3 px-4">Student</th>
                      <th class="py-3 px-4">Roll No / ID</th>
                      <th class="py-3 px-4">Date</th>
                      <th class="py-3 px-4">Time</th>
                      <th class="py-3 px-4">Status</th>
                      <th class="py-3 px-4">Confidence</th>
                      <th class="py-3 px-4">Verifications</th>
                    </tr>
                  </thead>
                  <tbody id="attendance-table-body" class="divide-y divide-slate-800/60">
                    ${this.renderAttendanceTableRows()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;

    // Cache element references
    this.regVideoEl = document.getElementById('reg-video') as HTMLVideoElement;
    this.monVideoEl = document.getElementById('mon-video') as HTMLVideoElement;
    this.monCanvasEl = document.getElementById('mon-canvas') as HTMLCanvasElement;
    if (this.monCanvasEl) {
      this.monOverlayCtx = this.monCanvasEl.getContext('2d');
    }
  }

  private renderPhotoThumbnails(): string {
    if (this.capturedPhotos.length === 0) {
      return `
        <div class="w-full py-4 text-center text-xs text-slate-600 italic">
          No photos fetched yet. Enter Roll No and Name, then click "Auto-Fetch 10 Face Photos Live".
        </div>
      `;
    }

    return this.capturedPhotos
      .map(
        (url, idx) => `
        <div class="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-cyan-500/40 bg-slate-950 shadow-md group">
          <img src="${url}" class="w-full h-full object-cover" alt="Photo ${idx + 1}" />
          <span class="absolute bottom-0.5 right-0.5 text-[9px] font-mono font-bold bg-slate-950/80 text-cyan-300 px-1 rounded">#${
            idx + 1
          }</span>
        </div>
      `
      )
      .join('');
  }

  private renderRegisteredStudentsList(): string {
    const students = storageService.getStudents();
    if (students.length === 0) {
      return `
        <div class="text-center py-12 text-slate-500 text-xs italic">
          No students registered yet. Register a student on the left.
        </div>
      `;
    }

    return students
      .map((student) => {
        const thumb =
          student.photos && student.photos.length > 0
            ? student.photos[0]
            : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="%2364748b"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E';

        return `
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all group">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 flex-shrink-0">
                <img src="${thumb}" class="w-full h-full object-cover" alt="${student.name}" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-white text-xs lg:text-sm">${student.name}</h4>
                  <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/80">ID: ${
                    student.rollNo
                  }</span>
                </div>
                <p class="text-[11px] text-slate-400">${student.department || 'General Class'} • ${
                  student.photos ? student.photos.length : 0
                } photos trained</p>
              </div>
            </div>

            <!-- Remove Button (Direct removal as requested) -->
            <button type="button" class="btn-remove-student px-3 py-1.5 rounded-xl bg-red-950/50 hover:bg-red-600 text-red-300 hover:text-white border border-red-800/60 hover:border-red-500 transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer" data-id="${student.id}" data-roll="${student.rollNo}" title="Delete this student">
              <svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
              <span class="pointer-events-none">Delete</span>
            </button>
          </div>
        `;
      })
      .join('');
  }

  private renderAttendanceTableRows(): string {
    let records = storageService.getAttendanceRecords();

    if (this.logFilter !== 'all') {
      records = records.filter((r) => r.status === this.logFilter);
    }

    if (records.length === 0) {
      return `
        <tr>
          <td colspan="7" class="text-center py-8 text-slate-500 italic">No attendance records found for this filter.</td>
        </tr>
      `;
    }

    return records
      .map((r) => {
        const isPresent = r.status === 'Present';
        const badgeClass = isPresent
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-red-500/10 text-red-400 border-red-500/20';

        const thumb =
          r.snapshotUrl ||
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%2364748b"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E';

        return `
          <tr class="hover:bg-slate-900/60 transition-colors">
            <td class="py-3 px-4">
              <div class="flex items-center gap-2.5">
                <img src="${thumb}" class="w-8 h-8 rounded-lg object-cover border border-slate-700 bg-slate-900" alt="${
                  r.name
                }" />
                <span class="font-semibold text-white">${r.name}</span>
              </div>
            </td>
            <td class="py-3 px-4 font-mono text-cyan-400 font-bold">${r.rollNo}</td>
            <td class="py-3 px-4 text-slate-300 font-mono">${r.date}</td>
            <td class="py-3 px-4 text-slate-300 font-mono">${r.time}</td>
            <td class="py-3 px-4">
              <span class="px-2.5 py-1 rounded-full font-bold uppercase text-[10px] border ${badgeClass}">
                ${r.status}
              </span>
            </td>
            <td class="py-3 px-4 font-mono font-semibold ${
              r.confidence > 70 ? 'text-emerald-400' : 'text-slate-400'
            }">${r.confidence}%</td>
            <td class="py-3 px-4 text-slate-300 font-mono">${r.scanCount}x</td>
          </tr>
        `;
      })
      .join('');
  }

  private bindGlobalEvents() {
    // Navigation Step buttons
    document.getElementById('nav-step1')?.addEventListener('click', () => this.switchTab('step1_register'));
    document.getElementById('nav-step2')?.addEventListener('click', () => this.switchTab('step2_monitor'));
    document.getElementById('nav-step3')?.addEventListener('click', () => this.switchTab('step3_logs'));

    // Step 1: Autofetch 10 photos button
    document.getElementById('btn-start-autofetch')?.addEventListener('click', () => this.handleStartAutofetch());

    // Step 1: Save & Train student
    document.getElementById('btn-save-student')?.addEventListener('click', () => this.handleSaveStudent());

    // Step 1: Search registered students
    document.getElementById('input-search-students')?.addEventListener('input', (e) => {
      const term = (e.target as HTMLInputElement).value.toLowerCase();
      const listEl = document.getElementById('registered-students-list');
      if (!listEl) return;
      const students = storageService.getStudents().filter(
        (s) => s.name.toLowerCase().includes(term) || s.rollNo.toLowerCase().includes(term)
      );
      if (students.length === 0) {
        listEl.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs italic">No matching students found</div>`;
      } else {
        listEl.innerHTML = students
          .map(
            (student) => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 transition-all">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl overflow-hidden border border-slate-700 bg-slate-900">
                  <img src="${student.photos[0] || ''}" class="w-full h-full object-cover" alt="${student.name}" />
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-bold text-white text-xs">${student.name}</h4>
                    <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">ID: ${student.rollNo}</span>
                  </div>
                  <p class="text-[11px] text-slate-400">${student.department || 'General'}</p>
                </div>
              </div>
              <button class="btn-remove-student px-2.5 py-1 rounded-lg bg-red-950/60 hover:bg-red-700 text-red-300 hover:text-white border border-red-800/60 flex items-center gap-1 text-xs cursor-pointer" data-id="${student.id}" data-roll="${student.rollNo}" title="Delete this student">
                <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                <span class="pointer-events-none">Delete</span>
              </button>
            </div>
          `
          )
          .join('');
      }
    });

    // Step 1: Clear All Students button
    document.getElementById('btn-clear-all-students')?.addEventListener('click', () => {
      const prevCount = storageService.getStudents().length;
      storageService.clearAllStudents();
      this.refreshStep1Roster();
      this.refreshStep3Logs();
      this.showInAppToast(`Cleared ${prevCount} registered student(s) from database`, 'info');
    });

    // Step 1: Remove student event delegation (direct removal without blocked window.confirm)
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const removeBtn = target.closest('.btn-remove-student') as HTMLElement;
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const id = removeBtn.getAttribute('data-id') || '';
        const roll = removeBtn.getAttribute('data-roll') || '';
        const identifier = id || roll;
        if (identifier) {
          const student = storageService.getStudentByRollNo(roll) || storageService.getStudents().find(s => s.id === id);
          const studentName = student?.name || roll || 'Student';
          storageService.removeStudent(identifier);
          if (roll && roll !== identifier) storageService.removeStudent(roll);
          this.refreshStep1Roster();
          this.refreshStep3Logs();
          this.showInAppToast(`Deleted "${studentName}" (ID: ${roll || id}) from registered database`, 'info');
        }
      }
    });

    // Step 2: 5-Second cycle toggle button
    document.getElementById('btn-toggle-cycle')?.addEventListener('click', () => {
      this.isMonitoring = !this.isMonitoring;
      const btn = document.getElementById('btn-toggle-cycle');
      if (btn) {
        btn.textContent = this.isMonitoring ? 'Pause 5s Cycle' : 'Resume 5s Cycle';
        btn.className = this.isMonitoring
          ? 'px-3 py-1 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors'
          : 'px-3 py-1 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-colors';
      }
    });

    // Step 3: Export buttons
    document.getElementById('btn-export-csv')?.addEventListener('click', () => storageService.downloadCSVFile());
    document.getElementById('btn-export-excel')?.addEventListener('click', () => storageService.downloadExcelFile());

    // Step 3: Clear records (direct removal without window.confirm)
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      storageService.clearAttendanceRecords();
      this.refreshStep3Logs();
      this.showInAppToast('Attendance logs have been cleared', 'info');
    });

    // Step 3: Filter buttons
    this.container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const filter = (e.currentTarget as HTMLElement).getAttribute('data-filter') as any;
        this.logFilter = filter;
        this.refreshStep3Logs();
      });
    });
  }

  private switchTab(tab: ActiveTab) {
    this.activeTab = tab;

    // Toggle tab UI contents
    ['step1', 'step2', 'step3'].forEach((s) => {
      const el = document.getElementById(`tab-content-${s}`);
      if (el) {
        if (`${s}` === tab.replace('_register', '').replace('_monitor', '').replace('_logs', '')) {
          el.classList.remove('hidden');
          el.classList.add('block');
        } else {
          el.classList.remove('block');
          el.classList.add('hidden');
        }
      }
    });

    // Update tab button active styles
    document.querySelectorAll('.step-tab-btn').forEach((btn) => {
      btn.classList.remove('bg-cyan-600', 'bg-emerald-600', 'bg-blue-600', 'text-white', 'shadow-md');
      btn.classList.add('text-slate-300');
    });

    if (tab === 'step1_register') {
      const b = document.getElementById('nav-step1');
      b?.classList.add('bg-cyan-600', 'text-white', 'shadow-md', 'shadow-cyan-600/30');
      b?.classList.remove('text-slate-300');
    } else if (tab === 'step2_monitor') {
      const b = document.getElementById('nav-step2');
      b?.classList.add('bg-emerald-600', 'text-white', 'shadow-md', 'shadow-emerald-600/30');
      b?.classList.remove('text-slate-300');
    } else if (tab === 'step3_logs') {
      const b = document.getElementById('nav-step3');
      b?.classList.add('bg-blue-600', 'text-white', 'shadow-md', 'shadow-blue-600/30');
      b?.classList.remove('text-slate-300');
      this.refreshStep3Logs();
    }

    this.startCameraForCurrentTab();
  }

  private async startCameraForCurrentTab() {
    const statusText = document.getElementById('camera-status-text');

    if (this.activeTab === 'step1_register') {
      this.stopContinuousMonitoring();
      if (this.regVideoEl) {
        await cameraService.startCamera(this.regVideoEl);
        if (statusText) statusText.textContent = cameraService.isSimulated() ? 'Simulator Camera' : 'Camera Active';
      }
    } else if (this.activeTab === 'step2_monitor') {
      if (this.monVideoEl) {
        await cameraService.startCamera(this.monVideoEl);
        if (statusText) statusText.textContent = cameraService.isSimulated() ? 'Simulator Camera' : 'Camera Active';
      }
      this.startContinuousMonitoring();
    } else {
      this.stopContinuousMonitoring();
    }
  }

  // --- Step 1 Handlers ---
  private async handleStartAutofetch() {
    const rollNoInput = document.getElementById('input-rollno') as HTMLInputElement;
    const nameInput = document.getElementById('input-name') as HTMLInputElement;

    const rollNo = rollNoInput?.value.trim();
    const name = nameInput?.value.trim();

    if (!rollNo || !name) {
      this.showInAppToast('Please enter both Student ID / Roll Number and Full Name before starting auto-fetch.', 'error');
      return;
    }

    if (this.isCapturing) return;
    this.isCapturing = true;

    const btn = document.getElementById('btn-start-autofetch') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="animate-spin">⏳</span> Capturing 10 Face Snapshots...`;
    }

    const progressContainer = document.getElementById('capture-progress-container');
    const progressBar = document.getElementById('capture-progress-bar');
    const progressText = document.getElementById('capture-progress-text');
    const flashEl = document.getElementById('capture-flash');
    const reelEl = document.getElementById('photo-reel');

    if (progressContainer) progressContainer.classList.remove('hidden');
    this.capturedPhotos = [];
    this.capturedDescriptors = [];

    try {
      const result = await cameraService.runAutoFetchSequence((progress: CaptureProgress) => {
        // Flash screen
        if (flashEl) {
          flashEl.style.opacity = '0.7';
          setTimeout(() => {
            flashEl.style.opacity = '0';
          }, 80);
        }

        // Update progress
        if (progressBar) progressBar.style.width = `${(progress.current / progress.total) * 100}%`;
        if (progressText) progressText.textContent = `${progress.current}/10 Photos Captured`;

        // Update thumbnail reel live
        if (progress.latestPhotoUrl) {
          this.capturedPhotos.push(progress.latestPhotoUrl);
          if (reelEl) reelEl.innerHTML = this.renderPhotoThumbnails();
          const countEl = document.getElementById('reel-count');
          if (countEl) countEl.textContent = `${this.capturedPhotos.length} / 10`;
        }
      });

      this.capturedPhotos = result.photos;
      this.capturedDescriptors = result.descriptors;

      // Enable Save button
      const saveBtn = document.getElementById('btn-save-student') as HTMLButtonElement;
      if (saveBtn) saveBtn.disabled = false;
      this.showInAppToast('10 Face Photos captured successfully! Ready to train & save.', 'success');
    } catch (e) {
      console.error('Autofetch error:', e);
      this.showInAppToast('Could not complete autofetch sequence. Please ensure camera access.', 'error');
    } finally {
      this.isCapturing = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          <span>Re-capture 10 Photos</span>
        `;
      }
    }
  }

  private handleSaveStudent() {
    const rollNoInput = document.getElementById('input-rollno') as HTMLInputElement;
    const nameInput = document.getElementById('input-name') as HTMLInputElement;
    const deptInput = document.getElementById('input-dept') as HTMLInputElement;

    const rollNo = rollNoInput?.value.trim();
    const name = nameInput?.value.trim();
    const dept = deptInput?.value.trim() || 'General';

    if (!rollNo || !name) {
      this.showInAppToast('Please provide Student ID and Name.', 'error');
      return;
    }

    if (this.capturedPhotos.length < 10) {
      this.showInAppToast('Please complete the 10-photo auto-fetch sequence first.', 'error');
      return;
    }

    const newStudent: Student = {
      id: `student_${rollNo}_${Date.now()}`,
      rollNo,
      name,
      department: dept,
      registeredAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
      photos: [...this.capturedPhotos],
      faceDescriptors: [...this.capturedDescriptors],
    };

    storageService.addStudent(newStudent);
    audioService.playSuccessComplete();

    this.showInAppToast(`Student "${name}" (ID: ${rollNo}) successfully registered with 10 face descriptors! Switch to Step 2 for Live Face Monitoring.`, 'success');

    // Reset inputs
    rollNoInput.value = '';
    nameInput.value = '';
    deptInput.value = '';
    this.capturedPhotos = [];
    this.capturedDescriptors = [];

    const saveBtn = document.getElementById('btn-save-student') as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = true;

    this.refreshStep1Roster();
    this.refreshStep3Logs();
  }

  private refreshStep1Roster() {
    const listEl = document.getElementById('registered-students-list');
    if (listEl) listEl.innerHTML = this.renderRegisteredStudentsList();

    const badge = document.getElementById('registered-badge');
    if (badge) badge.textContent = `${storageService.getStudents().length} Registered`;
  }

  // --- Step 2: Continuous Real-Time Tracking & 5-Second Attendance Logging ---
  private startContinuousMonitoring() {
    this.isMonitoring = true;
    this.cycleCountdown = SCAN_INTERVAL_SECONDS;

    this.stopContinuousMonitoring();

    // 1. High-frequency live frame tracking (every 180ms) for smooth real-time bounding box & recognition
    this.liveTrackingTimer = window.setInterval(() => {
      if (!this.isMonitoring || this.activeTab !== 'step2_monitor') return;
      this.processLiveFrame(false); // live display update
    }, 180);

    // 2. 5-Second Cycle Countdown & Official Logging Checkpoint
    this.countdownTimer = window.setInterval(() => {
      if (!this.isMonitoring || this.activeTab !== 'step2_monitor') return;
      this.cycleCountdown = Math.max(0, this.cycleCountdown - 0.1);

      const badge = document.getElementById('cycle-countdown-badge');
      if (badge) badge.textContent = `${this.cycleCountdown.toFixed(1)}s`;

      const bar = document.getElementById('cycle-progress-bar');
      if (bar) bar.style.width = `${(this.cycleCountdown / SCAN_INTERVAL_SECONDS) * 100}%`;

      // 5-second interval elapsed: perform official attendance log checkpoint
      if (this.cycleCountdown <= 0) {
        this.cycleCountdown = SCAN_INTERVAL_SECONDS;
        this.processLiveFrame(true); // official 5-second log checkpoint
      }
    }, 100);
  }

  private stopContinuousMonitoring() {
    if (this.liveTrackingTimer) {
      clearInterval(this.liveTrackingTimer);
      this.liveTrackingTimer = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Processes a live camera frame:
   * 1. Detects face in video
   * 2. Extracts feature descriptor
   * 3. Matches against registered students in log:
   *    - MATCH -> GREEN COLOR MARK: "Present - Detected: [Name] (ID: [Roll])"
   *    - NO MATCH -> RED COLOR MARK: "Unknown Face - Absent"
   * 4. If isCheckpoint === true (every 5 seconds): commits entry to Attendance Log (Step 3) and plays chime
   */
  private async processLiveFrame(isCheckpoint = false) {
    if (!this.monVideoEl || this.monVideoEl.readyState < 2) return;

    const frame = cameraService.captureCurrentFrame();
    const students = storageService.getStudents();

    // Detect faces
    const faces = await faceRecognitionService.detectFaces(frame.canvas);

    if (faces.length === 0) {
      this.clearMonitoringCanvas();
      this.updateBanner('Scanning for face in camera view...', 'idle');
      return;
    }

    const faceBox = faces[0];

    // Extract face crop and compute feature descriptor
    const crop = faceRecognitionService.extractFaceCrop(frame.canvas, faceBox, 128);
    const descriptor = faceRecognitionService.computeFaceDescriptor(crop.canvas);

    // Match against registered students
    const match = faceRecognitionService.recognizeFace(descriptor, students);

    let status: 'Present' | 'Unknown Face';
    let bannerText = '';

    if (match.isKnown && match.matchedStudent) {
      // MATCH FOUND IN LOG: GREEN COLOR MARK!
      status = 'Present';
      bannerText = `Present - Detected: ${match.matchedStudent.name} (ID: ${match.matchedStudent.rollNo})`;

      if (isCheckpoint) {
        // Log to official attendance register
        storageService.markAttendance(match.matchedStudent, 'Present', match.confidence, crop.dataUrl);
        audioService.playRecognizedChime();
        this.triggerCheckpointPulse();
        this.appendRecentStreamHit({
          box: faceBox,
          rollNo: match.matchedStudent.rollNo,
          name: match.matchedStudent.name,
          confidence: match.confidence,
          isKnown: true,
          isConfirmed: true,
          status: 'Present',
          timestamp: Date.now(),
          snapshotUrl: crop.dataUrl,
        });
        this.updateLogBadge();
      }
    } else {
      // NOT IN LOG: RED COLOR MARK!
      status = 'Unknown Face';
      bannerText = 'Unknown Face - Absent';

      if (isCheckpoint) {
        // Log unknown attempt
        storageService.markAttendance(null, 'Unknown Attempt', match.confidence, crop.dataUrl);
        audioService.playUnknownAlert();
        this.triggerCheckpointPulse();
        this.appendRecentStreamHit({
          box: faceBox,
          name: 'Unknown Face',
          confidence: match.confidence,
          isKnown: false,
          isConfirmed: false,
          status: 'Unknown Face',
          timestamp: Date.now(),
          snapshotUrl: crop.dataUrl,
        });
        this.updateLogBadge();
      }
    }

    const result: DetectionResult = {
      box: faceBox,
      rollNo: match.matchedStudent?.rollNo,
      name: match.matchedStudent?.name || 'Unknown Face',
      confidence: match.confidence,
      isKnown: match.isKnown,
      isConfirmed: match.isKnown,
      status,
      timestamp: Date.now(),
      snapshotUrl: crop.dataUrl,
    };

    this.latestDetection = result;

    // Draw live bounding box on canvas overlay (Green if known, Red if unknown)
    this.drawBoundingBoxOnCanvas(frame.canvas.width, frame.canvas.height, result);

    // Update real-time telemetry card
    this.updateDetectionTelemetry(result);
    this.updateBanner(bannerText, status);
  }

  private triggerCheckpointPulse() {
    const flashEl = document.getElementById('cycle-flash');
    if (flashEl) {
      flashEl.style.opacity = '1';
      setTimeout(() => {
        flashEl.style.opacity = '0';
      }, 250);
    }
  }

  /**
   * Draws the exact bounding box requested:
   * GREEN COLOR MARK if match found in log
   * RED COLOR MARK if unknown face / absent
   */
  private drawBoundingBoxOnCanvas(vidW: number, vidH: number, res: DetectionResult) {
    if (!this.monCanvasEl || !this.monOverlayCtx) return;

    this.monCanvasEl.width = vidW;
    this.monCanvasEl.height = vidH;
    const ctx = this.monOverlayCtx;

    ctx.clearRect(0, 0, vidW, vidH);

    const { box, isKnown, name, rollNo, confidence } = res;

    // GREEN for Present (Face in Log) | RED for Unknown Face (Absent)
    const strokeColor = isKnown ? '#22c55e' : '#ef4444';
    const fillColor = isKnown ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)';
    const tagText = isKnown
      ? `PRESENT: ${name} (ID: ${rollNo || ''}) • ${confidence}%`
      : `UNKNOWN FACE - ABSENT`;

    // 1. Glowing Bounding Box
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;

    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, 12);
    ctx.fill();
    ctx.stroke();

    // 2. Corner Bracket Highlights
    const bLen = Math.min(24, box.width * 0.22);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';

    // Top-left
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + bLen);
    ctx.lineTo(box.x, box.y);
    ctx.lineTo(box.x + bLen, box.y);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(box.x + box.width - bLen, box.y);
    ctx.lineTo(box.x + box.width, box.y);
    ctx.lineTo(box.x + box.width, box.y + bLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + box.height - bLen);
    ctx.lineTo(box.x, box.y + box.height);
    ctx.lineTo(box.x + bLen, box.y + box.height);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(box.x + box.width - bLen, box.y + box.height);
    ctx.lineTo(box.x + box.width, box.y + box.height);
    ctx.lineTo(box.x + box.width, box.y + box.height - bLen);
    ctx.stroke();

    // 3. Label tag above box
    ctx.font = 'bold 13px "Google Sans", sans-serif';
    const textWidth = ctx.measureText(tagText).width;
    const tagPadding = 10;
    const tagH = 26;
    const tagX = Math.max(10, box.x);
    const tagY = Math.max(tagH + 8, box.y - 8);

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY - tagH, textWidth + tagPadding * 2, tagH, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(tagText, tagX + tagPadding, tagY - 8);
  }

  private clearMonitoringCanvas() {
    if (this.monCanvasEl && this.monOverlayCtx) {
      this.monOverlayCtx.clearRect(0, 0, this.monCanvasEl.width, this.monCanvasEl.height);
    }
  }

  private updateBanner(text: string, status: 'Present' | 'Unknown Face' | 'idle') {
    const banner = document.getElementById('detection-banner');
    if (!banner) return;

    let dotColor = 'bg-cyan-400';
    let borderClass = 'border-slate-700 bg-slate-900/90 text-slate-300';

    if (status === 'Present') {
      dotColor = 'bg-emerald-400';
      borderClass = 'border-emerald-500/50 bg-emerald-950/90 text-emerald-200';
    } else if (status === 'Unknown Face') {
      dotColor = 'bg-red-400';
      borderClass = 'border-red-500/50 bg-red-950/90 text-red-200';
    }

    banner.innerHTML = `
      <div class="px-4 py-2 rounded-xl backdrop-blur-md border ${borderClass} text-xs flex items-center gap-2 shadow-xl font-medium">
        <span class="w-2.5 h-2.5 rounded-full ${dotColor} animate-pulse"></span>
        <span>${text}</span>
      </div>
    `;
  }

  private updateDetectionTelemetry(res: DetectionResult) {
    const statusEl = document.getElementById('active-detection-status');
    const nameEl = document.getElementById('active-detection-name');
    const rollEl = document.getElementById('active-detection-roll');
    const confEl = document.getElementById('active-detection-confidence');
    const confBar = document.getElementById('active-detection-conf-bar');
    const confTag = document.getElementById('active-confirmation-tag');
    const imgEl = document.getElementById('active-face-img') as HTMLImageElement;
    const phEl = document.getElementById('active-face-placeholder');

    if (nameEl) nameEl.textContent = res.name;
    if (rollEl) rollEl.textContent = res.rollNo ? `Roll No: ${res.rollNo}` : 'Unregistered Visitor';

    if (confEl) confEl.textContent = `${res.confidence}%`;
    if (confBar) {
      confBar.style.width = `${res.confidence}%`;
      confBar.className = res.isKnown
        ? 'h-full rounded-full transition-all duration-200 bg-emerald-500'
        : 'h-full rounded-full transition-all duration-200 bg-red-500';
    }

    if (statusEl) {
      if (res.isKnown) {
        statusEl.textContent = 'PRESENT (MATCH IN LOG)';
        statusEl.className =
          'inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      } else {
        statusEl.textContent = 'UNKNOWN FACE - ABSENT';
        statusEl.className =
          'inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30';
      }
    }

    if (confTag) {
      confTag.textContent = res.isKnown
        ? `Status: Verified Present (${res.name})`
        : `Status: Face not in registered log (Absent)`;
    }

    if (res.snapshotUrl && imgEl) {
      imgEl.src = res.snapshotUrl;
      imgEl.classList.remove('hidden');
      if (phEl) phEl.classList.add('hidden');
    }
  }

  private appendRecentStreamHit(res: DetectionResult) {
    const listEl = document.getElementById('recent-hits-list');
    if (!listEl) return;

    // Clear initial placeholder if present
    if (listEl.querySelector('div')?.classList.contains('italic')) {
      listEl.innerHTML = '';
    }

    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const isPresent = res.isKnown;
    const colorClass = isPresent ? 'text-emerald-400' : 'text-red-400';

    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80';
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full ${isPresent ? 'bg-emerald-400' : 'bg-red-400'}"></span>
        <span class="font-semibold text-white">${res.name}</span>
      </div>
      <div class="flex items-center gap-2 font-mono text-[11px]">
        <span class="${colorClass}">${isPresent ? 'Present' : 'Unknown'}</span>
        <span class="text-slate-500">${time}</span>
      </div>
    `;

    listEl.prepend(item);
    if (listEl.children.length > 5) {
      listEl.removeChild(listEl.lastChild!);
    }
  }

  // --- Step 3 Logs Refresh ---
  private refreshStep3Logs() {
    const tbody = document.getElementById('attendance-table-body');
    if (tbody) tbody.innerHTML = this.renderAttendanceTableRows();

    const metrics = storageService.getMetrics();
    const totReg = document.getElementById('metric-total-registered');
    const totPres = document.getElementById('metric-total-present');
    const totAbs = document.getElementById('metric-total-absent');
    const totUnk = document.getElementById('metric-total-unknown');

    if (totReg) totReg.textContent = `${metrics.totalRegistered}`;
    if (totPres) totPres.textContent = `${metrics.presentCount}`;
    if (totAbs) totAbs.textContent = `${metrics.absentCount}`;
    if (totUnk) totUnk.textContent = `${metrics.unknownAttempts}`;

    this.updateLogBadge();
  }

  private updateLogBadge() {
    const badge = document.getElementById('log-count-badge');
    if (badge) badge.textContent = `${storageService.getAttendanceRecords().length}`;
  }

  /**
   * Non-blocking in-app notification toasts (avoids blocked window.alert/window.confirm in iframes)
   */
  private showInAppToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none max-w-md w-full px-4';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl border backdrop-blur-md shadow-2xl text-xs font-medium transition-all duration-300 transform translate-y-2 opacity-0';

    let iconSvg = '';
    if (type === 'success') {
      toast.classList.add('bg-emerald-950/95', 'border-emerald-500/60', 'text-emerald-100');
      iconSvg = `<svg class="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    } else if (type === 'error') {
      toast.classList.add('bg-red-950/95', 'border-red-500/60', 'text-red-100');
      iconSvg = `<svg class="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    } else {
      toast.classList.add('bg-slate-900/95', 'border-cyan-500/50', 'text-slate-100');
      iconSvg = `<svg class="w-5 h-5 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="flex-1 leading-snug">${message}</span>
      <button class="text-slate-400 hover:text-white p-1 rounded transition-colors" title="Dismiss">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    closeBtn?.addEventListener('click', () => {
      toast.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });

    // Auto dismiss after 3.5s
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => toast.remove(), 250);
      }
    }, 3500);
  }
}
