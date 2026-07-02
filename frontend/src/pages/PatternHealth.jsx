import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import toast, { Toaster } from 'react-hot-toast';
import CursorBackground from '../components/CursorBackground';
import LoadingScreen from '../components/LoadingScreen';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a topic name to a LeetCode tag slug.
 * e.g. "Dynamic Programming" → "dynamic-programming"
 * Falls back to the general problems list if the result is empty.
 */
function topicToLCSlug(topic) {
  const slug = topic
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return slug || null;
}

function getLCTagUrl(topic) {
  const slug = topicToLCSlug(topic);
  return slug
    ? `https://leetcode.com/tag/${slug}/`
    : 'https://leetcode.com/problemset/';
}

/**
 * Format a timestamp into a human-readable "N days ago / in N days" string.
 */
function relativeDate(isoString) {
  if (!isoString) return 'never';
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d - now;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays > 0) return `in ${diffDays}d`;
  return `${Math.abs(diffDays)}d ago`;
}

// ── PatternCard ───────────────────────────────────────────────────────────────

function PatternCard({ topic }) {
  const {
    topic: name,
    problem_count,
    last_practiced,
    is_overdue,
    overdue_days,
    next_due,
  } = topic;

  const lcUrl = getLCTagUrl(name);
  const isLowCoverage = problem_count === 1;

  // ── Status badge ──────────────────────────────────────────────
  let statusBadge;
  if (is_overdue) {
    statusBadge = (
      <span
        className="badge pattern-overdue"
        title={`Last practiced: ${last_practiced ? new Date(last_practiced).toLocaleDateString('en-GB') : 'never'}`}
      >
        Overdue ({overdue_days}d)
      </span>
    );
  } else if (next_due) {
    const dueInMs = new Date(next_due) - new Date();
    const dueInDays = Math.ceil(dueInMs / (1000 * 60 * 60 * 24));
    statusBadge = (
      <span className="badge pattern-healthy" title={`Due: ${new Date(next_due).toLocaleDateString('en-GB')}`}>
        {dueInDays <= 7 ? `Due in ${dueInDays}d` : 'Healthy ✓'}
      </span>
    );
  } else {
    statusBadge = <span className="badge pattern-healthy">Healthy ✓</span>;
  }

  return (
    <div className={`problem-card pattern-card ${is_overdue ? 'pattern-card-overdue' : ''}`}>
      {/* Card accent bar top — inherits from problem-card::before via the parent class */}

      <div className="pattern-card-body">
        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 className="pattern-topic-name" style={{ margin: 0 }}>{name}</h3>
          <span className="badge pattern-count-badge">
            {problem_count} {problem_count === 1 ? 'problem' : 'problems'}
          </span>
        </div>

        {/* ── Status + low-coverage ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          {statusBadge}
          {isLowCoverage && (
            <span className="badge pattern-low-coverage" title="Only 1 problem solved. Solve more to reinforce this pattern.">
              ⚠ Low coverage
            </span>
          )}
        </div>

        {/* ── Last practiced line ── */}
        <div className="problem-meta" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Last practiced:{' '}
          <span style={{ color: 'var(--text-primary)' }}>
            {last_practiced ? relativeDate(last_practiced) : 'never'}
          </span>
          {next_due && !is_overdue && (
            <>
              {' '}&bull;{' '}Next due:{' '}
              <span style={{ color: 'var(--text-primary)' }}>
                {new Date(next_due).toLocaleDateString('en-GB')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Footer action ── */}
      <a
        href={lcUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary pattern-find-btn"
        style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
      >
        Find a Problem →
      </a>
    </div>
  );
}

// ── Sidebar summary ───────────────────────────────────────────────────────────

function PatternSidebar({ topics, user }) {
  const total = topics.length;
  const overdue = topics.filter(t => t.is_overdue).length;
  const healthy = total - overdue;
  const lowCoverage = topics.filter(t => t.problem_count === 1).length;

  return (
    <aside className="sidebar">
      {/* Profile strip */}
      <div
        className="profile-card"
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '16px', background: 'var(--bg-card)',
          borderRadius: '12px', marginBottom: '1rem',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="profile-avatar"
          style={{
            fontSize: '1.5rem', background: 'var(--bg-secondary)',
            width: '40px', height: '40px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
          }}
        >
          🧩
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            className="profile-name"
            style={{ margin: 0, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {user?.email?.split('@')[0]}
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pattern Health</span>
        </div>
      </div>

      {/* Stats */}
      <div className="sidebar-section" style={{ marginTop: 0 }}>
        <h4 className="section-header">Summary</h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[
            { label: 'Total Topics', value: total, color: 'var(--text-primary)' },
            { label: 'Overdue', value: overdue, color: overdue > 0 ? '#ff4d4d' : 'var(--success)' },
            { label: 'Healthy', value: healthy, color: 'var(--success)' },
            { label: 'Low Coverage', value: lowCoverage, color: '#f59e0b' },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>{label}</span>
              <span style={{ fontWeight: '700', fontSize: '1.1rem', color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Interval legend */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <h4 className="section-header">Interval Guide</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { range: '1 problem', days: '14 days' },
              { range: '2–4 problems', days: '30 days' },
              { range: '5–9 problems', days: '60 days' },
              { range: '10+ problems', days: '90 days' },
            ].map(({ range, days }) => (
              <div
                key={range}
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
              >
                <span>{range}</span>
                <span style={{ color: 'var(--accent-light)', fontWeight: '600' }}>{days}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── PatternHealth page ────────────────────────────────────────────────────────

export default function PatternHealth() {
  const { user } = useAuth();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'overdue' | 'healthy'

  const fetchPatternHealth = async () => {
    if (!user) return;
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(`${API_URL}/pattern-health?user_id=${user.id}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        // Topics arrive pre-sorted from the RPC (overdue first, then healthy by next_due)
        setTopics(data.topics || []);
      } else {
        toast.error('Failed to load pattern health data.');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        toast.error('Request timed out. Server might be sleeping.');
      } else {
        toast.error('Network error loading patterns.');
        console.error(err);
      }
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatternHealth();
  }, [user?.id]);

  const filteredTopics = topics.filter(t => {
    if (filter === 'overdue') return t.is_overdue;
    if (filter === 'healthy') return !t.is_overdue;
    return true;
  });

  const overdueCount = topics.filter(t => t.is_overdue).length;

  if (loading) return <LoadingScreen />;

  return (
    <>
      <CursorBackground />
      <div className="dashboard-container">
        <Toaster position="top-center" />

        <PatternSidebar topics={topics} user={user} />

        <main className="main-content">
          {/* ── Action bar ── */}
          <div className="action-bar">
            <div>
              <h2 style={{ margin: 0 }}>Pattern Health</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                Topic-level spaced repetition — independent of per-problem schedule
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {overdueCount > 0 && (
                <span
                  className="badge"
                  style={{ background: '#ff4d4d', color: 'white', fontSize: '0.9rem', padding: '4px 8px' }}
                >
                  🔔 {overdueCount} stale
                </span>
              )}
              {/* Nav back to dashboard */}
              <Link to="/" className="btn-secondary" style={{ padding: '0.6rem 1.2rem', textDecoration: 'none' }}>
                ← Dashboard
              </Link>
            </div>
          </div>

          {/* ── Main nav tabs (mirrors Dashboard tab style) ── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="difficulty-tabs" style={{ width: 'fit-content' }}>
              <span
                className={`tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({topics.length})
              </span>
              <span
                className={`tab ${filter === 'overdue' ? 'active' : ''}`}
                onClick={() => setFilter('overdue')}
              >
                Overdue ({overdueCount})
              </span>
              <span
                className={`tab ${filter === 'healthy' ? 'active' : ''}`}
                onClick={() => setFilter('healthy')}
              >
                Healthy ({topics.length - overdueCount})
              </span>
            </div>
          </div>

          {/* ── Topic cards grid ── */}
          {filteredTopics.length === 0 ? (
            <div
              style={{
                padding: '3rem 2rem',
                textAlign: 'center',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {topics.length === 0 ? (
                <>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🧩</div>
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    No patterns tracked yet
                  </h3>
                  <p>
                    Add problems with topics on the{' '}
                    <Link to="/" style={{ color: 'var(--accent-light)' }}>Dashboard</Link>{' '}
                    to start tracking pattern health.
                  </p>
                </>
              ) : (
                <>🎉 No {filter} topics right now.</>
              )}
            </div>
          ) : (
            <div className="due-problems-grid pattern-grid">
              {filteredTopics.map(t => (
                <PatternCard key={t.topic} topic={t} />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
