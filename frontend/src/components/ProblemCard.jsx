import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

export default function ProblemCard({ problem, onRevised }) {
    const { user } = useAuth();

    const handleRevise = async () => {
        try {
            const response = await fetch(`${API_URL}/revise/${problem.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id })
            });

            if (response.ok) {
                onRevised();
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Date Helpers (Duplicated from App.jsx for self-contained component)
    const parseDate = (dateString) => {
        if (!dateString) return null;
        const d = new Date(dateString);
        d.setHours(d.getHours() - 6); // Timezone fix
        return d;
    };

    const getReviewStatus = (dateStr) => {
        if (!dateStr) return { color: 'var(--text-secondary)', label: '-' };
        const due = parseDate(dateStr);
        const now = new Date();
        due.setHours(0, 0, 0, 0);
        now.setHours(0, 0, 0, 0);
        const diffDays = (due - now) / (1000 * 60 * 60 * 24);

        if (diffDays <= 0 && diffDays > -1) return { color: '#ff4d4d', label: 'Due Today', isUrgent: true };
        if (diffDays <= -1 && diffDays > -2) return { color: '#c0392b', label: 'Due Yesterday', isUrgent: true };
        if (diffDays <= -2) return { color: '#900c3f', label: `Overdue (${Math.abs(Math.floor(diffDays))}d)`, isUrgent: true };
        if (diffDays <= 2) return { color: '#ff9f43', label: 'Soon' };
        return { color: '#2ecc71', label: due.toLocaleDateString('en-GB') };
    };

    const status = getReviewStatus(problem.next_revision_date);

    return (
        <div className="problem-card">
            <div className="problem-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h3>
                        {problem.url ? (
                            <a href={problem.url} target="_blank" rel="noopener noreferrer" className="problem-link">
                                {problem.title}
                            </a>
                        ) : problem.title}
                    </h3>
                    <span className={`badge ${problem.difficulty}`}>
                        {problem.difficulty}
                    </span>
                </div>
                <div className="problem-meta">
                    <span style={{ color: status.color, fontWeight: 'bold' }}>
                        {status.label}
                    </span>
                    {' • '}
                    Revison Count: {problem.revision_count}
                </div>
                {problem.notes && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#c9d1d9', fontStyle: 'italic' }}>📝 {problem.notes}</div>}
            </div>

            <button onClick={handleRevise} className="btn-primary" style={{ width: 'auto' }}>
                Mark Revised
            </button>
        </div>
    );
}
