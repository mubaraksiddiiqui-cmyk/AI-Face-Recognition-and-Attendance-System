import * as THREE from 'three';
import * as xb from 'xrblocks';

export class SpatialBiometricTerminal extends xb.Script {
  private scannerGroup = new THREE.Group();
  private outerRing?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private innerRing?: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private coreSphere?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private targetReticle?: THREE.LineSegments;
  private statusCard?: xb.UICard;
  private statusText?: xb.UIText;
  private idText?: xb.UIText;
  private time = 0;

  init() {
    // Add holographic biometric scanner in 3D world space
    this.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 3));
    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2);
    dirLight.position.set(0, 3, 1);
    this.add(dirLight);

    this.buildScannerMesh();
    this.buildSpatialUI();

    this.scannerGroup.position.set(0, xb.user.height - 0.2, -1.4);
    this.add(this.scannerGroup);
  }

  private buildScannerMesh() {
    // Holographic Pedestal / Base ring
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.05, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.2,
      metalness: 0.8,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.5;
    this.scannerGroup.add(baseMesh);

    // Glowing Holographic Rings
    const ringGeo = new THREE.RingGeometry(0.18, 0.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.outerRing = new THREE.Mesh(ringGeo, ringMat);
    this.outerRing.position.set(0, 0, 0);
    this.scannerGroup.add(this.outerRing);

    const innerGeo = new THREE.RingGeometry(0.12, 0.13, 32);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.innerRing = new THREE.Mesh(innerGeo, innerMat);
    this.innerRing.position.set(0, 0, 0.01);
    this.scannerGroup.add(this.innerRing);

    // Biometric Core orb
    const sphereGeo = new THREE.SphereGeometry(0.06, 24, 24);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.1,
    });
    this.coreSphere = new THREE.Mesh(sphereGeo, sphereMat);
    this.scannerGroup.add(this.coreSphere);

    // Crosshair Reticle lines
    const reticleGeo = new THREE.BufferGeometry();
    const reticleVerts = new Float32Array([
      -0.24, 0, 0, -0.19, 0, 0,
      0.19, 0, 0, 0.24, 0, 0,
      0, -0.24, 0, 0, -0.19, 0,
      0, 0.19, 0, 0, 0.24, 0,
    ]);
    reticleGeo.setAttribute('position', new THREE.BufferAttribute(reticleVerts, 3));
    const reticleMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 });
    this.targetReticle = new THREE.LineSegments(reticleGeo, reticleMat);
    this.scannerGroup.add(this.targetReticle);
  }

  private buildSpatialUI() {
    this.statusText = new xb.UIText({
      text: 'AI BIOMETRIC ATTENDANCE',
      style: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#38bdf8',
      },
    });

    this.idText = new xb.UIText({
      text: 'SYSTEM LIVE • 5s AUTO CYCLE',
      style: {
        fontSize: 14,
        textAlign: 'center',
        opacity: 0.8,
        color: '#22c55e',
      },
    });

    this.statusCard = new xb.UICard({
      size: { width: 0.5, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        backgroundColor: '#0f172aee',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#1e293b',
      },
      children: [
        this.statusText,
        this.idText,
        new xb.UIText({
          text: 'Use 2D Overlay for 10-shot registration and export tools. Monitoring running in 3D.',
          style: {
            fontSize: 11,
            textAlign: 'center',
            opacity: 0.6,
          },
        }),
      ],
    });

    this.statusCard.position.set(0, 0.35, 0);
    this.scannerGroup.add(this.statusCard);
  }

  update() {
    this.time += 0.02;

    if (this.outerRing) {
      this.outerRing.rotation.z += 0.015;
    }
    if (this.innerRing) {
      this.innerRing.rotation.z -= 0.025;
    }
    if (this.coreSphere) {
      this.coreSphere.position.y = Math.sin(this.time * 2) * 0.02;
    }
  }

  setVisualStatus(status: 'Present' | 'Unknown Face' | 'Idle', name?: string, roll?: string) {
    if (!this.innerRing || !this.statusText || !this.idText) return;

    if (status === 'Present') {
      this.innerRing.material.color.setHex(0x22c55e);
      this.statusText.text = `VERIFIED: ${name || 'STUDENT'}`;
      this.idText.text = `ID: ${roll || 'PRESENT'} • MARKED`;
      this.idText.style.color = '#22c55e';
    } else if (status === 'Unknown Face') {
      this.innerRing.material.color.setHex(0xef4444);
      this.statusText.text = 'UNKNOWN FACE';
      this.idText.text = 'NOT REGISTERED • ABSENT';
      this.idText.style.color = '#ef4444';
    } else {
      this.innerRing.material.color.setHex(0x06b6d4);
      this.statusText.text = 'AI BIOMETRIC ATTENDANCE';
      this.idText.text = 'SYSTEM LIVE • 5s AUTO CYCLE';
      this.idText.style.color = '#38bdf8';
    }
  }

  dispose() {
    this.outerRing?.geometry.dispose();
    this.outerRing?.material.dispose();
    this.innerRing?.geometry.dispose();
    this.innerRing?.material.dispose();
    this.coreSphere?.geometry.dispose();
    this.coreSphere?.material.dispose();
  }
}
