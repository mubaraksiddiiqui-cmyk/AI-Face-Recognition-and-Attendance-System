import { AttendanceRecord, Student } from '../types';
import { INITIAL_STUDENTS } from '../constants';
import { faceRecognitionService } from './faceRecognitionService';

const STUDENTS_STORAGE_KEY = 'ai_attendance_students_v1';
const ATTENDANCE_STORAGE_KEY = 'ai_attendance_records_v1';

class StorageService {
  private students: Student[] = [];
  private records: AttendanceRecord[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;

    try {
      const storedStudents = localStorage.getItem(STUDENTS_STORAGE_KEY);
      if (storedStudents) {
        this.students = JSON.parse(storedStudents);
      } else {
        // Seed initial students
        this.students = [...INITIAL_STUDENTS];
        this.generateSampleAvatarsAndDescriptors();
        this.saveStudents();
      }

      const storedRecords = localStorage.getItem(ATTENDANCE_STORAGE_KEY);
      if (storedRecords) {
        this.records = JSON.parse(storedRecords);
      } else {
        // Seed initial attendance entries for demonstration
        const today = new Date().toISOString().split('T')[0];
        this.records = [
          {
            id: 'rec_init_1',
            rollNo: '101',
            name: 'Alex Rivera',
            date: today,
            time: '08:45:12',
            status: 'Present',
            confidence: 94,
            scanCount: 3,
          },
          {
            id: 'rec_init_2',
            rollNo: 'unknown',
            name: 'Unknown Face',
            date: today,
            time: '09:02:44',
            status: 'Unknown Attempt',
            confidence: 34,
            scanCount: 1,
          }
        ];
        this.saveRecords();
      }
    } catch (e) {
      console.warn('Storage load error:', e);
      this.students = [...INITIAL_STUDENTS];
      this.records = [];
    }
  }

