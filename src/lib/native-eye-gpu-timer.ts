/**
 * Asynchronous WebGL2 eye-pass GPU timer for development-only measurements.
 *
 * CPU submission latency is NOT GPU execution latency. Query-result polling
 * is non-blocking: never gl.finish(), wait for a fence, or gl.readPixels().
 * Unsupported devices simply report null; the makeup render must continue.
 *
 * Timer-query collection is explicitly opt-in, and never uploads a picture,
 * user's facial data, trace, or performance telemetry.
 */
export type NativeEyeGpuMode = "native" | "native-fast";
export type NativeEyeGpuMeasurement = {
  mode: NativeEyeGpuMode;
  gpuMs: number;
  /** GPU may complete an earlier frame after a newer frame was submitted. */
  sequence: number;
};

type WebGLTimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};
type PendingQuery = {
  query: WebGLQuery;
  mode: NativeEyeGpuMode;
  sequence: number;
};

export class NativeEyeGpuTimer {
  private readonly ext: WebGLTimerExtension | null;
  private active: PendingQuery | null = null;
  private pending: PendingQuery[] = [];
  private sequence = 0;
  private lost = false;
  private last: NativeEyeGpuMeasurement | null = null;
  static readonly MAX_PENDING = 3;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as WebGLTimerExtension | null;
  }

  get supported(): boolean { return this.ext !== null && !this.lost; }
  get pendingCount(): number { return this.pending.length; }
  get latest(): NativeEyeGpuMeasurement | null { return this.last; }

  /** Start one timestamp-free GPU elapsed query around a single eye pass. */
  begin(mode: NativeEyeGpuMode): boolean {
    this.poll();
    if (!this.ext || this.lost || this.active || this.pending.length >= NativeEyeGpuTimer.MAX_PENDING)
      return false;
    if (this.gl.isContextLost()) { this.dispose(); return false; }
    const query = this.gl.createQuery();
    if (!query) return false;
    try {
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
      this.active = { query, mode, sequence: ++this.sequence };
      return true;
    } catch {
      this.safeDelete(query);
      return false;
    }
  }

  /** Must be paired with begin() even when the paint pass throws. */
  end(): void {
    const active = this.active;
    if (!active || !this.ext) return;
    this.active = null;
    try {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(active);
    } catch {
      this.safeDelete(active.query);
    }
  }

  /**
   * Check completed queries only. QUERY_RESULT is NEVER read unless
   * QUERY_RESULT_AVAILABLE is true, and disjoint measurements are discarded.
   * Calling this does not wait for the GPU or force a pixel readback.
   */
  poll(): NativeEyeGpuMeasurement | null {
    if (!this.ext || this.lost) return this.last;
    try {
      if (this.gl.isContextLost()) { this.dispose(); return null; }
      if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        this.clearPending();
        this.last = null;
        return null;
      }
      // WebGL queries return completion status asynchronously. A bounded
      // loop avoids polling many queries from a real-time camera frame.
      for (let n = 0; n < NativeEyeGpuTimer.MAX_PENDING && this.pending.length; n++) {
        const next = this.pending[0];
        if (!this.gl.getQueryParameter(next.query, this.gl.QUERY_RESULT_AVAILABLE)) break;
        this.pending.shift();
        const ns = Number(this.gl.getQueryParameter(next.query, this.gl.QUERY_RESULT));
        this.safeDelete(next.query);
        if (Number.isFinite(ns) && ns >= 0 && ns < 1e12) {
          const candidate: NativeEyeGpuMeasurement = {
            mode: next.mode, gpuMs: ns / 1e6, sequence: next.sequence
          };
          if (!this.last || candidate.sequence > this.last.sequence) this.last = candidate;
        }
      }
    } catch {
      // A context reset or buggy driver must not affect the customer's output.
      this.clearPending();
      this.last = null;
    }
    return this.last;
  }

  /** A lost context invalidates all pending samples, not just the last one. */
  dispose(): void {
    this.lost = true;
    if (this.active && this.ext) {
      try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); } catch { /* lost */ }
      this.safeDelete(this.active.query);
      this.active = null;
    }
    this.clearPending();
    this.last = null;
  }

  private clearPending(): void {
    for (const entry of this.pending) this.safeDelete(entry.query);
    this.pending.length = 0;
  }

  private safeDelete(query: WebGLQuery) {
    try { this.gl.deleteQuery(query); } catch { /* context lost */ }
  }
}
