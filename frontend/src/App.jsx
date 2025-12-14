import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AddProblemForm from './components/AddProblemForm';
import ProblemCard from './components/ProblemCard';
import CursorBackground from './components/CursorBackground';
import NoteModal from './components/NoteModal';
import LoadingScreen from './components/LoadingScreen';

import { API_URL } from './config';
import toast, { Toaster } from 'react-hot-toast';

function Dashboard() {
  const { user, signOut } = useAuth();
  const [dueProblems, setDueProblems] = useState([]);
  const [allProblems, setAllProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [difficultyFilter, setDifficultyFilter] = useState(null); // null, 'Easy', 'Medium', 'Hard'
  const [topicFilter, setTopicFilter] = useState(null); // null or 'Dynamic Programming', etc.
  const [showAllProblems, setShowAllProblems] = useState(false); // For "Show More" functionality
  const [selectedProblemForNotes, setSelectedProblemForNotes] = useState(null); // For Note Modal

  // Re-fetch function to refresh data
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Due Problems
      const resDue = await fetch(`${API_URL}/dashboard?user_id=${user.id}`);
      if (resDue.ok) {
        setDueProblems(await resDue.json());
      }

      // 2. Fetch All Problems
      const resAll = await fetch(`${API_URL}/problems?user_id=${user.id}`);
      if (resAll.ok) {
        setAllProblems(await resAll.json());
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
      toast.error("Network error. Check connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user?.id]);

  const deleteProblem = (problemId) => {
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        <b style={{ color: 'black' }}>Delete this problem?</b>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => {
              performDelete(problemId);
              toast.dismiss(t.id);
            }}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Delete
          </button>
          <button
            onClick={() => toast.dismiss(t.id)}
            style={{
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    ), {
      duration: 5000,
      position: 'top-center',
      style: { border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }
    });
  };

  const performDelete = async (problemId) => {
    try {
      const res = await fetch(`${API_URL}/problems/${problemId}?user_id=${user.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success("Problem deleted");
        fetchData();
      } else {
        toast.error("Failed to delete");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting problem");
    }
  };

  const handleUpdateNote = (id, newNote) => {
    // Optimistically update local state
    setAllProblems(prev => prev.map(p =>
      p.id === id ? { ...p, notes: newNote } : p
    ));
    setDueProblems(prev => prev.map(p =>
      p.id === id ? { ...p, notes: newNote } : p
    ));
  };

  // Helper to handle Timezone Rollover issues (Naive -> UTC -> Local +5:30 shift)
  // Ensures dates late at night don't push to the next day
  const parseDate = (dateString) => {
    if (!dateString) return null;
    const d = new Date(dateString);
    // If we detect usage in +5:30 timezone (India) and date is early morning, it likely rolled over.
    // We strictly subtract 6 hours to pull 00:00-05:59 back to the previous day.
    d.setHours(d.getHours() - 6);
    return d;
  };

  // Helper for relative time
  const timeAgo = (dateString) => {
    if (!dateString) return 'Never';
    const date = parseDate(dateString);
    const now = new Date();

    let diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 0 && diffInSeconds > -60) diffInSeconds = 0;
    if (diffInSeconds < 0) return date.toLocaleDateString('en-GB');
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString('en-GB');
  };

  const getReviewStatus = (dateStr) => {
    if (!dateStr) return { color: 'var(--text-secondary)', label: '-' };
    const due = parseDate(dateStr);
    const now = new Date();
    due.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    const diffDays = (due - now) / (1000 * 60 * 60 * 24);

    if (diffDays <= 0 && diffDays > -1) return { color: '#ff4d4d', label: 'Due Today', isUrgent: true }; // Red
    if (diffDays <= -1 && diffDays > -2) return { color: '#c0392b', label: 'Due Yesterday', isUrgent: true }; // Darker Red
    if (diffDays <= -2) return { color: '#900c3f', label: `Overdue (${Math.abs(Math.floor(diffDays))}d)`, isUrgent: true }; // Dark Crimson
    if (diffDays <= 2) return { color: '#ff9f43', label: 'Soon' };    // Yellow
    return { color: '#2ecc71', label: due.toLocaleDateString('en-GB') }; // Green
  };

  // --- Skill / Topic Logic ---
  const ADVANCED_TOPICS = ['Dynamic Programming', 'Graph', 'Backtracking', 'Trie', 'Union Find', 'Segment Tree', 'Monotonic Stack', 'Bit Manipulation'];
  const INTERMEDIATE_TOPICS = ['Hash Table', 'Tree', 'Binary Search', 'Stack', 'Heap', 'Greedy', 'Linked List', 'Sliding Window', 'Design'];

  const getTopicStats = useMemo(() => {
    const counts = {};
    if (!allProblems) return { Advanced: [], Intermediate: [], Fundamental: [] };

    allProblems.forEach(p => {
      if (!p.topics) return;
      let tList = [];
      if (Array.isArray(p.topics)) tList = p.topics;
      else if (typeof p.topics === 'string') tList = p.topics.split(',').map(t => t.trim());

      tList.forEach(topic => {
        if (topic) counts[topic] = (counts[topic] || 0) + 1;
      });
    });

    const categories = { Advanced: [], Intermediate: [], Fundamental: [] };

    Object.keys(counts).forEach(topic => {
      if (ADVANCED_TOPICS.includes(topic)) categories.Advanced.push({ name: topic, count: counts[topic] });
      else if (INTERMEDIATE_TOPICS.includes(topic)) categories.Intermediate.push({ name: topic, count: counts[topic] });
      else categories.Fundamental.push({ name: topic, count: counts[topic] }); // Default to fundamental
    });

    // Sort by count desc
    categories.Advanced.sort((a, b) => b.count - a.count);
    categories.Intermediate.sort((a, b) => b.count - a.count);
    categories.Fundamental.sort((a, b) => b.count - a.count);

    return categories;
  }, [allProblems]);
  // Filter problems by difficulty
  // Filter problems by difficulty AND topic
  const filteredProblems = useMemo(() => {
    let res = allProblems;
    if (difficultyFilter) {
      res = res.filter(p => p.difficulty === difficultyFilter);
    }
    if (topicFilter) {
      res = res.filter(p => {
        if (!p.topics) return false;
        const pts = Array.isArray(p.topics) ? p.topics : p.topics.split(',').map(t => t.trim());
        return pts.includes(topicFilter);
      });
    }
    return res;
  }, [allProblems, difficultyFilter, topicFilter]);

  // Header stats for Left Sidebar
  const easyCount = allProblems.filter(p => p.difficulty === 'Easy').length;
  const mediumCount = allProblems.filter(p => p.difficulty === 'Medium').length;
  const hardCount = allProblems.filter(p => p.difficulty === 'Hard').length;

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <div className="dashboard-container">
        <Toaster position="top-center" />

        {/* Left Sidebar (Profile & Langs) */}
        <aside className="sidebar">
          <div className="profile-card">
            <div className="profile-avatar">🧠</div>
            <h3 className="profile-name">{user.email.split('@')[0]}</h3>
          </div>

          <div className="sidebar-section" style={{ marginTop: '0' }}>
            <h4 className="section-header">Stats</h4>
            <div className="sidebar-stats-container">
              <div className="stat-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Solved</span>
                <span style={{ fontWeight: '700', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{allProblems.length}</span>
              </div>

              <div className="difficulty-breakdown sidebar-breakdown">
                <div
                  className="diff-row"
                  onClick={() => setDifficultyFilter('Easy')}
                  title="Show Easy Problems"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
                >
                  <span className="diff-label easy" style={{ fontWeight: '500' }}>Easy</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{easyCount}</span>
                </div>
                <div
                  className="diff-row"
                  onClick={() => setDifficultyFilter('Medium')}
                  title="Show Medium Problems"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
                >
                  <span className="diff-label medium" style={{ fontWeight: '500' }}>Med.</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{mediumCount}</span>
                </div>
                <div
                  className="diff-row"
                  onClick={() => setDifficultyFilter('Hard')}
                  title="Show Hard Problems"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
                >
                  <span className="diff-label hard" style={{ fontWeight: '500' }}>Hard</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{hardCount}</span>
                </div>
              </div>
            </div>

            {/* Skills Section */}
            {allProblems.length > 0 && (
              <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h4 className="section-header">Skills</h4>
                {['Advanced', 'Intermediate', 'Fundamental'].map(cat => {
                  const skills = getTopicStats[cat];
                  if (!skills || skills.length === 0) return null;
                  return (
                    <div key={cat} style={{ marginBottom: '1rem' }}>
                      <div style={{ color: cat === 'Advanced' ? '#ff6b6b' : cat === 'Intermediate' ? '#feca57' : '#2ecc71', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></span>
                        {cat}
                      </div>
                      <div className="skills-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {skills.slice(0, 6).map(s => {
                          const isActive = topicFilter === s.name;
                          return (
                            <span
                              key={s.name}
                              onClick={() => setTopicFilter(isActive ? null : s.name)}
                              style={{
                                background: isActive ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: isActive ? 'white' : 'var(--text-secondary)',
                                padding: '4px 10px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                border: isActive ? 'none' : '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: isActive ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none'
                              }}
                            >
                              {s.name} <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>x{s.count}</span>
                            </span>
                          );
                        })}
                        {skills.length > 6 && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', paddingLeft: '4px' }}>...</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          <button onClick={signOut} className="btn-secondary side-logout">Logout</button>
        </aside>

        {/* Main Content (Stats, Heatmap, History) */}
        <main className="main-content">

          {/* Action Header */}
          <div className="action-bar">
            <h2 style={{ margin: 0 }}>Dashboard</h2>
            <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
              {showAddForm ? 'Close Form' : '+ Add Problem'}
            </button>
          </div>

          {showAddForm && <AddProblemForm onProblemAdded={() => {
            setShowAddForm(false);
            fetchData();
            toast.success("Problem Added!");
          }} />
          }





          <div style={{ marginBottom: '2rem', marginTop: '1rem' }}>
            <h4 style={{ color: '#ff9f43', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Due for Revision
              {dueProblems.length > 0 && <span className="badge" style={{ background: '#ff4d4d', color: 'white', fontSize: '0.9rem', padding: '4px 8px' }}>🔔 {dueProblems.length}</span>}
            </h4>
            {dueProblems.filter(p => !difficultyFilter || p.difficulty === difficultyFilter).length > 0 ? (
              <div className="due-problems-grid">
                {dueProblems.filter(p => !difficultyFilter || p.difficulty === difficultyFilter).map(p => (
                  <ProblemCard
                    key={p.id}
                    problem={p}
                    onRevised={() => { fetchData(); toast.success("Refreshed!"); }}
                    onDelete={() => deleteProblem(p.id)}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius)',
                border: '1px dashed var(--border)',
                color: 'var(--text-secondary)'
              }}>
                🎉 All caught up! No {difficultyFilter} problems due for revision right now.
              </div>
            )}
          </div>

          {/* Bottom Row: Recent AC */}
          <div className="recent-ac-section" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                {topicFilter ? `Topic: ${topicFilter}` : difficultyFilter ? `${difficultyFilter} Problems` : 'Recent Problems'}
              </h3>

              {/* Difficulty Tabs */}
              <div className="difficulty-tabs">
                <span className={!difficultyFilter ? "tab active" : "tab"} onClick={() => setDifficultyFilter(null)}>All ({allProblems.length})</span>
                <span className={difficultyFilter === 'Easy' ? "tab active" : "tab"} onClick={() => setDifficultyFilter('Easy')}>Easy ({easyCount})</span>
                <span className={difficultyFilter === 'Medium' ? "tab active" : "tab"} onClick={() => setDifficultyFilter('Medium')}>Medium ({mediumCount})</span>
                <span className={difficultyFilter === 'Hard' ? "tab active" : "tab"} onClick={() => setDifficultyFilter('Hard')}>Hard ({hardCount})</span>
              </div>
            </div>



            <div className="history-container card">
              <div className="table-responsive">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Title</th>
                      <th>Difficulty</th>
                      <th>Last Solved</th>
                      <th>Next Review</th>
                      <th>Rev. Count</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProblems.slice(0, showAllProblems ? filteredProblems.length : 10).map(p => (
                      <tr key={p.id}>
                        <td><a href={p.url} className="problem-link" target="_blank" rel="noopener noreferrer">{p.title}</a></td>
                        <td><span className={`badge ${p.difficulty}`}>{p.difficulty}</span></td>
                        <td>{timeAgo(p.solved_date)}</td>
                        <td>
                          {(() => {
                            const status = getReviewStatus(p.next_revision_date);
                            return <span style={{ color: status.color, fontWeight: status.isUrgent ? 'bold' : 'normal' }}>{status.label}</span>
                          })()}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.revision_count || 0}</td>
                        <td>
                          <button
                            onClick={() => setSelectedProblemForNotes(p)}
                            className="btn-icon-note"
                            title="View/Edit Notes"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', marginRight: '8px'
                            }}
                          >
                            📝
                          </button>
                          <button onClick={() => deleteProblem(p.id)} className="btn-icon-delete" title="Delete Problem">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredProblems.length > 10 && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <button
                    onClick={() => setShowAllProblems(!showAllProblems)}
                    className="btn-secondary"
                    style={{
                      padding: '0.75rem 2rem',
                      fontSize: '0.95rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    {showAllProblems ? (
                      <>Show Less ▲</>
                    ) : (
                      <>Show More ({filteredProblems.length - 10} more) ▼</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>


          {selectedProblemForNotes && (
            <NoteModal
              problem={selectedProblemForNotes}
              onClose={() => setSelectedProblemForNotes(null)}
              onSave={handleUpdateNote}
            />
          )}

        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