  /**
   * Generates sample avatar portraits and realistic synthetic LBP feature vectors for initial seeded students
   */
  private generateSampleAvatarsAndDescriptors() {
    this.students.forEach((student, index) => {
      if (!student.photos || student.photos.length === 0) {
        // Generate an illustrative avatar canvas
        const avatarCanvas = document.createElement('canvas');
        avatarCanvas.width = 200;
        avatarCanvas.height = 200;
        const ctx = avatarCanvas.getContext('2d')!;

        // Background
        ctx.fillStyle = index === 0 ? '#1e3a8a' : '#581c87';
        ctx.fillRect(0, 0, 200, 200);

        // Face oval
        ctx.fillStyle = index === 0 ? '#fed7aa' : '#fcd34d';
        ctx.beginPath();
        ctx.ellipse(100, 95, 45, 60, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(82, 85, 5, 0, Math.PI * 2);
        ctx.arc(118, 85, 5, 0, Math.PI * 2);
        ctx.fill();

        // Smile
        ctx.strokeStyle = '#9a3412';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(100, 115, 20, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();

        // Hair
        ctx.fillStyle = index === 0 ? '#334155' : '#1e1b4b';
        ctx.beginPath();
        ctx.arc(100, 80, 50, Math.PI, 0);
        ctx.fill();

        const dataUrl = avatarCanvas.toDataURL('image/jpeg', 0.85);
        student.photos = [dataUrl];

        // Generate descriptor
        const descriptor = faceRecognitionService.computeFaceDescriptor(avatarCanvas);
        student.faceDescriptors = [descriptor];
      }
    });
  }

  public getStudents(): Student[] {
    return [...this.students];
  }

  public getStudentByRollNo(rollNo: string): Student | undefined {
    return this.students.find((s) => s.rollNo.trim().toLowerCase() === rollNo.trim().toLowerCase());
  }

  public addStudent(student: Student) {
    // Remove if already exists with same rollNo
    this.students = this.students.filter((s) => s.rollNo !== student.rollNo);
    this.students.unshift(student);
    this.saveStudents();
  }

  public removeStudent(identifier: string) {
    const trimmed = identifier.trim().toLowerCase();
    this.students = this.students.filter(
      (s) => s.id !== identifier && s.rollNo.trim().toLowerCase() !== trimmed
    );
    this.saveStudents();
  }

  public clearAllStudents() {
    this.students = [];
    this.saveStudents();
  }

  private saveStudents() {
    try {
      localStorage.setItem(STUDENTS_STORAGE_KEY, JSON.stringify(this.students));
    } catch (e) {
      console.warn('Storage save students error:', e);
    }
  }

  public getAttendanceRecords(): AttendanceRecord[] {
    return [...this.records];
  }

  public markAttendance(
    student: Student | null,
    status: 'Present' | 'Unknown Attempt',
    confidence: number,
    snapshotUrl?: string
  ): AttendanceRecord {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Check if student already marked present today
    if (student && status === 'Present') {
      const existing = this.records.find(
        (r) => r.rollNo === student.rollNo && r.date === today && r.status === 'Present'
      );
      if (existing) {
        existing.scanCount += 1;
        existing.time = nowTime; // Update latest time seen
        if (confidence > existing.confidence) existing.confidence = confidence;
        if (snapshotUrl) existing.snapshotUrl = snapshotUrl;
        this.saveRecords();
        return existing;
      }
    }

    const newRecord: AttendanceRecord = {
      id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      rollNo: student ? student.rollNo : 'unknown',
      name: student ? student.name : 'Unknown Face',
      date: today,
      time: nowTime,
      status,
      confidence,
      snapshotUrl,
      scanCount: 1,
    };

    this.records.unshift(newRecord);
    this.saveRecords();
    return newRecord;
  }

  public clearAttendanceRecords() {
    this.records = [];
    this.saveRecords();
  }

  private saveRecords() {
    try {
      localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(this.records));
    } catch (e) {
      console.warn('Storage save records error:', e);
    }
  }

  /**
   * Generates summary metrics: Total Registered, Today's Present, Today's Absent, Unknown Attempts
   */
  public getMetrics() {
    const today = new Date().toISOString().split('T')[0];
    const totalRegistered = this.students.length;

    const todayPresentRollNos = new Set(
      this.records
        .filter((r) => r.date === today && r.status === 'Present')
        .map((r) => r.rollNo)
    );

    const presentCount = todayPresentRollNos.size;
    const absentCount = Math.max(0, totalRegistered - presentCount);

    const unknownAttempts = this.records.filter(
      (r) => r.date === today && r.status === 'Unknown Attempt'
    ).length;

    return {
      totalRegistered,
      presentCount,
      absentCount,
      unknownAttempts,
    };
  }

  /**
   * Exports attendance as CSV, matching user's Colab code
   */
  public exportToCSV(): string {
    const headers = ['Record ID', 'Student ID / Roll No', 'Name', 'Date', 'Time', 'Status', 'Confidence (%)', 'Scan Count'];
    const rows = this.records.map((r) => [
      `"${r.id}"`,
      `"${r.rollNo}"`,
      `"${r.name}"`,
      `"${r.date}"`,
      `"${r.time}"`,
      `"${r.status}"`,
      `"${r.confidence}%"`,
      `"${r.scanCount}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    return csvContent;
  }

  /**
   * Triggers download of CSV file
   */
  public downloadCSVFile() {
    const csv = this.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AI_Attendance_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Triggers download of formatted Excel report (HTML Spreadsheet format which Excel opens seamlessly)
   */
  public downloadExcelFile() {
    const today = new Date().toISOString().split('T')[0];
    const metrics = this.getMetrics();

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Attendance Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
        <style>
          th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 6px; border: 1px solid #cbd5e1; font-family: Arial, sans-serif; }
          .present { background-color: #dcfce7; color: #166534; font-weight: bold; }
          .unknown { background-color: #fee2e2; color: #991b1b; font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>AI Biometric Face Attendance Report</h2>
        <p>Generated on: ${new Date().toLocaleString()}</p>
        <p>Total Registered: ${metrics.totalRegistered} | Present: ${metrics.presentCount} | Absent: ${metrics.absentCount} | Unknown Scans: ${metrics.unknownAttempts}</p>
        <table border="1">
          <thead>
            <tr>
              <th>Roll Number</th>
              <th>Student Name</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Scans Verified</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const r of this.records) {
      const cls = r.status === 'Present' ? 'present' : 'unknown';
      html += `
        <tr>
          <td>${r.rollNo}</td>
          <td>${r.name}</td>
          <td>${r.date}</td>
          <td>${r.time}</td>
          <td class="${cls}">${r.status}</td>
          <td>${r.confidence}%</td>
          <td>${r.scanCount}</td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AI_Attendance_Report_${today}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const storageService = new StorageService();
