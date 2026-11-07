import { Student } from './types';

export const APP_TITLE = 'AI Face Recognition & Attendance System';
export const SCAN_INTERVAL_SECONDS = 5;
export const REQUIRED_CONFIRMATIONS = 2; // Matches Python Colab code (recognized >= 2 times to mark Present)
export const MAX_CAPTURE_PHOTOS = 10; // Exactly 10 autofetch photos as requested

export const COLORS = {
  present: '#22c55e',      // Green color mark for Present / Known
  confirming: '#f59e0b',   // Amber / Orange for confirming
  absent: '#ef4444',       // Red color mark for Unknown / Absent
  cyan: '#06b6d4',
  cardBg: 'rgba(15, 23, 42, 0.85)',
  border: 'rgba(255, 255, 255, 0.12)',
};

// Seed sample students so the app is instantly functional and can be tested right away!
export const INITIAL_STUDENTS: Student[] = [
  {
    id: 'student_101',
    rollNo: '101',
    name: 'Alex Rivera',
    department: 'Computer Science',
    registeredAt: '2026-11-07 08:30:00',
    photos: [],
    faceDescriptors: []
  },
  {
    id: 'student_102',
    rollNo: '102',
    name: 'Priya Sharma',
    department: 'Artificial Intelligence',
    registeredAt: '2026-11-07 09:15:00',
    photos: [],
    faceDescriptors: []
  }
];
