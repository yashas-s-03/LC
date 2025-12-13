import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AddProblemForm from './components/AddProblemForm';
import ProblemCard from './components/ProblemCard';
import { API_URL } from './config';

import toast, { Toaster } from 'react-hot-toast';

function Dashboard() {
  const { user, signOut } = useAuth();
  const [dueProblems, setDueProblems] = useState([]);
  const [allProblems, setAllProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

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
    fetchData();
  }, [user]);

  return (
    <div className="dashboard">
      <Toaster position="top-right" />
      <header>
        <h1>LeetCode Revision</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={signOut} className="btn-secondary">Logout</button>
        </div>
      </header>
      <main>
        {/* Stats Section */}
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Problems</h3>
            <div className="value">{allProblems.length}</div>
          </div>
          <div className="stat-card">
            <h3>Due Today</h3>
            <div className="value">{dueProblems.length}</div>
          </div>
          <div className="stat-card">
            <h3>Difficulty</h3>
            <div className="difficulty-breakdown">
              <span className="badge Easy">Easy: {allProblems.filter(p => p.difficulty === 'Easy').length}</span>
              <span className="badge Medium">Med: {allProblems.filter(p => p.difficulty === 'Medium').length}</span>
              <span className="badge Hard">Hard: {allProblems.filter(p => p.difficulty === 'Hard').length}</span>
            </div>
          </div>
        </div>

        {/* Top Section: Add Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Your Dashboard</h2>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
            {showAddForm ? 'Cancel' : '+ Add Problem'}
          </button>
        </div>

        {showAddForm && <AddProblemForm onProblemAdded={() => {
          setShowAddForm(false);
          fetchData();
          toast.success("Problem Added!");
        }} />}

        {/* Due Problems Section */}
        <h3 className="section-title">🔥 Due for Revision</h3>
        <div className="problems-grid">
          {loading ? (
            <p>Loading...</p>
          ) : dueProblems.length === 0 ? (
            <p style={{ color: '#8b949e' }}>🎉 No problems due right now. Great job!</p>
          ) : (
            dueProblems.map(p => (
              <ProblemCard key={p.id} problem={p} onRevised={() => {
                fetchData();
                toast.success("Marked as Revised!");
              }} />
            ))
          )}
        </div>

        {/* History Section */}
        <h3 className="section-title" style={{ marginTop: '3rem' }}>📚 All Problems History</h3>
        <div className="history-container">
          {allProblems.length === 0 ? <p>No problems found.</p> : (
            <table className="history-table">
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Topics</th>
                  <th>Difficulty</th>
                  <th>Revisions</th>
                  <th>Next Due</th>
                </tr>
              </thead>
              <tbody>
                {allProblems.map(p => (
                  <tr key={p.id}>
                    <td>
                      <a href={p.url} target="_blank" rel="noreferrer" className="problem-link">{p.title}</a>
                    </td>
                    <td>{p.topics}</td>
                    <td><span className={`badge ${p.difficulty}`}>{p.difficulty}</span></td>
                    <td>{p.revision_count}</td>
                    <td>{new Date(p.next_revision_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
