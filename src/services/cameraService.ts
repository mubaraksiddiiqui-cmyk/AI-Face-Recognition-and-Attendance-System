import { CaptureProgress, FaceBoundingBox } from '../types';
import { audioService } from './audioService';
import { faceRecognitionService } from './faceRecognitionService';

export class CameraService {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isStreaming = false;
  private simulated = false;
  private simulationInterval: number | null = null;
  private simCanvas: HTMLCanvasElement | null = null;

  getVideo(): HTMLVideoElement | null {
    return this.videoElement;
  }

  isLive(): boolean {
    return this.isStreaming;
  }

  isSimulated(): boolean {
    return this.simulated;
  }

  /**
   * Initializes the camera feed on a provided video element
   */
  async startCamera(videoEl: HTMLVideoElement): Promise<boolean> {
    this.videoElement = videoEl;

    // Check if we already have an active stream
    if (this.stream && this.stream.active) {
      videoEl.srcObject = this.stream;
      await videoEl.play().catch(() => {});
      this.isStreaming = true;
      return true;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported in this browser environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      this.stream = stream;
      this.videoElement.srcObject = stream;
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.muted = true;
      await this.videoElement.play();
      this.isStreaming = true;
      this.simulated = false;
      return true;
    } catch (err) {
      console.warn('Physical camera unavailable, falling back to interactive simulator camera:', err);
      this.startSimulatedCamera(videoEl);
      return false;
    }
  }

  /**
   * Fallback simulator camera that draws an animated interactive face portrait
   * so the user can test the entire workflow even without a physical webcam
   */
  private startSimulatedCamera(videoEl: HTMLVideoElement) {
    this.simCanvas = document.createElement('canvas');
    this.simCanvas.width = 640;
    this.simCanvas.height = 480;
    const ctx = this.simCanvas.getContext('2d')!;

    let phase = 0;
    const drawSimFrame = () => {
      phase += 0.05;
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 640, 480);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 480);
        ctx.stroke();
      }
      for (let y = 0; y < 480; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }

      // Animated face simulation (slight natural head movement)
      const headX = 320 + Math.sin(phase * 0.8) * 12;
      const headY = 220 + Math.cos(phase * 0.6) * 8;

      // Neck & Shoulders
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(headX - 110, headY + 110, 220, 160, 40);
      ctx.fill();

      // Face
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.ellipse(headX, headY, 80, 105, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(headX, headY - 25, 84, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#0f172a';
      const blink = Math.sin(phase * 2) > 0.96 ? 2 : 7;
      ctx.beginPath();
      ctx.ellipse(headX - 28, headY - 10, 6, blink, 0, 0, Math.PI * 2);
      ctx.ellipse(headX + 28, headY - 10, 6, blink, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(headX, headY - 5);
      ctx.lineTo(headX + 4, headY + 18);
      ctx.lineTo(headX - 6, headY + 22);
      ctx.stroke();

      // Smile
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(headX, headY + 38, 28, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();

      // Watermark
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '12px "Google Sans", sans-serif';
      ctx.fillText('CAMERA SIMULATION FEED (Webcam fallback)', 20, 30);
    };

    drawSimFrame();

    const stream = this.simCanvas.captureStream(30);
    this.stream = stream;
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
    this.isStreaming = true;
    this.simulated = true;

    this.simulationInterval = window.setInterval(drawSimFrame, 33);
  }

  stopCamera() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.isStreaming = false;
  }

  /**
   * Captures a single snapshot from the current video feed
   */
  captureCurrentFrame(): { canvas: HTMLCanvasElement; dataUrl: string } {
    const canvas = document.createElement('canvas');
    if (this.videoElement && this.videoElement.videoWidth > 0) {
      canvas.width = this.videoElement.videoWidth;
      canvas.height = this.videoElement.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(this.videoElement, 0, 0);
    } else {
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 640, 480);
    }
    return {
      canvas,
      dataUrl: canvas.toDataURL('image/jpeg', 0.85),
    };
  }

  /**
   * Performs the 10-shot continuous autofetch sequence as requested by user!
   * Automatically captures 10 distinct facial photos spaced by ~500ms,
   * extracts 200x200 normalized face crops, and returns photos + descriptors.
   */
  async runAutoFetchSequence(
    onProgress: (progress: CaptureProgress) => void
  ): Promise<{ photos: string[]; descriptors: number[][] }> {
    const totalPhotos = 10;
    const capturedPhotos: string[] = [];
    const descriptors: number[][] = [];

    for (let i = 1; i <= totalPhotos; i++) {
      // 1. Grab current video frame
      const frame = this.captureCurrentFrame();

      // 2. Detect face in frame
      const faces = await faceRecognitionService.detectFaces(frame.canvas);
      let faceBox: FaceBoundingBox;
      if (faces.length > 0) {
        faceBox = faces[0];
      } else {
        // Center crop if detection is indeterminate
        faceBox = {
          x: Math.round(frame.canvas.width * 0.25),
          y: Math.round(frame.canvas.height * 0.15),
          width: Math.round(frame.canvas.width * 0.5),
          height: Math.round(frame.canvas.height * 0.65),
        };
      }

      // 3. Extract 128x128 crop and feature descriptor
      const crop = faceRecognitionService.extractFaceCrop(frame.canvas, faceBox, 128);
      const descriptor = faceRecognitionService.computeFaceDescriptor(crop.canvas);

      capturedPhotos.push(crop.dataUrl);
      descriptors.push(descriptor);

      // Play audio shutter
      audioService.playShutterSound();

      // Emit progress
      onProgress({
        current: i,
        total: totalPhotos,
        isCapturing: true,
        latestPhotoUrl: crop.dataUrl,
      });

      // Pause briefly between snapshots to capture diverse angles/expressions
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    audioService.playSuccessComplete();

    onProgress({
      current: totalPhotos,
      total: totalPhotos,
      isCapturing: false,
      latestPhotoUrl: capturedPhotos[capturedPhotos.length - 1],
    });

    return {
      photos: capturedPhotos,
      descriptors,
    };
  }
}

export const cameraService = new CameraService();
