import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../config';
import toast, { Toaster } from 'react-hot-toast';
import CursorBackground from '../components/CursorBackground';

// ── Helper ────────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return null;
  const d   = new Date(isoString);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60)   return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ── Settings Page ─────────────────────────────────────────────────────────────

export default function Settings() {
  const { user } = useAuth();

  const [username,     setUsername]     = useState('');
  const [savedUsername, setSavedUsername] = useState('');
  const [lastSynced,   setLastSynced]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [syncResult,   setSyncResult]   = useState(null);
  const [loadingInit,  setLoadingInit]  = useState(true);

  // ── Load existing settings ────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/user-settings?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setUsername(data.leetcode_username || '');
        setSavedUsername(data.leetcode_username || '');
        setLastSynced(data.last_synced_at || null);
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoadingInit(false);
    }
  }, [user?.id]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ── Save username ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!username.trim()) {
      toast.error('Username cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/user-settings`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ user_id: user.id, leetcode_username: username.trim() }),
      });
      if (res.ok) {
        setSavedUsername(username.trim());
        toast.success('Settings saved!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save settings');
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  };

  // ── Sync now ──────────────────────────────────────────────────────────────
  const handleSyncNow = async () => {
    if (!savedUsername) {
      toast.error('Save your LeetCode username first');
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    const toastId = toast.loading('Syncing with LeetCode...');
    try {
      const res = await fetch(`${API_URL}/sync/leetcode?user_id=${user.id}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(data);
        setLastSynced(new Date().toISOString());
        toast.success(
          `Sync complete! ${data.new_problems} new, ${data.reinforced_topics} topics reinforced`,
          { id: toastId, duration: 5000 }
        );
      } else {
        toast.error(data.detail || 'Sync failed', { id: toastId });
      }
    } catch (e) {
      toast.error('Network error during sync', { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <CursorBackground />
      <Toaster position="top-center" />

      <div
        style={{
          minHeight:       '100vh',
          background:      'var(--bg-secondary)',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          padding:         '2rem 1rem',
        }}
      >
        {/* ── Nav bar ── */}
        <div
          style={{
            width:           '100%',
            maxWidth:        '720px',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            marginBottom:    '2rem',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Link to="/"        className="main-nav-tab" style={{ textDecoration: 'none' }}>📋 Problems</Link>
            <Link to="/patterns" className="main-nav-tab" style={{ textDecoration: 'none' }}>🧩 Patterns</Link>
            <span className="main-nav-tab main-nav-tab-active">⚙ Settings</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {user?.email?.split('@')[0]}
          </span>
        </div>

        {/* ── Page title ── */}
        <div style={{ width: '100%', maxWidth: '720px', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>Settings</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Configure LeetCode auto-sync and account preferences
          </p>
        </div>

        {/* ── LeetCode Integration card ── */}
        <div className="card" style={{ width: '100%', maxWidth: '720px', marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔗</span> LeetCode Integration
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            Connect your public LeetCode profile. Once connected, accepted submissions are
            automatically synced hourly and update your Pattern Health scores.
          </p>

          {/* Username field */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label
                style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}
              >
                LeetCode Username
              </label>
              <input
                className="input-field"
                type="text"
                placeholder="e.g. neal_wu"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                disabled={loadingInit}
                style={{ margin: 0 }}
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || loadingInit || username.trim() === savedUsername}
              style={{ height: '42px', whiteSpace: 'nowrap' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>

          {savedUsername && (
            <p style={{ margin: '10px 0 0', fontSize: '0.82rem', color: 'var(--success)' }}>
              ✓ Connected as <strong>{savedUsername}</strong>
            </p>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

          {/* Sync now row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Sync Now</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {lastSynced
                  ? <>Last synced <strong>{timeAgo(lastSynced)}</strong> — {new Date(lastSynced).toLocaleString()}</>
                  : 'Never synced'}
              </div>
            </div>
            <button
              className="btn-primary"
              onClick={handleSyncNow}
              disabled={syncing || !savedUsername}
              style={{ minWidth: '130px' }}
            >
              {syncing ? 'Syncing…' : '⚡ Sync Now'}
            </button>
          </div>

          {/* Sync result */}
          {syncResult && (
            <div
              style={{
                marginTop:    '1rem',
                padding:      '0.75rem 1rem',
                background:   'rgba(16, 185, 129, 0.1)',
                border:       '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                fontSize:     '0.88rem',
                display:      'flex',
                gap:          '1.5rem',
                flexWrap:     'wrap',
              }}
            >
              <span>🆕 <strong>{syncResult.new_problems}</strong> new problems</span>
              <span>🔁 <strong>{syncResult.reinforced_topics}</strong> topics reinforced</span>
              <span>⏭ <strong>{syncResult.skipped_duplicates}</strong> already processed</span>
            </div>
          )}
        </div>

        {/* ── How it works card ── */}
        <div className="card" style={{ width: '100%', maxWidth: '720px' }}>
          <h3 style={{ marginTop: 0 }}>How auto-sync works</h3>
          <ul style={{ color: 'var(--text-secondary)', lineHeight: '1.8', paddingLeft: '1.25rem', margin: 0 }}>
            <li>
              Every hour, Revisee polls your LeetCode accepted submissions (last 20) using
              LeetCode's public GraphQL API — <strong>no login or cookies required</strong>.
            </li>
            <li>
              A <strong>new</strong> problem gets added to your dashboard automatically with
              difficulty, topics, and a 3-day first-revision reminder.
            </li>
            <li>
              A problem you've <strong>already added manually</strong> just gets a pattern
              activity log entry — it never resets your spaced-repetition schedule.
            </li>
            <li>
              Auto-synced problems are marked <strong>🤖 Auto-synced</strong> and flagged
              <strong>🏷 Needs tags</strong> if you'd like to refine the LeetCode-assigned
              topic tags with your own pattern vocabulary.
            </li>
            <li>
              Your profile must be <strong>public</strong> on LeetCode for sync to work.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
