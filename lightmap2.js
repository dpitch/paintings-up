// lightmap2.js — Polynomial surface fitting (least squares) for lightmap generation

/**
 * Build a lightmap using a 2D polynomial surface fitted to border samples.
 *
 * The polynomial models the illumination field as:
 *   degree 2: f(x,y) = a0 + a1*x + a2*y + a3*x² + a4*y² + a5*x*y
 *   degree 3: f(x,y) = ... + a6*x³ + a7*y³ + a8*x²y + a9*xy²
 *
 * Coefficients are found by ordinary least squares on the border sample points.
 *
 * @param {Array} points - border sample points from sampleBorders() (with x,y in 0–1 and L,a,b)
 * @param {number} w - image width
 * @param {number} h - image height
 * @param {number} degree - polynomial degree (2 or 3, default 2)
 * @returns {{ L: Float32Array, a: Float32Array, b: Float32Array }}
 */
function buildLightmapPoly(points, w, h, degree) {
  if (degree === undefined) degree = 2;
  const size = w * h;
  const mapL = new Float32Array(size);
  const mapA = new Float32Array(size);
  const mapB = new Float32Array(size);

  // Build the polynomial basis for a given (x, y) in 0–1
  function basis(x, y) {
    if (degree >= 3) {
      return [1, x, y, x * x, y * y, x * y, x * x * x, y * y * y, x * x * y, x * y * y];
    }
    // degree 2
    return [1, x, y, x * x, y * y, x * y];
  }

  const n = points.length;
  const k = degree >= 3 ? 10 : 6; // number of coefficients

  // Build design matrix A (n x k) and target vectors
  const A = new Array(n);
  const bL = new Float64Array(n);
  const bA = new Float64Array(n);
  const bB = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    A[i] = basis(points[i].x, points[i].y);
    bL[i] = points[i].L;
    bA[i] = points[i].a;
    bB[i] = points[i].b;
  }

  // Compute A^T * A (k x k) and A^T * b (k x 1) for each channel
  const AtA = new Array(k);
  for (let i = 0; i < k; i++) {
    AtA[i] = new Float64Array(k);
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let r = 0; r < n; r++) {
        sum += A[r][i] * A[r][j];
      }
      AtA[i][j] = sum;
    }
  }

  function computeAtb(b) {
    const Atb = new Float64Array(k);
    for (let i = 0; i < k; i++) {
      let sum = 0;
      for (let r = 0; r < n; r++) {
        sum += A[r][i] * b[r];
      }
      Atb[i] = sum;
    }
    return Atb;
  }

  // Solve a symmetric positive-definite system via Cholesky decomposition
  function solveCholesky(M, rhs) {
    const sz = M.length;
    // Copy M to avoid mutation
    const L = new Array(sz);
    for (let i = 0; i < sz; i++) {
      L[i] = new Float64Array(sz);
    }

    // Cholesky: M = L * L^T
    for (let i = 0; i < sz; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = M[i][j];
        for (let p = 0; p < j; p++) {
          sum -= L[i][p] * L[j][p];
        }
        if (i === j) {
          if (sum <= 0) sum = 1e-10; // regularize
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }

    // Forward substitution: L * y = rhs
    const y = new Float64Array(sz);
    for (let i = 0; i < sz; i++) {
      let sum = rhs[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i][j] * y[j];
      }
      y[i] = sum / L[i][i];
    }

    // Back substitution: L^T * x = y
    const x = new Float64Array(sz);
    for (let i = sz - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < sz; j++) {
        sum -= L[j][i] * x[j];
      }
      x[i] = sum / L[i][i];
    }

    return x;
  }

  // Add Tikhonov regularization (small ridge) to prevent overfitting
  const lambda = 1e-6;
  for (let i = 0; i < k; i++) {
    AtA[i][i] += lambda;
  }

  // Solve for each channel
  const coeffL = solveCholesky(AtA, computeAtb(bL));
  const coeffA = solveCholesky(AtA, computeAtb(bA));
  const coeffB = solveCholesky(AtA, computeAtb(bB));

  // Evaluate polynomial at every pixel
  for (let py = 0; py < h; py++) {
    const ny = py / (h - 1);
    // Pre-compute y terms
    const ny2 = ny * ny;
    const ny3 = degree >= 3 ? ny * ny2 : 0;

    for (let px = 0; px < w; px++) {
      const nx = px / (w - 1);
      const i = py * w + px;
      const nx2 = nx * nx;
      const nxy = nx * ny;

      if (degree >= 3) {
        const nx3 = nx * nx2;
        const nx2y = nx2 * ny;
        const nxy2 = nx * ny2;
        mapL[i] = coeffL[0] + coeffL[1] * nx + coeffL[2] * ny + coeffL[3] * nx2 + coeffL[4] * ny2 + coeffL[5] * nxy + coeffL[6] * nx3 + coeffL[7] * ny3 + coeffL[8] * nx2y + coeffL[9] * nxy2;
        mapA[i] = coeffA[0] + coeffA[1] * nx + coeffA[2] * ny + coeffA[3] * nx2 + coeffA[4] * ny2 + coeffA[5] * nxy + coeffA[6] * nx3 + coeffA[7] * ny3 + coeffA[8] * nx2y + coeffA[9] * nxy2;
        mapB[i] = coeffB[0] + coeffB[1] * nx + coeffB[2] * ny + coeffB[3] * nx2 + coeffB[4] * ny2 + coeffB[5] * nxy + coeffB[6] * nx3 + coeffB[7] * ny3 + coeffB[8] * nx2y + coeffB[9] * nxy2;
      } else {
        mapL[i] = coeffL[0] + coeffL[1] * nx + coeffL[2] * ny + coeffL[3] * nx2 + coeffL[4] * ny2 + coeffL[5] * nxy;
        mapA[i] = coeffA[0] + coeffA[1] * nx + coeffA[2] * ny + coeffA[3] * nx2 + coeffA[4] * ny2 + coeffA[5] * nxy;
        mapB[i] = coeffB[0] + coeffB[1] * nx + coeffB[2] * ny + coeffB[3] * nx2 + coeffB[4] * ny2 + coeffB[5] * nxy;
      }
    }
  }

  return { L: mapL, a: mapA, b: mapB };
}
