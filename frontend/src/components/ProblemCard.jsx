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
                    Next Review: {new Date(problem.next_revision_date).toLocaleDateString()}
                    {' • '}
                    Revison Count: {problem.revision_count}
                </div>
                {problem.notes && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#c9d1d9' }}>📝 {problem.notes}</div>}
            </div>

            <button onClick={handleRevise} className="btn-primary" style={{ width: 'auto' }}>
                Mark Revised
            </button>
        </div>
    );
}
