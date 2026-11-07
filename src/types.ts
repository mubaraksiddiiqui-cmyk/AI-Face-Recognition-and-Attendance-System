export interface Student {
  id: string;
  rollNo: string;
  name: string;
  department?: string;
  registeredAt: string;
  photos: string[]; // Base64 image data URLs
  faceDescriptors: number[][]; // Extracted Local Binary Pattern (LBP) feature histograms
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Unknown Attempt';

export interface AttendanceRecord {
  id: string;
  rollNo: string;
  name: string;
  date: string;
  time: string;
  status: AttendanceStatus;
  confidence: number;
  snapshotUrl?: string;
  scanCount: number;
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  box: FaceBoundingBox;
  rollNo?: string;
  name: string;
  confidence: number;
  isKnown: boolean;
  isConfirmed: boolean;
  status: 'Present' | 'Confirming' | 'Unknown Face';
  timestamp: number;
  snapshotUrl?: string;
}

export interface CaptureProgress {
  current: number;
  total: number;
  isCapturing: boolean;
  latestPhotoUrl?: string;
}

export type ActiveTab = 'step1_register' | 'step2_monitor' | 'step3_logs';
