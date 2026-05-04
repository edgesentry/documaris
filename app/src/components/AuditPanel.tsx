import type { AuditRecord } from "../lib/pipeline.js";

interface Props {
  record: AuditRecord;
  payloadHash: string;
  durationMs: number;
}

export function AuditPanel({ record, payloadHash, durationMs }: Props) {
  const ts = new Date(record.timestamp_ms).toISOString();

  return (
    <div className="audit-panel">
      <div className="audit-title">
        <span className="lock-icon">🔒</span> Tamper-proof AuditRecord sealed
      </div>
      <table className="audit-table">
        <tbody>
          <tr>
            <td>BLAKE3 hash</td>
            <td>
              <code className="hash">{payloadHash.slice(0, 16)}…</code>
            </td>
          </tr>
          <tr>
            <td>Sealed at</td>
            <td>
              <code>{ts}</code>
            </td>
          </tr>
          <tr>
            <td>Device</td>
            <td>
              <code>{record.device_id}</code>
            </td>
          </tr>
          <tr>
            <td>Sequence</td>
            <td>
              <code>{record.sequence}</code>
            </td>
          </tr>
          <tr>
            <td>Generated in</td>
            <td>
              <code>{durationMs} ms</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="audit-note">
        Ed25519 signature covers hash + chain link. Neither documaris nor the
        agent can alter this record after generation.
      </p>
    </div>
  );
}
