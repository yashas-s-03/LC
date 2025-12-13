import { API_URL } from '../config';
import { useAuth } from '../context/AuthContext';

export default function ProblemCard({ problem, onRevised }) {
    const { user } = useAuth();

    const handleRevise = async () => {
        if (!confirm('Mark this problem as revised? It will be rescheduled.')) return;

        try {
            const response = await fetch(`${API_URL}/revise/${problem.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id })
            });

            if (response.ok) {
                onRevised();
            } else {
                alert('Failed to mark as revised');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const getDifficultyColor = (diff) => {
        switch (diff) {
            case 'Easy': return '#00b8a3';
            case 'Medium': return '#ffc01e';
            case 'Hard': return '#ff375f';
            default: return '#fff';
        }
    };

    return (
        <div className="problem-card" style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>
                        {problem.url ? (
                            <a href={problem.url} target="_blank" rel="noopener noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>
                                {problem.title}
                            </a>
                        ) : problem.title}
                    </h3>
                    <span style={{
                        color: getDifficultyColor(problem.difficulty),
                        fontSize: '0.8rem',
                        border: `1px solid ${getDifficultyColor(problem.difficulty)}`,
                        padding: '2px 6px',
                        borderRadius: '12px'
                    }}>
                        {problem.difficulty}
                    </span>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#8b949e' }}>
                    Next Review: {new Date(problem.next_revision_date).toLocaleDateString()}
                    {' • '}
                    Revison Count: {problem.revision_count}
                </div>
                {problem.notes && <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>📝 {problem.notes}</div>}
            </div>

            <button onClick={handleRevise} className="btn-primary">
                Mark Revised
            </button>
        </div>
    );
}
