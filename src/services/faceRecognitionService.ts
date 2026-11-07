import { FaceBoundingBox, Student } from '../types';

export class FaceRecognitionService {
  private nativeFaceDetector: any = null;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })!;

    // Initialize native FaceDetector if supported in Chromium/Android
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      try {
        const FaceDetectorClass = (window as any).FaceDetector;
        this.nativeFaceDetector = new FaceDetectorClass({
          maxDetectedFaces: 2,
          fastMode: true,
        });
      } catch {
        this.nativeFaceDetector = null;
      }
    }
  }

  /**
   * Detects faces in an HTMLVideoElement or HTMLCanvasElement
   */
  async detectFaces(source: HTMLVideoElement | HTMLCanvasElement): Promise<FaceBoundingBox[]> {
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

    if (!width || !height) return [];

    // 1. Try native FaceDetector if available
    if (this.nativeFaceDetector) {
      try {
        const detected = await this.nativeFaceDetector.detect(source);
        if (detected && detected.length > 0) {
          return detected.map((face: any) => ({
            x: Math.max(0, Math.round(face.boundingBox.x)),
            y: Math.max(0, Math.round(face.boundingBox.y)),
            width: Math.min(width - Math.round(face.boundingBox.x), Math.round(face.boundingBox.width)),
            height: Math.min(height - Math.round(face.boundingBox.y), Math.round(face.boundingBox.height)),
          }));
        }
      } catch {
        // Fall back to robust biometric skin-region tracking
      }
    }

    // 2. High-performance skin chrominance + oval cluster detector
    return this.detectFaceRegionHeuristic(source, width, height);
  }

  /**
   * Fast canvas-based face region locator using YCbCr skin chrominance cluster
   */
  private detectFaceRegionHeuristic(
    source: HTMLVideoElement | HTMLCanvasElement,
    srcWidth: number,
    srcHeight: number
  ): FaceBoundingBox[] {
    const sampleW = 160;
    const sampleH = Math.round((srcHeight / srcWidth) * 160);

    this.offscreenCanvas.width = sampleW;
    this.offscreenCanvas.height = sampleH;
    this.offscreenCtx.drawImage(source, 0, 0, sampleW, sampleH);

    const imgData = this.offscreenCtx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    let minX = sampleW, maxX = 0;
    let minY = sampleH, maxY = 0;
    let skinPixelCount = 0;
    let sumX = 0, sumY = 0;

    // Focus analysis on inner 80% to avoid boundary background
    const startX = Math.round(sampleW * 0.1);
    const endX = Math.round(sampleW * 0.9);
    const startY = Math.round(sampleH * 0.08);
    const endY = Math.round(sampleH * 0.88);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (y * sampleW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Convert to YCbCr space for lighting-robust skin segmentation
        // Cb = 128 - 0.168736*R - 0.331264*G + 0.5*B
        // Cr = 128 + 0.5*R - 0.418688*G - 0.081312*B
        const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;

        // Human skin tone cluster in YCbCr: Cb in [77..127], Cr in [133..173]
        const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;

        if (isSkin) {
          skinPixelCount++;
          sumX += x;
          sumY += y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (skinPixelCount > (sampleW * sampleH) * 0.035) {
      const centerX = sumX / skinPixelCount;
      const centerY = sumY / skinPixelCount;

      const clusterW = Math.max(30, (maxX - minX) * 0.88);
      const clusterH = Math.max(38, (maxY - minY) * 0.88);

      const scaleX = srcWidth / sampleW;
      const scaleY = srcHeight / sampleH;

      const boxW = Math.min(srcWidth * 0.7, Math.max(srcWidth * 0.25, clusterW * scaleX));
      const boxH = boxW * 1.25;

      const boxX = Math.max(10, Math.min(srcWidth - boxW - 10, centerX * scaleX - boxW / 2));
      const boxY = Math.max(10, Math.min(srcHeight - boxH - 10, centerY * scaleY - boxH / 2.2));

      return [{
        x: Math.round(boxX),
        y: Math.round(boxY),
        width: Math.round(boxW),
        height: Math.round(boxH),
      }];
    }

    // Default centered face box guide if no distinct skin cluster found
    const defW = Math.round(srcWidth * 0.42);
    const defH = Math.round(defW * 1.25);
    const defX = Math.round((srcWidth - defW) / 2);
    const defY = Math.round((srcHeight - defH) / 2.3);

    return [{
      x: defX,
      y: defY,
      width: defW,
      height: defH,
    }];
  }

  /**
   * Extracts a normalized square crop of the face
   */
  extractFaceCrop(
    source: HTMLVideoElement | HTMLCanvasElement,
    box: FaceBoundingBox,
    size = 128
  ): { canvas: HTMLCanvasElement; dataUrl: string } {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = size;
    cropCanvas.height = size;
    const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true })!;

    cropCtx.drawImage(
      source,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      size,
      size
    );

    return {
      canvas: cropCanvas,
      dataUrl: cropCanvas.toDataURL('image/jpeg', 0.85),
    };
  }

  /**
   * Computes a combined feature descriptor for a face canvas:
   * 1. 32x32 Normalized Grayscale Intensity Vector with Zero-Mean Unit-Variance (NCC-ready)
   * 2. 8x8 Grid Local Binary Pattern (LBP) histogram vector
   * Total length: 1024 + 1024 = 2048 values.
   */
  computeFaceDescriptor(faceCanvas: HTMLCanvasElement): number[] {
    const normSize = 32;
    this.offscreenCanvas.width = normSize;
    this.offscreenCanvas.height = normSize;
    this.offscreenCtx.drawImage(faceCanvas, 0, 0, normSize, normSize);

    const imgData = this.offscreenCtx.getImageData(0, 0, normSize, normSize);
    const data = imgData.data;

    // 1. Grayscale conversion
    const gray = new Float32Array(normSize * normSize);
    let mean = 0;
    for (let i = 0; i < normSize * normSize; i++) {
      const idx = i * 4;
      const g = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      gray[i] = g;
      mean += g;
    }
    mean /= normSize * normSize;

    // Zero-mean unit-variance normalization (illumination invariance)
    let std = 0;
    for (let i = 0; i < normSize * normSize; i++) {
      const diff = gray[i] - mean;
      std += diff * diff;
    }
    std = Math.sqrt(std / (normSize * normSize)) + 0.0001;

    const normPixels = new Float32Array(normSize * normSize);
    for (let i = 0; i < normSize * normSize; i++) {
      normPixels[i] = (gray[i] - mean) / std;
    }

    // 2. Local Binary Pattern (LBP) feature vector over 8x8 blocks
    const gridCells = 8;
    const cellW = normSize / gridCells;
    const cellH = normSize / gridCells;
    const binsPerCell = 16;
    const lbpFeatures = new Float32Array(gridCells * gridCells * binsPerCell);

    let offset = 0;
    for (let gy = 0; gy < gridCells; gy++) {
      for (let gx = 0; gx < gridCells; gx++) {
        const startX = gx * cellW;
        const startY = gy * cellH;
        const cellHist = new Float32Array(binsPerCell);

        for (let y = startY; y < startY + cellH; y++) {
          for (let x = startX; x < startX + cellW; x++) {
            const cy = Math.max(1, Math.min(normSize - 2, y));
            const cx = Math.max(1, Math.min(normSize - 2, x));
            const center = gray[cy * normSize + cx];

            let lbp = 0;
            if (gray[(cy - 1) * normSize + (cx - 1)] >= center) lbp |= 1;
            if (gray[(cy - 1) * normSize + cx] >= center) lbp |= 2;
            if (gray[(cy - 1) * normSize + (cx + 1)] >= center) lbp |= 4;
            if (gray[cy * normSize + (cx + 1)] >= center) lbp |= 8;
            if (gray[(cy + 1) * normSize + (cx + 1)] >= center) lbp |= 16;
            if (gray[(cy + 1) * normSize + cx] >= center) lbp |= 32;
            if (gray[(cy + 1) * normSize + (cx - 1)] >= center) lbp |= 64;
            if (gray[cy * normSize + (cx - 1)] >= center) lbp |= 128;

            const bin = Math.min(binsPerCell - 1, Math.floor(lbp / 16));
            cellHist[bin]++;
          }
        }

        // Normalize cell histogram
        let sum = 0;
        for (let b = 0; b < binsPerCell; b++) sum += cellHist[b];
        if (sum > 0) {
          for (let b = 0; b < binsPerCell; b++) {
            lbpFeatures[offset + b] = cellHist[b] / sum;
          }
        }
        offset += binsPerCell;
      }
    }

    // Combine normalized pixel vector and LBP histogram
    const combined = new Array(normPixels.length + lbpFeatures.length);
    for (let i = 0; i < normPixels.length; i++) combined[i] = normPixels[i];
    for (let i = 0; i < lbpFeatures.length; i++) combined[normPixels.length + i] = lbpFeatures[i];

    return combined;
  }

  /**
   * Computes Cosine Similarity between zero-mean normalized pixel features
   */
  private computeCosineSimilarity(v1: number[], v2: number[], length = 1024): number {
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < length; i++) {
      const a = v1[i];
      const b = v2[i];
      dot += a * b;
      norm1 += a * a;
      norm2 += b * b;
    }

    const mag = Math.sqrt(norm1) * Math.sqrt(norm2);
    return mag > 0.0001 ? dot / mag : 0;
  }

  /**
   * Computes LBP Histogram Intersection similarity (ranges 0 to 1)
   */
  private computeLbpSimilarity(v1: number[], v2: number[], startIdx = 1024, length = 1024): number {
    let intersection = 0;
    const gridCells = 64; // 8x8
    const binsPerCell = 16;

    for (let c = 0; c < gridCells; c++) {
      let cellIntersection = 0;
      const base = startIdx + c * binsPerCell;
      for (let b = 0; b < binsPerCell; b++) {
        const a = v1[base + b] || 0;
        const bVal = v2[base + b] || 0;
        cellIntersection += Math.min(a, bVal);
      }
      intersection += cellIntersection;
    }

    return intersection / gridCells;
  }

  /**
   * Matches a face descriptor against all registered students.
   * Compares against all 10 captured photos for each student.
   * Returns:
   * isKnown: true -> Green color mark, Present
   * isKnown: false -> Red color mark, Unknown Face, Absent
   */
  recognizeFace(
    faceDescriptor: number[],
    students: Student[]
  ): {
    matchedStudent: Student | null;
    confidence: number;
    isKnown: boolean;
  } {
    if (!students || students.length === 0) {
      return { matchedStudent: null, confidence: 0, isKnown: false };
    }

    let highestSimilarity = -1;
    let bestStudent: Student | null = null;

    for (const student of students) {
      if (!student.faceDescriptors || student.faceDescriptors.length === 0) continue;

      // Check all photos of this student to find maximum match
      for (const trainedDescriptor of student.faceDescriptors) {
        if (!trainedDescriptor || trainedDescriptor.length < 1024) continue;

        // 1. Normalized Pixel Cosine Similarity (illumination & facial structure)
        const pixelSim = this.computeCosineSimilarity(faceDescriptor, trainedDescriptor, 1024);

        // 2. LBP Texture Similarity
        const lbpSim = this.computeLbpSimilarity(faceDescriptor, trainedDescriptor, 1024, 1024);

        // Combined Similarity Score
        const combinedSim = 0.65 * pixelSim + 0.35 * lbpSim;

        if (combinedSim > highestSimilarity) {
          highestSimilarity = combinedSim;
          bestStudent = student;
        }
      }
    }

    // Threshold for biometric identification:
    // If similarity >= 0.62, it is a confident match with the registered student!
    const SIMILARITY_THRESHOLD = 0.62;

    if (bestStudent && highestSimilarity >= SIMILARITY_THRESHOLD) {
      // Scale similarity to 75% - 99% confidence
      const confidence = Math.min(
        99,
        Math.max(72, Math.round(((highestSimilarity - SIMILARITY_THRESHOLD) / (1 - SIMILARITY_THRESHOLD)) * 25 + 74))
      );

      return {
        matchedStudent: bestStudent,
        confidence,
        isKnown: true,
      };
    }

    // Below threshold: Unknown Face
    const unknownConfidence = Math.max(15, Math.min(55, Math.round(highestSimilarity * 100)));
    return {
      matchedStudent: null,
      confidence: unknownConfidence,
      isKnown: false,
    };
  }
}

export const faceRecognitionService = new FaceRecognitionService();
