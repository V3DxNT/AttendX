export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <div
            className="skeleton skeleton-text"
            style={{
              width: i === 0 ? "140px" : i === 1 ? "60px" : i === 2 ? "110px" : "80px",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonStudentTable({ rows = 6 }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Biometric</th>
            <th>USN</th>
            <th>Full Name</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={idx}>
              <td>
                <div className="skeleton skeleton-avatar" />
              </td>
              <td>
                <div className="skeleton skeleton-text" style={{ width: "90px" }} />
              </td>
              <td>
                <div className="skeleton skeleton-text" style={{ width: "160px" }} />
              </td>
              <td style={{ textAlign: "right" }}>
                <div
                  className="skeleton skeleton-btn"
                  style={{ marginLeft: "auto", width: "32px", height: "32px" }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonSessionTable({ rows = 5 }) {
  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Code</th>
            <th>Timeline & Schedule</th>
            <th>Status</th>
            <th>Turnout</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={idx}>
              <td>
                <div className="skeleton skeleton-text" style={{ width: "180px", height: "16px" }} />
              </td>
              <td>
                <div className="skeleton skeleton-badge" />
              </td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div className="skeleton skeleton-text" style={{ width: "130px" }} />
                  <div className="skeleton skeleton-text" style={{ width: "90px", height: "10px" }} />
                </div>
              </td>
              <td>
                <div className="skeleton skeleton-badge" style={{ width: "54px" }} />
              </td>
              <td>
                <div className="skeleton skeleton-text" style={{ width: "60px", height: "18px" }} />
              </td>
              <td style={{ textAlign: "right" }}>
                <div style={{ display: "inline-flex", gap: "8px" }}>
                  <div className="skeleton skeleton-btn" style={{ width: "60px" }} />
                  <div className="skeleton skeleton-btn" style={{ width: "80px" }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonSessionDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
              <div className="skeleton" style={{ width: "240px", height: "28px", borderRadius: "6px" }} />
              <div className="skeleton skeleton-badge" style={{ width: "64px" }} />
            </div>
            <div style={{ display: "flex", gap: "16px" }}>
              <div className="skeleton skeleton-text" style={{ width: "120px" }} />
              <div className="skeleton skeleton-text" style={{ width: "100px" }} />
              <div className="skeleton skeleton-text" style={{ width: "100px" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <div className="skeleton skeleton-btn" style={{ width: "110px", height: "38px" }} />
            <div className="skeleton skeleton-btn" style={{ width: "100px", height: "38px" }} />
          </div>
        </div>

        <div style={{ marginTop: "28px", paddingTop: "20px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
            <div className="skeleton skeleton-text" style={{ width: "160px" }} />
            <div className="skeleton skeleton-text" style={{ width: "40px" }} />
          </div>
          <div className="skeleton" style={{ width: "100%", height: "8px", borderRadius: "9999px" }} />
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div className="skeleton" style={{ width: "180px", height: "20px", borderRadius: "4px" }} />
          <div className="skeleton" style={{ width: "220px", height: "36px", borderRadius: "6px" }} />
        </div>
        <SkeletonStudentTable rows={5} />
      </div>
    </div>
  );
}
