import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import AddProblemForm from './components/AddProblemForm';
import ProblemCard from './components/ProblemCard';
import { API_URL } from './config';

function Dashboard() {
  const { user, signOut } = useAuth();
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/dashboard?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setProblems(data);
      }
    } catch (err) {
      console.error("Failed to fetch problems", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProblems();
  }, [user]);

  return (
    <div className="dashboard">
      <header>
        <h1>LeetCode Revision</h1>
        <div className="user-info">
          <span>{user.email}</span>
          <button onClick={signOut} className="btn-secondary">Logout</button>
        </div>
      </header>
      <main>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Your Dashboard</h2>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary">
            {showAddForm ? 'Cancel' : '+ Add Problem'}
          </button>
        </div>

        {showAddForm && <AddProblemForm onProblemAdded={() => { setShowAddForm(false); fetchProblems(); }} />}

        <h3>Due for Revision</h3>

        {loading ? (
          <p>Loading...</p>
        ) : problems.length === 0 ? (
          <p style={{ color: '#8b949e' }}>🎉 No problems due for revision right now!</p>
        ) : (
          problems.map(p => (
            <ProblemCard key={p.id} problem={p} onRevised={fetchProblems} />
          ))
        )}
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
